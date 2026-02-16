"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  ColumnDef, flexRender, getCoreRowModel, useReactTable,
  getExpandedRowModel, getPaginationRowModel, ExpandedState, getSortedRowModel, SortingState,
} from "@tanstack/react-table";
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose 
} from "@/components/ui/sheet";
import { Filter, RotateCcw, ArrowUpDown, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, ChevronDown, ChevronRight, Package, TrendingUp, DollarSign, Factory, Truck } from "lucide-react";

// Formatadores
const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);
const fPerc = (v: number) => new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 }).format((v || 0) / 100);

export default function EstoquePage() {
  const supabase = createClient();
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [canal, setCanal] = useState<"geral" | "loja" | "site">("geral");
  const [search, setSearch] = useState("");
  const [filterForn, setFilterForn] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);

  // 1. FUNÇÃO DE CARGA (REUTILIZÁVEL)
  const fetchAll = async () => {
  setLoading(true);
  try {
    let allRows: any[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from("view_dashboard_completa")
        .select("*")
        .range(from, from + 999);
      
      if (error) throw error; // Se houver erro no banco, cai no catch

      if (!data || data.length === 0) hasMore = false;
      else {
        allRows = [...allRows, ...data];
        from += 1000;
        if (data.length < 1000) hasMore = false;
      }
    }
    console.log("Dados recebidos:", allRows.length); // Verifique o console do navegador (F12)
    setRawData(allRows);
  } catch (err) {
    console.error("Erro ao buscar dados:", err);
  } finally {
    setLoading(false);
  }
};

  // 2. CARGA INICIAL E REALTIME (ATUALIZAÇÃO AUTOMÁTICA)
  // 1. Crie a referência para o timer no topo do componente (antes dos useEffects)
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // 2. O useEffect do Realtime
  useEffect(() => {
    fetchAll(); // Carga inicial

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log("Mudança detectada em:", payload.table);
          
          // Lógica de Debounce com useRef
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }

          debounceRef.current = setTimeout(() => {
            console.log("🔄 Sincronizando Dashboard com o Banco...");
            fetchAll();
          }, 1500); // Aguarda 1.5s de silêncio no banco para atualizar
        }
      )
      .subscribe((status) => {
        console.log("Status do Realtime:", status);
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, []); // [] vazio para rodar apenas uma vez ao abrir a página

  
  // 3. PROCESSAMENTO DA TABELA (FILTROS)
  const processedData = useMemo(() => {
    let filtered = rawData;

    if (canal === "loja") {
      filtered = filtered.filter(p => p.est_loja > 0 || p.v_qtd_30d_loja > 0 || p.qtd_andamento_loja > 0);
    } else if (canal === "site") {
      filtered = filtered.filter(p => (p.est_site + p.est_full) > 0 || p.v_qtd_30d_site > 0 || p.qtd_andamento_site > 0);
    } else {
      filtered = filtered.filter(p => p.est_total > 0 || p.v_qtd_120d_geral > 0 || p.qtd_andamento > 0);
    }

    if (filterForn !== "all") filtered = filtered.filter(p => p.fornecedor === filterForn);
    if (filterCat !== "all") filtered = filtered.filter(p => p.categoria === filterCat);
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(p => p.sku.toLowerCase().includes(s) || p.nome.toLowerCase().includes(s));
    }

    const groups: Record<string, any> = {};

    filtered.forEach(p => {
      const key = p.nome_pai || p.nome;
      
      // 1. Inicializa o Grupo (Pai) se não existir
      if (!groups[key]) {
        groups[key] = {
          ...p,
          nome: key,
          isParent: true,
          children: [],
          est_total: 0, est_loja: 0, est_site: 0, est_full: 0,
          v_30: 0, v_60: 0, v_90: 0, 
          r_30: 0, r_60: 0, r_90: 0,
          r_30_pf: 0, r_30_cm: 0, r_30_full: 0, r_30_loja: 0,
          r_60_pf: 0, r_60_cm: 0, r_60_full: 0, r_60_loja: 0,
          r_90_pf: 0, r_90_cm: 0, r_90_full: 0, r_90_loja: 0,
          qtd_ped: 0, 
          sum_preco: 0, 
          sum_unit_cost: 0, 
          inventory_value: 0,
          count: 0
        };
      }
      const g = groups[key];

      const safeNum = (val: any) => {
          const n = Number(val);
          return isNaN(n) ? 0 : n;
      };

      // 2. Calcula a quantidade de PEDIDO deste item específico (Filho)
      const pedItem = canal === 'loja' ? p.qtd_andamento_loja : canal === 'site' ? p.qtd_andamento_site : p.qtd_andamento;
      const qtdPedItem = safeNum(pedItem);

      // 3. Adiciona o Filho ao Grupo (AGORA COM A QUANTIDADE DE PEDIDO JÁ CALCULADA)
      g.children.push({ 
        ...p, 
        isParent: false,
        qtd_ped_atual: qtdPedItem // <--- Salva aqui para usar na linha do filho
      });

      // 4. Acumuladores do Pai
      g.est_total += safeNum(p.est_total);
      g.est_loja += safeNum(p.est_loja);
      g.est_site += safeNum(p.est_site);
      g.est_full += safeNum(p.est_full);
      
      g.qtd_ped += qtdPedItem; // Soma no total do pai

      // Somas de Vendas
      const v30_unit = safeNum(canal === 'loja' ? p.v_qtd_30d_loja : canal === 'site' ? p.v_qtd_30d_site : (safeNum(p.v_qtd_30d_loja) + safeNum(p.v_qtd_30d_site)));
      const v60_unit = safeNum(canal === 'loja' ? p.v_qtd_60d_loja : canal === 'site' ? p.v_qtd_60d_site : (safeNum(p.v_qtd_60d_loja) + safeNum(p.v_qtd_60d_site)));
      const v90_unit = safeNum(canal === 'loja' ? p.v_qtd_90d_loja : canal === 'site' ? p.v_qtd_90d_site : (safeNum(p.v_qtd_90d_loja) + safeNum(p.v_qtd_90d_site)));
      
      g.v_30 += v30_unit;
      g.v_60 += v60_unit;
      g.v_90 += v90_unit;

      // Somas de Receita
      const r30_unit = safeNum(canal === 'loja' ? p.rec_30d_loja : canal === 'site' ? p.rec_30d_site : (safeNum(p.rec_30d_loja) + safeNum(p.rec_30d_site)));
      const r60_unit = safeNum(canal === 'loja' ? p.rec_60d_loja : canal === 'site' ? p.rec_60d_site : (safeNum(p.rec_60d_loja) + safeNum(p.rec_60d_site)));
      const r90_unit = safeNum(canal === 'loja' ? p.rec_90d_loja : canal === 'site' ? p.rec_90d_site : (safeNum(p.rec_90d_loja) + safeNum(p.rec_90d_site)));

      g.r_30 += r30_unit;
      g.r_60 += r60_unit;
      g.r_90 += r90_unit;

      // Detalhamento
      g.r_30_pf += safeNum(p.rec_30d_portfio); g.r_60_pf += safeNum(p.rec_60d_portfio); g.r_90_pf += safeNum(p.rec_90d_portfio);
      g.r_30_cm += safeNum(p.rec_30d_casamodelo); g.r_60_cm += safeNum(p.rec_60d_casamodelo); g.r_90_cm += safeNum(p.rec_90d_casamodelo);
      g.r_30_full += safeNum(p.rec_30d_full); g.r_60_full += safeNum(p.rec_60d_full); g.r_90_full += safeNum(p.rec_90d_full);
      g.r_30_loja += safeNum(p.rec_30d_loja); g.r_60_loja += safeNum(p.rec_60d_loja); g.r_90_loja += safeNum(p.rec_90d_loja);

      // Preço e Custo
      const precoUnit = canal === 'site' ? (safeNum(p.ultimo_preco_site) || safeNum(p.preco_venda_padrao)) : safeNum(p.preco_venda_padrao);
      g.sum_preco += precoUnit;
      g.sum_unit_cost += safeNum(p.custo_final);

      const qtdKpi = canal === 'loja' ? p.est_loja : canal === 'site' ? (p.est_site + p.est_full) : p.est_total;
      g.inventory_value += (safeNum(p.custo_final) * Math.max(0, safeNum(qtdKpi)));

      g.count++;
    });

    return Object.values(groups).sort((a: any, b: any) => a.nome.localeCompare(b.nome));
  }, [rawData, canal, search, filterForn, filterCat]);

  // 4. STATS REATIVOS (Lê os grupos que passaram pelos filtros)
  const totalStats = useMemo(() => {
  return processedData.reduce((acc, g) => {
      acc.custo += (g.inventory_value || 0); // Soma o valor financeiro total do estoque
      acc.r30 += g.r_30; acc.r60 += g.r_60; acc.r90 += g.r_90;
      acc.bd_pf_30 += g.r_30_pf; acc.bd_pf_60 += g.r_60_pf; acc.bd_pf_90 += g.r_90_pf;
      acc.bd_cm_30 += g.r_30_cm; acc.bd_cm_60 += g.r_60_cm; acc.bd_cm_90 += g.r_90_cm;
      acc.bd_full_30 += g.r_30_full; acc.bd_full_60 += g.r_60_full; acc.bd_full_90 += g.r_90_full;
      acc.bd_loja_30 += g.r_30_loja; acc.bd_loja_60 += g.r_60_loja; acc.bd_loja_90 += g.r_90_loja;
      return acc;
      }, { 
        custo: 0, r30: 0, r60: 0, r90: 0, 
        bd_pf_30: 0, bd_pf_60: 0, bd_pf_90: 0,
        bd_cm_30: 0, bd_cm_60: 0, bd_cm_90: 0,
        bd_full_30: 0, bd_full_60: 0, bd_full_90: 0,
        bd_loja_30: 0, bd_loja_60: 0, bd_loja_90: 0
      });
    }, [processedData]);

  const suppliers = useMemo(() => Array.from(new Set(processedData.map((p: any) => p.fornecedor).filter(Boolean))).sort(), [processedData]);
  const categories = useMemo(() => Array.from(new Set(processedData.map((p: any) => p.categoria).filter(Boolean))).sort(), [processedData]);

  // COLUNAS
  const columns: ColumnDef<any>[] = [
    {
      id: "expander", header: "",
      cell: ({ row }) => (row.original.isParent && row.original.children.length > 1) && (
        <button onClick={() => row.toggleExpanded()} className="hover:bg-slate-200 rounded p-1"><ChevronRight size={14} className={row.getIsExpanded() ? "rotate-90 transition-all" : "transition-all"}/></button>
      )
    },
    {
      accessorKey: "nome", 
      header: ({ column }) => {
        return (
          <Button variant="ghost" size="sm" className="-ml-3 h-8 text-[10px] uppercase font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Produto
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        )
      },
      cell: ({ row }) => {
        // Se for filho, remove o nome do pai para mostrar só a variação (ex: "Cor: Verde")
        // Se for pai ou produto único, mostra o nome completo/limpo
        const displayName = !row.original.isParent 
          ? row.original.nome.replace(row.original.nome_pai, "").trim() || row.original.nome 
          : row.original.nome;

        return (
          <div className={row.original.isParent ? "font-bold text-slate-800" : "pl-6 text-xs text-slate-600"}>
            <div className="flex items-center gap-2">
              <span>{displayName}</span>
              <Badge variant="outline" className="text-[9px] h-4 font-mono">{row.original.sku}</Badge>
            </div>
            {row.original.isParent && <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5"><Factory size={10}/> {row.original.fornecedor}</div>}
          </div>
        )
      }
    },
    {
      id: "estoque", 
      accessorFn: row => canal === 'loja' ? row.est_loja : canal === 'site' ? (row.est_site + row.est_full) : row.est_total, // Função para o sort entender o valor correto
      header: ({ column }) => (
        <Button variant="ghost" size="sm" className="-ml-3 h-8 text-[10px] uppercase font-bold" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Estoque
          <ArrowUpDown className="ml-2 h-3 w-3" />
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
              {canal !== 'loja' && row.original.est_full > 0 && (
                <span className="text-[8px] bg-orange-100 text-orange-700 px-1 rounded ml-1">F: {row.original.est_full}</span>
              )}
            </div>
            {formattedDate && (!row.original.isParent || row.original.children.length === 1) && (
              <span className="text-[9px] text-slate-400 font-medium leading-tight mt-0.5">
                Últ. Ent: {formattedDate}
              </span>
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
          A Chegar
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        // Pega a quantidade correta (seja pai ou filho)
        const qtd = row.original.isParent ? row.original.qtd_ped : row.original.qtd_ped_atual;
        
        if (!qtd || qtd <= 0) return <span className="text-slate-300">-</span>;
        
        // --- RENDERIZAÇÃO SE FOR FILHO (VARIAÇÃO) ---
        if (!row.original.isParent) {
           const dataPrev = row.original.data_chegada_prevista;
           const fmtChegada = dataPrev ? new Date(dataPrev).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : null;
           
           return (
             <div className="flex flex-col">
               <div className="text-blue-600 font-bold flex items-center gap-1">
                 <Truck size={10} /> {fNum(qtd)}
               </div>
               {fmtChegada && (
                 <span className="text-[9px] text-slate-400 font-medium leading-tight mt-0.5">
                   Chega: {fmtChegada}
                 </span>
               )}
             </div>
           );
        }
        
        const modalItems = row.original.children.filter((c: any) => c.qtd_ped_atual > 0);
        
        return (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-blue-600 font-bold hover:bg-blue-50">
                <Truck size={12} className="mr-1"/> {fNum(qtd)}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Pedidos em Andamento ({canal.toUpperCase()})</DialogTitle></DialogHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Produto/Variação</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Previsão</TableHead>
                    <TableHead>Preço</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* CORREÇÃO AQUI: Usando a nova variável modalItems */}
                  {modalItems.map((item: any) => {
                    const diff = (item.preco_no_pedido || 0) - (item.custo_ult_ent || 0);
                    const nomeExibicao = item.nome.replace(row.original.nome_pai, "").trim() || item.nome;
                    const dataPrev = item.data_chegada_prevista;
                    const fmtChegada = dataPrev ? new Date(dataPrev).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : "-";

                    return (
                      <TableRow key={item.sku}>
                        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]" title={item.nome}>{nomeExibicao}</TableCell>
                        <TableCell>{fNum(item.qtd_ped_atual)}</TableCell>
                        <TableCell className="text-xs">{fmtChegada}</TableCell>
                        <TableCell className={diff > 0 ? "text-red-500 font-bold" : "text-green-600 font-bold"}>
                          {fCurrency(item.preco_no_pedido)}
                        </TableCell>
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
        return <div className="text-[10px] space-x-1"><b>{fNum(v_30)}</b><span className="opacity-60">/{fNum(v_60)}</span><span className="opacity-40">/{fNum(v_90)}</span></div>;
      }
    },
    { 
      header: "Custo Méd", 
      cell: ({ row }) => {
        const custo = row.original.isParent 
          ? (row.original.sum_unit_cost / row.original.count) 
          : row.original.custo_final;

        // DEFINIÇÃO DAS VARIÁVEIS PARA O POPOVER (Resolve erro TS)
        const lastEntry = row.original.custo_ult_ent || 0;
        const stdCost = row.original.custo_padrao || 0;

        return (
          <Popover>
            <PopoverTrigger className="cursor-help hover:text-blue-600 underline decoration-dotted decoration-slate-300 underline-offset-2">
              {fCurrency(custo)}
            </PopoverTrigger>
            <PopoverContent className="w-64 text-xs">
              <div className="font-bold mb-2 border-b pb-1">Composição do Custo</div>
              <div className="flex justify-between py-1"><span>Custo Calculado (Médio):</span> <b>{fCurrency(custo)}</b></div>
              <div className="flex justify-between py-1 text-slate-500"><span>Última Entrada:</span> <span>{fCurrency(lastEntry)}</span></div>
              <div className="flex justify-between py-1 text-slate-500"><span>Custo Padrão (Fixo):</span> <span>{fCurrency(stdCost)}</span></div>
            </PopoverContent>
          </Popover>
        );
      }
    },
    {
      header: "Preço Venda",
      cell: ({ row }) => {
        // Lógica para Pai (Média) e Filho (Valor real)
        const p = row.original.isParent 
          ? (row.original.sum_preco / row.original.count) 
          : (canal === 'site' ? (row.original.ultimo_preco_site || row.original.preco_venda_padrao) : row.original.preco_venda_padrao);
        return <span className="text-xs font-bold text-slate-700">{fCurrency(p)}</span>;
      }
    },
    {
      id: "markup",
      // 1. Função de Acesso: Calcula o valor numérico para o Sort funcionar
      accessorFn: row => {
        const c = row.isParent 
          ? (row.sum_unit_cost / (row.count || 1)) 
          : (row.custo_final || 0);
          
        const p = row.isParent 
          ? (row.sum_preco / (row.count || 1)) 
          : (canal === 'site' ? (row.ultimo_preco_site || row.preco_venda_padrao) : row.preco_venda_padrao);
          
        // Retorna -9999 se o custo for zero para jogar para o final da lista, senão retorna o %
        return c > 0 ? ((p - c) / c) * 100 : -9999;
      },
      // 2. Cabeçalho Interativo: Botão de Sort
      header: ({ column }) => (
        <Button 
          variant="ghost" 
          size="sm" 
          className="-ml-3 h-8 text-[10px] uppercase font-bold" 
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Markup
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      // 3. Célula Visual: O Badge colorido (Mantido igual)
      cell: ({ row }) => {
        const c = row.original.isParent 
          ? (row.original.sum_unit_cost / (row.original.count || 1)) 
          : row.original.custo_final;
          
        const p = row.original.isParent 
          ? (row.original.sum_preco / (row.original.count || 1)) 
          : (canal === 'site' ? (row.original.ultimo_preco_site || row.original.preco_venda_padrao) : row.original.preco_venda_padrao);
          
        const mkp = c > 0 ? ((p - c) / c) * 100 : 0;
        
        return (
          <Badge 
            variant={mkp < 40 ? "destructive" : "outline"} 
            className="text-[9px] h-4"
          >
            {fPerc(mkp)}
          </Badge>
        );
      }
    }
  ];

  const table = useReactTable({
    data: processedData,
    columns,
    state: { expanded, sorting }, // <--- Adicione sorting
    onExpandedChange: setExpanded,
    onSortingChange: setSorting, // <--- Adicione o handler
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(), // <--- Ative o modelo de ordenação
    paginateExpandedRows: false,
    initialState: { pagination: { pageSize: 50 } }
  });

  // Função para renderizar os modais de receita
  const RevenueModal = ({ title, total, pf, cm, full, loja, color, border }: any) => (
    <Dialog>
      <DialogTrigger asChild>
        <Card className={`border-t-4 ${border} shadow-sm cursor-pointer hover:bg-slate-50 transition-colors`}>
          <CardHeader className="pb-1 text-[10px] uppercase font-bold text-muted-foreground">{title} (Ver)</CardHeader>
          <CardContent className={`text-xl font-black ${color}`}>{fCurrency(total)}</CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title} - Detalhes</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-4 text-sm">
          {(canal === 'geral' || canal === 'site') && <>
            <div className="flex justify-between border-b pb-2"><span className="font-medium">PortFio:</span> <span>{fCurrency(pf)}</span></div>
            <div className="flex justify-between border-b pb-2"><span className="font-medium">Casa Modelo:</span> <span>{fCurrency(cm)}</span></div>
            <div className="flex justify-between border-b pb-2"><span className="font-medium">Full:</span> <span>{fCurrency(full)}</span></div>
          </>}
          {(canal === 'geral' || canal === 'loja') && <div className="flex justify-between border-b pb-2"><span className="font-medium">Loja:</span> <span>{fCurrency(loja)}</span></div>}
          <div className={`flex justify-between pt-2 text-lg font-bold ${color}`}><span>TOTAL:</span> <span>{fCurrency(total)}</span></div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* 1. CARDS DE RESUMO (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-primary shadow-sm"><CardHeader className="pb-1 text-[10px] uppercase font-bold text-muted-foreground">Custo Estoque Filtrado</CardHeader><CardContent className="text-xl font-black">{fCurrency(totalStats.custo)}</CardContent></Card>
        <RevenueModal title="Receita 30d" total={totalStats.r30} pf={totalStats.bd_pf_30} cm={totalStats.bd_cm_30} full={totalStats.bd_full_30} loja={totalStats.bd_loja_30} color="text-green-600" border="border-green-600" />
        <RevenueModal title="Receita 60d" total={totalStats.r60} pf={totalStats.bd_pf_60} cm={totalStats.bd_cm_60} full={totalStats.bd_full_60} loja={totalStats.bd_loja_60} color="text-green-700" border="border-green-700 opacity-90" />
        <RevenueModal title="Receita 90d" total={totalStats.r90} pf={totalStats.bd_pf_90} cm={totalStats.bd_cm_90} full={totalStats.bd_full_90} loja={totalStats.bd_loja_90} color="text-green-800" border="border-green-800 opacity-80" />
      </div>

      {/* 2. BARRA DE AÇÕES (BUSCA + TABS + SIDEBAR) */}
      <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
          <Input placeholder="Buscar por SKU ou Nome..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)}/>
        </div>

        <Tabs value={canal} onValueChange={(v:any) => setCanal(v)} className="hidden md:block">
          <TabsList>
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="loja">Loja</TabsTrigger>
            <TabsTrigger value="site">Site</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* SIDEBAR DE FILTROS */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="ml-auto flex gap-2">
              <Filter size={16} /> 
              Filtros Avançados
              {(filterForn !== 'all' || filterCat !== 'all') && (
                <Badge className="ml-1 h-5 px-1.5 bg-primary text-[10px]">Ativos</Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] overflow-y-auto">
            <SheetHeader className="border-b pb-4 mb-6">
              <SheetTitle className="flex items-center gap-2">
                <Filter size={20} /> Filtros de Estoque
              </SheetTitle>
            </SheetHeader>
            
            <div className="space-y-8">
              {/* FILTRO FORNECEDOR */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold uppercase text-slate-500 tracking-wider">Fornecedor</label>
                  {filterForn !== 'all' && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 p-0" onClick={() => setFilterForn('all')}>Limpar</Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1 max-h-[300px] overflow-y-auto pr-2">
                  <Button 
                    variant={filterForn === 'all' ? 'default' : 'outline'} 
                    size="sm" className="justify-start h-8 text-[11px]" 
                    onClick={() => setFilterForn('all')}
                  >Todos Fornecedores</Button>
                  {suppliers.map(f => (
                    <Button 
                      key={f} 
                      variant={filterForn === f ? 'secondary' : 'ghost'} 
                      size="sm" 
                      className={`justify-start h-8 text-[11px] truncate ${filterForn === f ? 'border-primary ring-1 ring-primary' : ''}`}
                      onClick={() => setFilterForn(f)}
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </div>

              {/* FILTRO CATEGORIA */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold uppercase text-slate-500 tracking-wider">Categoria</label>
                  {filterCat !== 'all' && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 p-0" onClick={() => setFilterCat('all')}>Limpar</Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1 max-h-[300px] overflow-y-auto pr-2">
                  <Button 
                    variant={filterCat === 'all' ? 'default' : 'outline'} 
                    size="sm" className="justify-start h-8 text-[11px]" 
                    onClick={() => setFilterCat('all')}
                  >Todas Categorias</Button>
                  {categories.map(c => (
                    <Button 
                      key={c} 
                      variant={filterCat === c ? 'secondary' : 'ghost'} 
                      size="sm" 
                      className={`justify-start h-8 text-[11px] truncate ${filterCat === c ? 'border-primary ring-1 ring-primary' : ''}`}
                      onClick={() => setFilterCat(c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t">
                <Button variant="outline" className="w-full flex gap-2" onClick={() => { setFilterCat('all'); setFilterForn('all'); setSearch(''); }}>
                  <RotateCcw size={14} /> Resetar Tudo
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* REMOVIDO OVERFLOW-HIDDEN PARA PERMITIR EXPANSÃO DA TABELA */}
      <Card className="shadow-xl rounded-xl border-none overflow-visible">
        <Table>
          <TableHeader className="bg-slate-800"><TableRow>{table.getHeaderGroups()[0].headers.map(h => <TableHead key={h.id} className="text-white text-[10px] uppercase font-bold">{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{table.getRowModel().rows.map(row => <TableRow key={row.id} className={row.original.isParent ? "bg-slate-50/50" : ""}>{row.getVisibleCells().map(c => <TableCell key={c.id} className="py-2">{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>)}</TableRow>)}</TableBody>
        </Table>
        <div className="p-4 flex items-center justify-between bg-white border-t">
          <div className="text-[10px] text-muted-foreground uppercase font-bold">Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</div>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Anterior</Button><Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Próxima</Button></div>
        </div>
      </Card>
    </div>
  );
}