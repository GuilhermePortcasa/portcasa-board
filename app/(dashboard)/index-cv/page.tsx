"use client";

import React, { useState, useMemo } from "react";
import { useDashboard } from "@/providers/dashboard-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChartBig, ShoppingCart, TrendingDown, CheckCircle2, AlertTriangle, 
  Search, PackageX, PackagePlus, ArrowDownUp, Filter, Store, Globe, ExternalLink
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx'; 
import Link from "next/link"; // Adicionado para poder fazer o redirecionamento

const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);

export default function IndexCVPage() {
  const { rawData, loading, suppliers } = useDashboard(); 
  
  const [searchTerm, setSearchTerm] = useState("");
  // 1. CORREÇÃO DE TIPO: Adicionado "antecipar" aqui para corrigir o erro do TS
  const [filtroAcao, setFiltroAcao] = useState<"todos" | "comprar" | "liquidar" | "ideal" | "transferir" | "antecipar">("todos");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'sugestao_valor', direction: 'desc' });

  const [canal, setCanal] = useState<"geral" | "loja" | "site">("geral");
  const [fornecedor, setFornecedor] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [canal, fornecedor, filtroAcao, searchTerm, sortConfig]);

  // Processamento e Matemática do Estoque
  const analysisData = useMemo(() => {
    let comprarQtd = 0, comprarValor = 0;
    let liquidarQtd = 0, liquidarValor = 0;
    let transferirQtd = 0, transferirValor = 0;
    let anteciparQtd = 0, anteciparValor = 0;

    const list: any[] = [];

    rawData.forEach(item => {
      if (item.tipo === 'E') return;
      if (fornecedor !== "all" && item.fornecedor !== fornecedor) return;

      const hoje = new Date();
      hoje.setHours(0,0,0,0);
      
      const dataEntrada = item.data_ult_ent ? new Date(item.data_ult_ent + 'T00:00:00') : null;
      const diasDesdeEntrada = dataEntrada ? Math.floor((hoje.getTime() - dataEntrada.getTime()) / (1000 * 3600 * 24)) : 999;

      const dataChegada = item.data_chegada_prevista ? new Date(item.data_chegada_prevista + 'T00:00:00') : null;
      let diasParaChegar = 0;
      if (dataChegada && dataChegada > hoje) {
        diasParaChegar = Math.ceil((dataChegada.getTime() - hoje.getTime()) / (1000 * 3600 * 24));
      }

      // --- CÁLCULO SEGURO DA LOJA ---
      let v30_loja = Number(item.v_qtd_30d_loja || 0);
      let est_loja = Number(item.est_loja || 0);
      let transito_loja = Number(item.qtd_andamento_loja || 0);
      let proj_loja = est_loja + transito_loja;
      let giro_loja = v30_loja / 30;
      let cob_loja = giro_loja > 0 ? Math.floor(proj_loja / giro_loja) : 999;
      
      let exc_loja = 0; 
      if (v30_loja === 0 && est_loja > 0 && diasDesdeEntrada > 45 && transito_loja === 0) {
        exc_loja = est_loja; 
      } else if (v30_loja > 0 && cob_loja > 120) {
        exc_loja = Math.floor(proj_loja - (giro_loja * 90)); 
        if (exc_loja > est_loja) exc_loja = est_loja; 
      }
      if (exc_loja < 0) exc_loja = 0;

      // --- CÁLCULO SEGURO DO SITE ---
      let v30_site = Number(item.v_qtd_30d_site || 0);
      let est_site_puro = Number(item.est_site || 0); 
      let transito_site = Number(item.qtd_andamento_site || 0);
      let proj_site = est_site_puro + transito_site;
      let giro_site = v30_site / 30;
      let cob_site = giro_site > 0 ? Math.floor(proj_site / giro_site) : 999;

      let exc_site = 0; 
      if (v30_site === 0 && est_site_puro > 0 && diasDesdeEntrada > 45 && transito_site === 0) {
        exc_site = est_site_puro; 
      } else if (v30_site > 0 && cob_site > 120) {
        exc_site = Math.floor(proj_site - (giro_site * 90)); 
        if (exc_site > est_site_puro) exc_site = est_site_puro; 
      }
      if (exc_site < 0) exc_site = 0;

      // --- MÉTRICAS DO CANAL ---
      let vendas30 = 0, estoqueReal = 0, transito = 0;
      let localDoPedido = "geral";

      if (canal === "loja") {
        vendas30 = v30_loja; estoqueReal = est_loja; transito = transito_loja;
        if (transito > 0) localDoPedido = "loja";
      } else if (canal === "site") {
        vendas30 = v30_site; estoqueReal = est_site_puro + Number(item.est_full || 0); transito = transito_site;
        if (transito > 0) localDoPedido = "site";
      } else {
        vendas30 = v30_site + v30_loja; estoqueReal = Number(item.est_total || 0); transito = Number(item.qtd_andamento || 0);
        if (transito_loja > 0 && transito_site === 0) localDoPedido = "loja";
        else if (transito_site > 0 && transito_loja === 0) localDoPedido = "site";
      }

      if (vendas30 === 0 && estoqueReal === 0 && transito === 0) return;

      const estoqueProjetado = estoqueReal + transito;
      const custo = Number(item.custo_final || 0);
      const giroDiario = vendas30 / 30;
      
      let coberturaDiasFisico = giroDiario > 0 ? Math.floor(estoqueReal / giroDiario) : 999;
      let coberturaDiasTotal = giroDiario > 0 ? Math.floor(estoqueProjetado / giroDiario) : 999;

      // 💥 CÁLCULO DE PERDA PROJETADA (O Segredo da Antecipação)
      const previsaoDiasChegada = diasParaChegar > 0 ? diasParaChegar : 15; // Assume 15 dias se não houver data preenchida
      let diasDescobertos = Math.max(0, previsaoDiasChegada - coberturaDiasFisico);
      let perdaProjetada = transito > 0 ? diasDescobertos * giroDiario : 0;

      let status = "IDEAL";
      let badgeClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
      let sugestaoQtd = 0;
      let acaoMacro = "ideal";
      let detalheOrigem: any = null;

      // 1. LÓGICA DE DECISÃO
      if (vendas30 === 0) {
         if (estoqueReal === 0 && transito > 0) {
            status = "A CHEGAR"; badgeClass = "bg-blue-100 text-blue-700 border-blue-200"; acaoMacro = "ideal";
         } else if (estoqueReal > 0) {
            if (diasDesdeEntrada <= 45) { 
               status = "IMPLANTAÇÃO"; badgeClass = "bg-indigo-50 text-indigo-600 border-indigo-200"; acaoMacro = "ideal";
            } else {
               status = "PARADO"; badgeClass = "bg-slate-200 text-slate-700 border-slate-300"; acaoMacro = "liquidar"; sugestaoQtd = estoqueReal; 
            }
         }
      } else {
         if (estoqueReal === 0 && transito === 0) {
            status = "RUPTURA"; badgeClass = "bg-red-100 text-red-700 border-red-200"; acaoMacro = "comprar"; sugestaoQtd = Math.ceil(giroDiario * 60); 
         } 
         // SÓ SUGERE ANTECIPAR SE O RISCO DE VENDA PERDIDA FOR MAIOR OU IGUAL A 1 PEÇA
         else if (transito > 0 && perdaProjetada >= 1) {
            status = "ANTECIPAR PEDIDO"; 
            badgeClass = "bg-yellow-100 text-yellow-800 border-yellow-300 shadow-sm"; 
            acaoMacro = "antecipar"; 
            sugestaoQtd = Math.min(transito, Math.ceil(perdaProjetada)); // Sugere antecipar o que vamos perder
            detalheOrigem = { estFisico: estoqueReal, cobFisica: coberturaDiasFisico, diasChegada: previsaoDiasChegada, previsao: item.data_chegada_prevista, destinoReq: localDoPedido, perda: perdaProjetada };
         }
         else if (coberturaDiasTotal < 30) {
            status = "COMPRAR"; badgeClass = "bg-orange-100 text-orange-700 border-orange-200"; acaoMacro = "comprar"; sugestaoQtd = Math.ceil((giroDiario * 60) - estoqueProjetado); 
         } 
         else if (coberturaDiasTotal > 120 && estoqueReal > 0) {
            // Só liquida o que está na prateleira, não o que está no caminhão
            status = "EXCESSO"; badgeClass = "bg-purple-100 text-purple-700 border-purple-200"; acaoMacro = "liquidar"; 
            sugestaoQtd = Math.min(estoqueReal, Math.ceil(estoqueProjetado - (giroDiario * 90))); 
         }
         else if (estoqueReal === 0 && transito > 0) {
            // Chega aqui se o físico tá zero, mas a perda projetada é quase nula (Giro baixíssimo)
            status = "A CHEGAR"; badgeClass = "bg-blue-100 text-blue-700 border-blue-200"; acaoMacro = "ideal";
         }
      }

      // 2. LÓGICA DE TRANSFERÊNCIA
      if (acaoMacro === "comprar" || acaoMacro === "antecipar") {
        if ((canal === "loja" || canal === "geral") && exc_site > 0) {
          acaoMacro = "transferir";
          status = "TRANSF. DO SITE";
          badgeClass = "bg-blue-100 text-blue-700 border-blue-600 cursor-pointer hover:bg-blue-200 transition-colors shadow-sm";
          sugestaoQtd = Math.min(sugestaoQtd, exc_site); 
          detalheOrigem = { nome: "Site (Depósito Padrão)", est_disponivel: est_site_puro, exc_calculado: exc_site, giro: giro_site };
        } else if ((canal === "site" || canal === "geral") && exc_loja > 0) {
          acaoMacro = "transferir";
          status = "TRANSF. DA LOJA";
          badgeClass = "bg-blue-100 text-blue-700 border-blue-600 cursor-pointer hover:bg-blue-200 transition-colors shadow-sm";
          sugestaoQtd = Math.min(sugestaoQtd, exc_loja);
          detalheOrigem = { nome: "Loja Física", est_disponivel: est_loja, exc_calculado: exc_loja, giro: giro_loja };
        }
      }

      if (sugestaoQtd < 0) sugestaoQtd = 0;
      const sugestaoValor = sugestaoQtd * custo;

      if (acaoMacro === "comprar") {
        comprarQtd += sugestaoQtd; comprarValor += sugestaoValor;
      } else if (acaoMacro === "liquidar") {
        liquidarQtd += sugestaoQtd; liquidarValor += sugestaoValor;
      } else if (acaoMacro === "transferir") {
        transferirQtd += sugestaoQtd; transferirValor += sugestaoValor;
      } else if (acaoMacro === "antecipar") {
        anteciparQtd += sugestaoQtd; anteciparValor += sugestaoValor;
      }

      list.push({
        ...item,
        vendas30, estoqueProjetado, transito, giroDiario, coberturaDias: coberturaDiasTotal,
        status, badgeClass, acaoMacro, sugestaoQtd, sugestaoValor, detalheOrigem
      });
    });

    return { list, comprarQtd, comprarValor, liquidarQtd, liquidarValor, transferirQtd, transferirValor, anteciparQtd, anteciparValor };
  }, [rawData, canal, fornecedor]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const filteredAndSortedList = useMemo(() => {
    let result = analysisData.list;
    if (filtroAcao !== "todos") result = result.filter(item => item.acaoMacro === filtroAcao);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(i => i.sku.toLowerCase().includes(s) || i.nome.toLowerCase().includes(s));
    }
    result.sort((a, b) => {
      let valA = a[sortConfig.key]; let valB = b[sortConfig.key];
      if (typeof valA === 'string') return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [analysisData.list, filtroAcao, searchTerm, sortConfig]);

  const totalPages = Math.ceil(filteredAndSortedList.length / itemsPerPage);
  const paginatedList = filteredAndSortedList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExportExcel = () => {
    const dataToExport = filteredAndSortedList.map(item => {
      let acaoColunaNome = "Quantidade Sugerida";
      if (filtroAcao === "transferir") acaoColunaNome = "Quantidade (Transferir)";
      else if (filtroAcao === "comprar") acaoColunaNome = "Quantidade (Comprar)";
      else if (filtroAcao === "liquidar") acaoColunaNome = "Quantidade (Liquidar)";
      else if (filtroAcao === "antecipar") acaoColunaNome = "Quantidade (Antecipar)"; 

      const estoqueFisicoCanal = Number((item.estoqueProjetado || 0) - (item.transito || 0));

      const rowData: any = {
        "SKU": item.sku,
        "Descrição": item.nome, 
        "Custo Última Entrada": Number(item.custo_ult_ent || 0),
        "Estoque": estoqueFisicoCanal, 
        "Fornecedor": item.fornecedor || "",
        "GTIN": item.gtin || "",
        "GTIN2": item.gtin_embalagem || "",
      };

      rowData[acaoColunaNome] = Number(item.sugestaoQtd || 0);
      return rowData;
    });

    if (dataToExport.length === 0) return alert("Nenhum dado para exportar com este filtro.");

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    const range = XLSX.utils.decode_range(worksheet['!ref']!);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const custoCell = worksheet[XLSX.utils.encode_cell({r: R, c: 2})]; 
      if (custoCell) custoCell.z = '"R$" #,##0.00';
    }

    worksheet['!cols'] = [
      {wch: 15}, {wch: 60}, {wch: 20}, {wch: 10}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 25} 
    ];

    const workbook = XLSX.utils.book_new();
    const dataHoje = new Date().toLocaleDateString('pt-BR').replaceAll('/', '-');
    const nomeArquivo = `Sugestao_${filtroAcao.toUpperCase()}_${canal}_${dataHoje}.xlsx`;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, "Analise");
    XLSX.writeFile(workbook, nomeArquivo);
  };

  if (loading) return <div className="p-10 text-center animate-pulse text-slate-500 italic">Analisando giro e cobertura de estoque...</div>;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BarChartBig className="text-blue-600" /> Index C&V (Compra e Venda)
        </h1>
        <p className="text-slate-500 text-sm">Algoritmo de sugestão de ressuprimento e liquidação baseado no giro de 30 dias.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-none shadow-md bg-white border-l-4 border-l-orange-500 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-5"><ShoppingCart size={100} /></div>
          <CardContent className="p-6">
            <div className="text-sm font-bold uppercase text-orange-600 mb-1 flex items-center gap-2"><PackagePlus size={16}/> Oportunidade de Compra</div>
            <div className="text-3xl font-black text-slate-800">{fCurrency(analysisData.comprarValor)}</div>
            <p className="text-xs mt-2 text-slate-500 font-medium">Sugestão de <span className="font-bold text-orange-600">{fNum(analysisData.comprarQtd)} peças</span> para cobrir rupturas e manter estoque para 60 dias.</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-white border-l-4 border-l-purple-500 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-5"><TrendingDown size={100} /></div>
          <CardContent className="p-6">
            <div className="text-sm font-bold uppercase text-purple-600 mb-1 flex items-center gap-2"><PackageX size={16}/> Necessidade de Liquidação</div>
            <div className="text-3xl font-black text-slate-800">{fCurrency(analysisData.liquidarValor)}</div>
            <p className="text-xs mt-2 text-slate-500 font-medium">Capital imobilizado em <span className="font-bold text-purple-600">{fNum(analysisData.liquidarQtd)} peças</span> ociosas ou com cobertura maior que 120 dias.</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
          <div className="relative w-full sm:w-[250px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/>
            <Input 
              placeholder="Buscar SKU ou Produto..." 
              className="pl-9 h-9" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>

          <div className="relative w-full sm:w-[180px]">
            <Filter className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <select
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              className="flex h-9 w-full appearance-none items-center rounded-md border border-slate-200 bg-white pl-9 pr-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">Todos Fornecs</option>
              {suppliers?.map((f: any) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </div>
          
          <Tabs value={canal} onValueChange={(v: any) => setCanal(v)} className="w-full sm:w-auto">
            <TabsList className="grid grid-cols-3 h-9">
              <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
              <TabsTrigger value="loja" className="text-xs flex gap-1"><Store size={12}/> Loja</TabsTrigger>
              <TabsTrigger value="site" className="text-xs flex gap-1"><Globe size={12}/> Site</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportExcel} 
            className="h-9 w-full sm:w-auto bg-green-700 hover:bg-green-600 text-white border-green-800"
          >
            Exportar Excel
          </Button>
        </div>

        <Tabs value={filtroAcao} onValueChange={(v: any) => setFiltroAcao(v)} className="w-full xl:w-auto overflow-x-auto">
          <TabsList className="flex min-w-max h-9">
            <TabsTrigger value="todos" className="text-xs">Todos</TabsTrigger>
            <TabsTrigger value="comprar" className="text-xs text-orange-600 font-bold data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">Comprar</TabsTrigger>
            <TabsTrigger value="antecipar" className="text-xs text-yellow-600 font-bold data-[state=active]:bg-yellow-50 data-[state=active]:text-yellow-700">Antecipar</TabsTrigger>
            <TabsTrigger value="transferir" className="text-xs text-blue-600 font-bold data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">Transferir</TabsTrigger>
            <TabsTrigger value="liquidar" className="text-xs text-purple-600 font-bold data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">Liquidar</TabsTrigger>
            <TabsTrigger value="ideal" className="text-xs text-emerald-600 font-bold data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">Ideal</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="border-none shadow-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-900 text-white">
              <TableRow className="hover:bg-slate-900 border-none">
                <TableHead className="text-white font-bold h-10 w-[35%]"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase p-0 hover:bg-transparent hover:text-blue-300" onClick={() => handleSort('nome')}>SKU / PRODUTO <ArrowDownUp className="ml-1 h-3 w-3"/></Button></TableHead>
                <TableHead className="text-white font-bold h-10 text-center"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase p-0 hover:bg-transparent hover:text-blue-300" onClick={() => handleSort('vendas30')}>GIRO (30D) <ArrowDownUp className="ml-1 h-3 w-3"/></Button></TableHead>
                <TableHead className="text-white font-bold h-10 text-center"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase p-0 hover:bg-transparent hover:text-blue-300" onClick={() => handleSort('estoqueProjetado')}>ESTOQUE + PEDIDO <ArrowDownUp className="ml-1 h-3 w-3"/></Button></TableHead>
                <TableHead className="text-white font-bold h-10 text-center"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase p-0 hover:bg-transparent hover:text-blue-300" onClick={() => handleSort('coberturaDias')}>COBERTURA <ArrowDownUp className="ml-1 h-3 w-3"/></Button></TableHead>
                <TableHead className="text-white font-bold h-10 text-center">DIAGNÓSTICO</TableHead>
                <TableHead className="text-white font-bold h-10 text-right"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase p-0 hover:bg-transparent hover:text-blue-300" onClick={() => handleSort('sugestaoValor')}>VALOR AÇÃO <ArrowDownUp className="ml-1 h-3 w-3"/></Button></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedList.map((row) => (
                <TableRow key={row.sku} className="hover:bg-slate-50 transition-colors">
                  <TableCell>
                    <div className="flex flex-col min-w-[200px] max-w-[350px]">
                      <span className="font-bold text-xs text-slate-700 break-words whitespace-normal">
                        {row.nome}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5">{row.sku}</span>
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <div className="font-bold text-slate-800 text-xs">{fNum(row.vendas30)}</div>
                    <div className="text-[9px] text-slate-400">{row.giroDiario.toFixed(1)}/dia</div>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="font-bold text-slate-800 text-xs">{fNum(row.estoqueProjetado - row.transito)} un</div>
                    {row.transito > 0 && <div className="text-[9px] text-blue-600 font-bold">+ {fNum(row.transito)} chegando</div>}
                  </TableCell>

                  <TableCell className="text-center">
                    <div className={cn("font-black text-sm", row.coberturaDias < 30 ? "text-red-500" : row.coberturaDias > 120 ? "text-purple-600" : "text-emerald-600")}>
                      {row.coberturaDias === 999 ? "∞" : `${row.coberturaDias}d`}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    {/* 4. MODAL ADAPTADO COM O LINK PARA A PÁGINA DE COMPRAS */}
                    {row.acaoMacro === "transferir" && row.detalheOrigem ? (
                      <Popover>
                        <PopoverTrigger>
                          <Badge variant="outline" className={cn("text-[10px] font-bold h-5 px-2", row.badgeClass)}>
                            {row.status}
                          </Badge>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-left p-3 text-sm shadow-xl border-yellow-200" side="top">
                          <div className="font-bold mb-3 pb-2 border-b text-slate-700 flex items-center gap-2">
                            <AlertTriangle size={14} className="text-yellow-600" /> Risco de Ruptura
                          </div>
                          <div className="space-y-1.5 text-slate-600 text-xs">
                            <div className="flex justify-between"><span>Estoque Físico:</span> <span className="font-semibold">{fNum(row.detalheOrigem.estFisico)} un</span></div>
                            <div className="flex justify-between"><span>Cob. Física Atual:</span> <span className="font-semibold">{row.detalheOrigem.cobFisica} dias</span></div>
                            <div className="flex justify-between text-yellow-700 mt-2 pt-2 border-t border-yellow-100 font-bold">
                              <span>Chegada do Pedido:</span> <span>em {row.detalheOrigem.diasChegada} dias</span>
                            </div>
                            <div className="flex justify-between text-red-600 mt-1 font-bold">
                              <span>Venda Perdida (Risco):</span> <span>{Math.ceil(row.detalheOrigem.perda)} un</span>
                            </div>
                          </div>
                          
                          {/* BOTÃO QUE LINKA PARA COMPRAS */}
                          <div className="mt-4 pt-3 border-t">
                            <Link href={`/compras?busca=${encodeURIComponent(row.sku)}&canal=${row.detalheOrigem.destinoReq}`} target="_blank">
                              <Button size="sm" className="w-full bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 gap-2">
                                Localizar Pedido <ExternalLink size={14} />
                              </Button>
                            </Link>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : row.acaoMacro === "antecipar" && row.detalheOrigem ? (
                      <Popover>
                        <PopoverTrigger>
                          <Badge variant="outline" className={cn("text-[10px] font-bold h-5 px-2", row.badgeClass)}>
                            {row.status}
                          </Badge>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-left p-3 text-sm shadow-xl border-yellow-200" side="top">
                          <div className="font-bold mb-3 pb-2 border-b text-slate-700 flex items-center gap-2">
                            <AlertTriangle size={14} className="text-yellow-600" /> Risco de Ruptura
                          </div>
                          <div className="space-y-1.5 text-slate-600 text-xs">
                            <div className="flex justify-between"><span>Estoque Físico:</span> <span className="font-semibold text-red-500">{fNum(row.detalheOrigem.estFisico)} un</span></div>
                            <div className="flex justify-between"><span>Cobertura Física:</span> <span className="font-semibold text-red-500">{row.detalheOrigem.cobFisica} dias</span></div>
                            <div className="flex justify-between text-yellow-700 mt-2 pt-2 border-t border-yellow-100 font-bold">
                              <span>Pedido Chega em:</span> <span>{row.detalheOrigem.diasChegada} dias</span>
                            </div>
                            {row.detalheOrigem.previsao && (
                              <div className="text-right text-[9px] opacity-70">Prev: {new Date(row.detalheOrigem.previsao).toLocaleDateString('pt-BR')}</div>
                            )}
                          </div>
                          
                          {/* BOTÃO QUE LINKA PARA COMPRAS */}
                          <div className="mt-4 pt-3 border-t">
                            <Link href={`/compras?busca=${encodeURIComponent(row.sku)}&canal=${row.detalheOrigem.destinoReq}`} target="_blank">
                              <Button size="sm" className="w-full bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 gap-2">
                                Localizar Pedido <ExternalLink size={14} />
                              </Button>
                            </Link>
                          </div>

                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Badge variant="outline" className={cn("text-[10px] font-bold h-5 px-2", row.badgeClass)}>
                        {row.status}
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {row.acaoMacro === "ideal" ? (
                      <span className="text-xs text-slate-300">-</span>
                    ) : (
                      <div className="flex flex-col items-end">
                        <span className={cn(
                          "text-xs font-bold", 
                          row.acaoMacro === "comprar" ? "text-orange-600" : 
                          row.acaoMacro === "liquidar" ? "text-purple-600" : 
                          row.acaoMacro === "antecipar" ? "text-yellow-600" :
                          "text-blue-600" 
                        )}>
                          {row.acaoMacro === "comprar" ? "Comprar " : 
                           row.acaoMacro === "liquidar" ? "Liquidar " : 
                           row.acaoMacro === "antecipar" ? "Antecipar " :
                           "Transferir "}
                          {fNum(row.sugestaoQtd)} un
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">{fCurrency(row.sugestaoValor)}</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {paginatedList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-400">Nenhum produto atende a este filtro de ação no momento.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        {totalPages > 1 && (
          <div className="p-3 flex items-center justify-between bg-slate-50 border-t shrink-0">
            <div className="text-[10px] text-muted-foreground uppercase font-bold">
              Página {currentPage} de {totalPages} ({fNum(filteredAndSortedList.length)} itens)
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>
                ANTERIOR
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>
                PRÓXIMA
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}