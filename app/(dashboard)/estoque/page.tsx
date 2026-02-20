"use client";

import { useState, useEffect } from "react"; // Removido useMemo daqui
import { useDashboard } from "@/providers/dashboard-context"; 
import {
  ColumnDef, flexRender, getCoreRowModel, useReactTable,
  getExpandedRowModel, getPaginationRowModel, ExpandedState, getSortedRowModel, SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronRight, Factory, Truck, Maximize2, Minimize2, FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx';
import { DashboardHeader } from "@/components/header";
import Link from "next/link";
import { ExternalLink, TrendingUp } from "lucide-react";

// Formatadores
const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);
const fPerc = (v: number) => new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 }).format((v || 0) / 100);

export default function EstoquePage() {
  // Pega os dados já processados, filtrados e com SKU do pai corrigido do Contexto
  const { processedData, canal, search } = useDashboard(); // Adicione 'search' aqui
  
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- EXPORTAÇÃO XLSX ---
  // (Mantém a lógica de exportação, mas usando processedData que já vem pronto)
  const exportToExcel = () => {
    const isSite = canal === 'site';
    const dataToExport: any[] = [];

    processedData.forEach((parent: any) => {
      const processItem = (row: any, isParentRow: boolean) => {
        const precoVenda = isSite ? (row.ultimo_preco_site || row.preco_venda_padrao) : row.preco_venda_padrao;
        const markup = row.custo_final > 0 ? ((precoVenda - row.custo_final) / row.custo_final) : 0;
        
        // 1. Colunas Iniciais (Fixas até o índice 5)
        const item: any = {
          "SKU": row.sku,
          "nome": row.nome,
          "venda": Number(precoVenda || 0), 
          "custo médio": Number(row.custo_final || 0),
          "Markup (em %)": Number(markup || 0),
          "estoque": isParentRow ? 0 : Number(isSite ? (row.est_site + row.est_full) : row.est_lo_total || row.est_loja),
        };

        // 2. Coluna Condicional (Índice 6 se for Site)
        if (isSite) {
          item["estoque full"] = isParentRow ? 0 : Number(row.est_full || 0);
        }

        // 3. Colunas Finais (Os índices aqui mudam, mas as chaves do objeto garantem a ordem)
        item["pedidos"] = isParentRow ? 0 : Number(isSite ? row.qtd_andamento_site : row.qtd_andamento_loja);
        item["vendas 30"] = isParentRow ? 0 : Number(isSite ? row.v_qtd_30d_site : row.v_qtd_30d_loja);
        item["vendas 60"] = isParentRow ? 0 : Number(isSite ? row.v_qtd_60d_site : row.v_qtd_60d_loja);
        item["vendas 90"] = isParentRow ? 0 : Number(isSite ? row.v_qtd_90d_site : row.v_qtd_90d_loja);
        item["Fornecedor"] = row.fornecedor;
        item["GTIN"] = row.gtin || "";
        item["GTIN Embalagem (GTIN2)"] = row.gtin_embalagem || "";

        return item;
      };

      dataToExport.push(processItem(parent, true));
      if (parent.children) {
        parent.children.forEach((child: any) => dataToExport.push(processItem(child, false)));
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // --- FORMATAÇÃO DE CÉLULAS (Índices 2, 3 e 4 são estáveis) ---
    const range = XLSX.utils.decode_range(worksheet['!ref']!);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const vendaCell = worksheet[XLSX.utils.encode_cell({r: R, c: 2})];
      const custoCell = worksheet[XLSX.utils.encode_cell({r: R, c: 3})];
      const markupCell = worksheet[XLSX.utils.encode_cell({r: R, c: 4})];

      if (vendaCell) vendaCell.z = '"R$" #,##0.00';
      if (custoCell) custoCell.z = '"R$" #,##0.00';
      if (markupCell) markupCell.z = '0.00%';
    }

    // --- AJUSTE DINÂMICO DE LARGURA (!cols) ---
    const baseWidths = [
      {wch: 15}, // SKU
      {wch: 50}, // nome
      {wch: 15}, // venda
      {wch: 15}, // custo médio
      {wch: 12}, // Markup
      {wch: 10}, // estoque
    ];

    // Se for site, adicionamos a largura da coluna "estoque full"
    if (isSite) {
      baseWidths.push({wch: 12}); 
    }

    // Colunas restantes
    const finalWidths = [
      ...baseWidths,
      {wch: 10}, // pedidos
      {wch: 10}, // v30
      {wch: 10}, // v60
      {wch: 10}, // v90
      {wch: 25}, // Fornecedor
      {wch: 15}, // GTIN
      {wch: 15}, // GTIN2
    ];

    worksheet['!cols'] = finalWidths;

    const workbook = XLSX.utils.book_new();
    const dataHoje = new Date().toLocaleDateString('pt-BR').replaceAll('/', '-');
    const nomeArquivo = `ESTOQUE E VENDAS ${canal.toUpperCase()} ${dataHoje}.xlsx`;
    XLSX.utils.book_append_sheet(workbook, worksheet, "Estoque");
    XLSX.writeFile(workbook, nomeArquivo);
  };

  // Auto-expandir ao pesquisar
  useEffect(() => {
    if (search.length > 0) {
      // Cria um objeto de expansão onde todas as linhas de nível 0 (pais) estão true
      const expansion: ExpandedState = {};
      table.getRowModel().rows.forEach(row => {
        if (row.original.isParent) expansion[row.id] = true;
      });
      setExpanded(expansion);
    } else {
      setExpanded({}); // Fecha tudo ao limpar a busca
    }
  }, [search, processedData.length]); // Executa quando a busca ou os dados mudam

  const columns: ColumnDef<any>[] = [
    {
      id: "expander", 
      header: "",
      cell: ({ row }) => (
        // Agora olha para a flag 'hasVariations' que criamos no contexto
        row.original.isParent && row.original.hasVariations
      ) && (
        <button 
          onClick={() => row.toggleExpanded()} 
          className="hover:bg-slate-200 rounded p-1"
        >
          <ChevronRight 
            size={14} 
            className={row.getIsExpanded() ? "rotate-90 transition-all" : "transition-all"}
          />
        </button>
      )
    },
    {
      accessorKey: "nome",
      header: ({ column }) => (
        <Button variant="ghost" size="sm" className="-ml-3 text-[10px] font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          PRODUTO <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const name = row.original.nome;
        const parentName = row.original.nome_pai;
        const displayName = (!row.original.isParent && parentName && name.includes(parentName)) 
          ? name.replace(parentName, "").replace(/^[:\s-]+/, "").trim() || name
          : name;

        return (
          <div className={row.original.isParent ? "font-bold text-slate-800" : "pl-6 text-xs text-slate-600"}>
            <div className="flex items-center gap-2">
              <span className="truncate max-w-[400px]">{displayName}</span>
              <Badge variant="outline" className="text-[9px] h-4 font-mono">{row.original.sku}</Badge>
            </div>
            {row.original.isParent && <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5"><Factory size={10}/> {row.original.fornecedor}</div>}
          </div>
        );
      }
    },
    {
      id: "estoque", 
      accessorFn: row => canal === 'loja' ? row.est_loja : canal === 'site' ? (row.est_site + row.est_full) : row.est_total,
      header: ({ column }) => (
        <Button variant="ghost" size="sm" className="-ml-3 h-8 text-[10px] uppercase font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Estoque <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const est = canal === 'loja' ? row.original.est_loja : canal === 'site' ? (row.original.est_site + row.original.est_full) : row.original.est_total;
        const dataUlt = row.original.data_ult_ent;
        const formattedDate = dataUlt ? new Date(dataUlt).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit'}) : null;
        return (
          <div className="flex flex-col">
            <div className="font-bold text-slate-700">
              {fNum(est)} 
              {canal !== 'loja' && row.original.est_full > 0 && <span className="text-[8px] bg-orange-100 text-orange-700 px-1 rounded ml-1">F: {row.original.est_full}</span>}
            </div>
            {formattedDate && (!row.original.isParent || row.original.children.length === 1) && (
              <span className="text-[9px] text-slate-400 font-medium leading-tight mt-0.5">Últ. Ent: {formattedDate}</span>
            )}
          </div>
        );
      }
    },
    {
      id: "pedidos", 
      accessorFn: row => row.isParent ? row.qtd_ped : row.qtd_ped_atual,
      header: ({ column }) => (
        <Button variant="ghost" size="sm" className="-ml-3 h-8 text-[10px] uppercase font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          A Chegar <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const qtd = row.original.isParent ? row.original.qtd_ped : row.original.qtd_ped_atual;
        if (!qtd || qtd <= 0) return <span className="text-slate-300">-</span>;
        if (!row.original.isParent) {
           const dataPrev = row.original.data_chegada_prevista;
           const fmtChegada = dataPrev ? new Date(dataPrev).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : null;
           return (
             <div className="flex flex-col">
               <div className="text-blue-600 font-bold flex items-center gap-1"><Truck size={10} /> {fNum(qtd)}</div>
               {fmtChegada && <span className="text-[9px] text-slate-400 font-medium leading-tight mt-0.5">Chega: {fmtChegada}</span>}
             </div>
           );
        }
        const modalItems = row.original.children.filter((c: any) => c.qtd_ped_atual > 0);
        return (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-blue-600 font-bold hover:bg-blue-50"><Truck size={12} className="mr-1"/> {fNum(qtd)}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle className="flex justify-between items-center pr-6">
                  <span>Pedidos em Andamento ({canal.toUpperCase()})</span>
                  
                  {/* NOVO BOTÃO DE COMUNICAÇÃO AQUI */}
                  <Link 
                    href={`/pedidos?busca=${encodeURIComponent(row.original.nome_pai || row.original.nome)}&canal=${canal}`} 
                    target="_blank"
                  >
                    <Button variant="outline" size="sm" className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                      Ver na Tela de Pedidos <ExternalLink size={14} />
                    </Button>
                  </Link>
                  
                </DialogTitle>
              </DialogHeader>
              <Table>
                <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Variação</TableHead><TableHead>Qtd</TableHead><TableHead>Previsão</TableHead><TableHead>Preço</TableHead></TableRow></TableHeader>
                <TableBody>
                  {modalItems.map((item: any) => {
                    const diff = (item.preco_no_pedido || 0) - (item.custo_ult_ent || 0);
                    return (
                      <TableRow key={item.sku}>
                        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                        <TableCell className="text-xs">{item.nome.replace(row.original.nome_pai, "").trim() || item.nome}</TableCell>
                        <TableCell>{fNum(item.qtd_ped_atual)}</TableCell>
                        <TableCell className="text-xs">{item.data_chegada_prevista ? new Date(item.data_chegada_prevista).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : "-"}</TableCell>
                        <TableCell className={diff > 0 ? "text-red-500 font-bold" : "text-green-600 font-bold"}>{fCurrency(item.preco_no_pedido)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </DialogContent>
          </Dialog>
        );
      }
    },
    {
      id: "vendas", header: "Vendas (30/60/90)",
      cell: ({ row }) => {
        const { v_30, v_60, v_90 } = row.original.isParent ? row.original : {
            v_30: canal === 'loja' ? row.original.v_qtd_30d_loja : canal === 'site' ? row.original.v_qtd_30d_site : (row.original.v_qtd_30d_loja + row.original.v_qtd_30d_site),
            v_60: canal === 'loja' ? row.original.v_qtd_60d_loja : canal === 'site' ? row.original.v_qtd_60d_site : (row.original.v_qtd_60d_loja + row.original.v_qtd_60d_site),
            v_90: canal === 'loja' ? row.original.v_qtd_90d_loja : canal === 'site' ? row.original.v_qtd_90d_site : (row.original.v_qtd_90d_loja + row.original.v_qtd_90d_site)
        };
        const parentName = row.original.nome_pai;
        const name = row.original.nome;

        return (
          <div className="flex items-center justify-between gap-2 max-w-[120px]">
            <div className="text-[10px] space-x-1">
              <b>{fNum(v_30)}</b><span className="opacity-60">/{fNum(v_60)}</span><span className="opacity-40">/{fNum(v_90)}</span>
            </div>
            {row.original.isParent && (
              <Link href={`/vendas?busca=${encodeURIComponent(parentName || name)}&canal=${canal}`} target="_blank">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-full shrink-0" title="Ver Análise de Vendas">
                  <TrendingUp size={12} />
                </Button>
              </Link>
            )}
          </div>
        );
      }
    },
{ 
      header: "Custo Méd", 
      cell: ({ row }) => {
        const custo = row.original.isParent ? (row.original.sum_unit_cost / row.original.count) : row.original.custo_final;
        return (
          <Popover>
            <PopoverTrigger className="cursor-help hover:text-blue-600 underline decoration-dotted decoration-slate-300 underline-offset-2">
              {fCurrency(custo)}
            </PopoverTrigger>
            <PopoverContent className="w-64 text-xs">
              <div className="font-bold mb-2 border-b pb-1">Composição do Custo</div>
              <div className="flex justify-between py-1">
                <span>Custo Calculado:</span> <b>{fCurrency(custo)}</b>
              </div>
              <div className="flex justify-between py-1 text-slate-500">
                <span>Última Entrada:</span> <span>{fCurrency(row.original.custo_ult_ent)}</span>
              </div>
              {/* NOVA LINHA AQUI: Custo Fixo (que vem do custo_padrao da View) */}
              <div className="flex justify-between py-1 text-slate-500">
                <span>Custo Fixo (Padrão):</span> <span>{fCurrency(row.original.custo_padrao)}</span>
              </div>
            </PopoverContent>
          </Popover>
        );
      }
    },
    {
      header: "Preço Venda",
      cell: ({ row }) => {
        const p = row.original.isParent ? (row.original.sum_preco / row.original.count) : (canal === 'site' ? (row.original.ultimo_preco_site || row.original.preco_venda_padrao) : row.original.preco_venda_padrao);
        return <span className="text-xs font-bold text-slate-700">{fCurrency(p)}</span>;
      }
    },
    {
      id: "markup",
      accessorFn: row => {
        const c = row.isParent ? (row.sum_unit_cost / (row.count || 1)) : (row.custo_final || 0);
        const p = row.isParent ? (row.sum_preco / (row.count || 1)) : (canal === 'site' ? (row.ultimo_preco_site || row.preco_venda_padrao) : row.preco_venda_padrao);
        return c > 0 ? ((p - c) / c) * 100 : -9999;
      },
      header: ({ column }) => (
        <Button variant="ghost" size="sm" className="-ml-3 h-8 text-[10px] uppercase font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Markup <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const c = row.original.isParent ? (row.original.sum_unit_cost / (row.original.count || 1)) : row.original.custo_final;
        const p = row.original.isParent ? (row.original.sum_preco / (row.original.count || 1)) : (canal === 'site' ? (row.original.ultimo_preco_site || row.original.preco_venda_padrao) : row.original.preco_venda_padrao);
        const mkp = c > 0 ? ((p - c) / c) * 100 : 0;
        return <Badge variant={mkp < 40 ? "destructive" : "outline"} className="text-[9px] h-4">{fPerc(mkp)}</Badge>;
      }
    }
  ];

const table = useReactTable({
    data: processedData,
    columns,
    state: { expanded, sorting },
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getSubRows: (row) => row.children,
    paginateExpandedRows: false,
    initialState: { pagination: { pageSize: 50 } }
  });

  return (
    <div className="space-y-6"> {/* Cria um espaçamento entre o header e a tabela */}
    <DashboardHeader />
    <Card className={cn("shadow-xl rounded-xl border-none overflow-hidden flex flex-col transition-all duration-300 bg-white", isFullscreen ? "fixed inset-0 z-50 m-0 rounded-none h-screen w-screen" : "h-[calc(100vh-180px)] relative")}>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={exportToExcel} className="h-8 bg-green-700 border-green-600 text-white hover:bg-green-600 gap-2 text-[11px] font-bold uppercase">
            <FileSpreadsheet size={14} /> EXPORTAR EXCEL
          </Button>
          <span className="text-slate-400 text-[10px] uppercase font-medium">
            {table.getFilteredRowModel().rows.length} GRUPOS / {processedData.reduce((acc, curr) => acc + curr.children.length, 0)} SKUS
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} className="h-8 w-8 p-0 text-slate-400 hover:text-white rounded-full">
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-white relative">
        <Table>
          <TableHeader className="bg-slate-800 sticky top-0 z-20 shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id} className="text-white text-[10px] uppercase font-bold h-10 px-4">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map(row => (
              <TableRow key={row.id} className={cn(row.original.isParent ? "bg-slate-50/80 font-semibold" : "hover:bg-slate-50 transition-colors")}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id} className="py-2 px-4 border-b border-slate-100 text-xs text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="p-3 flex items-center justify-between bg-slate-50 border-t shrink-0">
        <div className="text-[10px] text-muted-foreground uppercase font-bold">Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>ANTERIOR</Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>PRÓXIMA</Button>
        </div>
      </div>
    </Card>
    </div>
  );
}