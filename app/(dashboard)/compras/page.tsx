"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  CalendarClock, ChevronDown, ChevronRight, History, 
  Search, Store, TrendingDown, TrendingUp, Truck, Calendar as CalendarIcon, Filter, FileText, ArrowDownUp, AlertTriangle 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";


const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);

function PedidosContent() {
  const supabase = createClient();
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("busca") || "");
  const [canal, setCanal] = useState<"geral" | "loja" | "site">((searchParams.get("canal") as any) || "geral");
  const [fornecedorFilter, setFornecedorFilter] = useState("all");
  const [showOnlyDelayed, setShowOnlyDelayed] = useState(false);
  const [sortBy, setSortBy] = useState("data_asc"); // Ordenação padrão: data mais próxima

const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Título do Documento
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`Conferencia de Recebimento`, 14, 20);
    
    // Subtítulo
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    const dataHj = new Date().toLocaleDateString('pt-BR');
    doc.text(`Canal: ${canal.toUpperCase()}  |  Gerado em: ${dataHj}`, 14, 26);

    const tableData: any[] = [];
    
    // Força a ordenação do PDF pela data de entrega mais próxima (dias_prazo)
    const pdfOrders = [...processedOrders].sort((a, b) => a.dias_prazo - b.dias_prazo);

    pdfOrders.forEach(order => {
       const displayDoc = order.ordem_compra || order.numero || order.id_pedido;
       const labelDoc = order.ordem_compra ? "OC" : (order.numero ? "Num" : "ID");
       const dataPrev = order.data_prevista ? new Date(order.data_prevista).toLocaleDateString('pt-BR') : "Sem data";
       
       // 1. Linha Mestra (Cabeçalho do Pedido) - Mescla as 3 colunas
       tableData.push([
         {
           content: `PEDIDO: ${labelDoc} ${displayDoc}   |   FORNECEDOR: ${order.fornecedor || "Nao informado"}   |   PREVISAO: ${dataPrev}`,
           colSpan: 3,
           styles: { 
             fillColor: [241, 245, 249], // Fundo cinza claro
             textColor: [15, 23, 42],    // Texto escuro
             fontStyle: 'bold',
             cellPadding: 3
           }
         }
       ]);

       // 2. Linhas Filhas (Itens do pedido)
       order.itens.forEach((item: any) => {
         tableData.push([
           item.sku,
           item.produto_nome || "Produto Desconhecido",
           fNum(item.quantidade) + " un"
         ]);
       });
    });

    // Gera a Tabela
    autoTable(doc, {
      startY: 32,
      head: [['SKU', 'PRODUTO', 'QTD']],
      body: tableData,
      theme: 'plain', // Tira as bordas pesadas de planilha
      styles: { 
        fontSize: 9, 
        cellPadding: 2,
        lineColor: [226, 232, 240], 
        lineWidth: { bottom: 0.1 } // Apenas uma linha sutil separando os itens
      },
      headStyles: { 
        fillColor: [37, 99, 235], // Fundo Azul no cabeçalho das colunas
        textColor: 255, 
        fontStyle: 'bold'
      },
      columnStyles: { 
        0: { cellWidth: 35, fontStyle: 'bold', textColor: [100, 116, 139] }, // Coluna SKU
        1: { cellWidth: 'auto' }, // Coluna Produto (Expande para preencher)
        2: { cellWidth: 25, halign: 'center', fontStyle: 'bold' } // Coluna Qtd
      }
    });

    doc.save(`Recebimentos_${canal}_${new Date().toISOString().split('T')[0]}.pdf`);
  };
  
  // Controles de UI
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const toggleRow = (id: string) => {
    setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
    };
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Modal de Histórico de Custos
  const [historyModal, setHistoryModal] = useState<{isOpen: boolean, sku: string, nome: string, data: any[], loading: boolean}>({
    isOpen: false, sku: "", nome: "", data: [], loading: false
  });

  useEffect(() => {
    const fetchPedidos = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("view_pedidos_detalhados")
        .select("*")
        .order("data_prevista", { ascending: true });
        
      if (!error && data) setRawData(data);
      setLoading(false);
    };
    fetchPedidos();
  }, []);

  const fetchHistoricoCusto = async (sku: string, nome: string) => {
    setHistoryModal({ isOpen: true, sku, nome, data: [], loading: true });
    
    const { data } = await supabase
      .from("view_historico_entradas")
      .select("*")
      .eq("sku", sku)
      .order("data_ref", { ascending: true })
      .limit(100);

    const chartData = (data || []).map(item => ({
      ...item,
      data_curta: item.data_ref ? new Date(item.data_ref).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '',
      valor_num: Number(Number(item.custo_real).toFixed(2)) 
    }));

    setHistoryModal({ isOpen: true, sku, nome, data: chartData, loading: false });
  };

  // Extrai fornecedores únicos para o filtro
  const suppliers = useMemo(() => {
    const set = new Set(rawData.map(i => i.fornecedor).filter(Boolean));
    return Array.from(set).sort();
  }, [rawData]);

  const processedOrders = useMemo(() => {
    let filtered = rawData;
    
    // Filtro Canal
    if (canal === "loja") filtered = filtered.filter(i => i.loja === "PORTCASA");
    if (canal === "site") filtered = filtered.filter(i => i.loja === "PORTFIO");

    // Agrupa por ID do Pedido
    const groups: Record<string, any> = {};
    filtered.forEach(item => {
      const id = item.id_pedido;
      if (!groups[id]) {
        groups[id] = {
          id_pedido: id,
          numero: item.numero,
          ordem_compra: item.ordem_compra,
          fornecedor: item.fornecedor,
          loja: item.loja,
          data_pedido: item.data_pedido,
          data_prevista: item.data_prevista,
          total_itens: 0,
          valor_total: 0,
          itens: []
        };
      }
      groups[id].itens.push(item);
      groups[id].total_itens += Number(item.quantidade);
      groups[id].valor_total += (Number(item.quantidade) * Number(item.custo_efetivo_pedido));
      
      // Calcula o impacto financeiro (Se o custo atual é maior que o do pedido = economia positiva)
      const diff = Number(item.custo_atual_sistema) - Number(item.custo_efetivo_pedido);
      // Se a última entrada for 0 (nunca comprou), consideramos impacto zero.
      groups[id].impacto_financeiro = (groups[id].impacto_financeiro || 0) + (item.custo_atual_sistema > 0 ? diff * item.quantidade : 0);
    });

    let result = Object.values(groups);

    // Filtro de Fornecedor
    if (fornecedorFilter !== "all") {
      result = result.filter(o => o.fornecedor === fornecedorFilter);
    }

    // Filtro Atrasados (Clicando no Card)
    const hoje = new Date().toISOString().split('T')[0];
    if (showOnlyDelayed) {
      result = result.filter(o => o.data_prevista && o.data_prevista < hoje);
    }

    // Filtro de Busca (Texto livre)
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(o => 
        o.id_pedido.toString().includes(s) || 
        (o.numero && o.numero.toLowerCase().includes(s)) ||
        (o.ordem_compra && o.ordem_compra.toLowerCase().includes(s)) ||
        (o.fornecedor && o.fornecedor.toLowerCase().includes(s)) ||
        // NOVIDADE: Busca por SKU e Nome do Produto dentro do pedido
        o.itens.some((i: any) => i.sku.toLowerCase().includes(s) || (i.produto_nome && i.produto_nome.toLowerCase().includes(s)))
      );
    }

    // Calcula dias de prazo para cada pedido
    const hojeObj = new Date();
    hojeObj.setHours(0,0,0,0);

    result = result.map(o => {
      let dias_prazo = 9999;
      if (o.data_prevista) {
        const prev = new Date(o.data_prevista + 'T00:00:00');
        const diffTime = prev.getTime() - hojeObj.getTime();
        dias_prazo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
      return { ...o, dias_prazo };
    });

    // Ordenação
    result.sort((a, b) => {
      if (sortBy === "data_asc") return a.dias_prazo - b.dias_prazo;
      if (sortBy === "valor_desc") return b.valor_total - a.valor_total;
      if (sortBy === "qtd_desc") return b.total_itens - a.total_itens;
      if (sortBy === "impacto_desc") return b.impacto_financeiro - a.impacto_financeiro;
      return 0;
    });

    return result;
  }, [rawData, canal, search, fornecedorFilter, showOnlyDelayed, sortBy]);

  useEffect(() => {
    if (search.trim().length > 0 && processedOrders.length > 0) {
      const expansion: Record<string, boolean> = {};
      processedOrders.forEach(order => {
        expansion[order.id_pedido] = true;
      });
      setExpandedOrders(expansion);
    }
  }, [search, processedOrders.length]);

  const stats = useMemo(() => {
    let totalValor = 0;
    let totalQtd = 0;
    let atrasados = 0;
    const hoje = new Date().toISOString().split('T')[0];

    processedOrders.forEach(o => {
      totalValor += o.valor_total;
      totalQtd += o.total_itens;
      if (o.data_prevista && o.data_prevista < hoje) atrasados++;
    });

    return { totalValor, totalQtd, atrasados, totalPedidos: processedOrders.length };
  }, [processedOrders]);

  // Agrupa os pedidos filtrados por DATA para o Calendário
  const calendarData = useMemo(() => {
    const groups: Record<string, any[]> = {};
    processedOrders.forEach(o => {
      const d = o.data_prevista || "Sem Data Prevista";
      if(!groups[d]) groups[d] = [];
      groups[d].push(o);
    });
    
    // Retorna ordenado pela data
    return Object.keys(groups).sort().map(date => ({
      date,
      orders: groups[date]
    }));
  }, [processedOrders]);

  if (loading) return <div className="p-10 text-center text-slate-500">Carregando pedidos em andamento...</div>;

  return (
    <div className="space-y-6">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="text-blue-600" /> Recebimentos Previstos
          </h2>
          <p className="text-sm text-slate-500">Acompanhamento detalhado de pedidos de compra em andamento.</p>
        </div>
        
        <div className="flex bg-slate-200 p-1 rounded-lg">
          {(["geral", "loja", "site"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setCanal(tab)}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-md uppercase transition-all",
                canal === tab ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {tab === "loja" ? "LOJA" : tab === "site" ? "SITE" : "GERAL"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">Volume Financeiro</div>
          <div className="text-2xl font-bold text-slate-800">{fCurrency(stats.totalValor)}</div>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">Total de Pedidos</div>
          <div className="text-2xl font-bold text-slate-800">{stats.totalPedidos} <span className="text-sm font-normal text-slate-400">pedidos</span></div>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">Peças em Trânsito</div>
          <div className="text-2xl font-bold text-slate-800">{fNum(stats.totalQtd)} <span className="text-sm font-normal text-slate-400">unid.</span></div>
        </Card>
        {/* CARD DE ATRASADOS AGORA É CLICÁVEL PARA FILTRAR */}
        <Card 
          onClick={() => setShowOnlyDelayed(!showOnlyDelayed)}
          className={cn(
            "p-4 border-l-4 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 shadow-sm", 
            stats.atrasados > 0 ? "border-l-red-500 bg-red-50 hover:bg-red-100" : "border-l-green-500",
            showOnlyDelayed && "ring-2 ring-red-400 ring-offset-2"
          )}
          title="Clique para filtrar apenas os atrasados"
        >
          <div className="text-xs text-slate-500 font-bold uppercase mb-1 flex items-center justify-between">
            Pedidos Atrasados
            {showOnlyDelayed && <Badge variant="destructive" className="text-[9px]">Ativo</Badge>}
          </div>
          <div className={cn("text-2xl font-bold", stats.atrasados > 0 ? "text-red-600" : "text-green-600")}>
            {stats.atrasados} <span className="text-sm font-normal opacity-70">pedidos</span>
          </div>
        </Card>
      </div>

      {/* BARRA DE AÇÕES */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 flex gap-2 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Buscar por SKU, Produto, ID, Número, OC..." 
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Dropdown Fornecedor */}
          <div className="relative w-full md:w-[180px]">
            <Filter className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <select
              value={fornecedorFilter}
              onChange={(e) => setFornecedorFilter(e.target.value)}
              className="flex h-10 w-full appearance-none items-center rounded-md border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">Todos Fornecs</option>
              {suppliers.map((f: any) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </div>

          {/* Dropdown Ordenação */}
          <div className="relative w-full md:w-[180px]">
            <ArrowDownUp className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex h-10 w-full appearance-none items-center rounded-md border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="data_asc">Entrega Mais Próxima</option>
              <option value="valor_desc">Maior Valor (R$)</option>
              <option value="qtd_desc">Mais Itens (Un)</option>
              <option value="impacto_desc">Melhor Negociação</option>
            </select>
          </div>

          <Button onClick={() => setCalendarOpen(true)} className="gap-2 bg-slate-800 hover:bg-slate-700 text-white flex-1 md:flex-none">
            <CalendarIcon size={16} /> <span className="hidden md:inline">Agenda</span>
          </Button>

          <Button onClick={exportToPDF} variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 flex-1 md:flex-none">
            <FileText size={16} /> PDF
          </Button>
        </div>
      </div>

      <div className="space-y-3 pb-10">
        {processedOrders.length === 0 && (
          <div className="text-center py-10 text-slate-500 bg-white rounded-xl border border-dashed">Nenhum pedido encontrado.</div>
        )}

        {processedOrders.map(order => {
          const isExpanded = expandedOrders[order.id_pedido];
          const hoje = new Date().toISOString().split('T')[0];
          const isLate = order.data_prevista && order.data_prevista < hoje;
          
          const displayDoc = order.ordem_compra || order.numero || order.id_pedido;
          const labelDoc = order.ordem_compra ? "OC" : (order.numero ? "Nº" : "ID");

          return (
            <Card key={order.id_pedido} className="overflow-hidden border-slate-200 transition-all hover:border-blue-300">
              <div 
                className="flex items-center justify-between p-4 cursor-pointer bg-white hover:bg-slate-50"
                onClick={() => toggleRow(order.id_pedido)}
              >
                <div className="flex items-center gap-4 w-1/3">
                  <div className="bg-blue-100 text-blue-700 p-2 rounded-lg shrink-0">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-bold text-slate-400">{labelDoc}</span>
                      <span className="font-bold text-slate-800 text-lg">#{displayDoc}</span>
                      <Badge variant="outline" className={order.loja === 'PORTFIO' ? "text-purple-600 border-purple-200 bg-purple-50" : "text-orange-600 border-orange-200 bg-orange-50"}>
                        {order.loja === 'PORTFIO' ? 'SITE' : order.loja === 'PORTCASA' ? 'LOJA' : order.loja}
                        </Badge>
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1 truncate">
                      <Store size={12} className="shrink-0"/> <span className="truncate">{order.fornecedor || "Fornecedor não informado"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 md:gap-8 justify-end">
                  <div className="text-right hidden md:block">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Data Emissão</div>
                    <div className="text-sm font-medium text-slate-700">
                      {order.data_pedido ? new Date(order.data_pedido).toLocaleDateString('pt-BR') : "-"}
                    </div>
                  </div>
                  
                  <div className="text-right hidden xl:block w-32">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Impacto Comercial</div>
                    {order.impacto_financeiro !== 0 ? (
                      <div className={cn("text-sm font-bold", order.impacto_financeiro > 0 ? "text-green-600" : "text-red-500")}>
                        {order.impacto_financeiro > 0 ? "+" : ""}{fCurrency(order.impacto_financeiro)}
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-slate-400">Sem alteração</div>
                    )}
                  </div>
                  
                  <div className="text-right w-24 md:w-32">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Status</div>
                    {order.dias_prazo === 9999 ? (
                       <span className="text-sm font-medium text-slate-400">Sem data</span>
                    ) : order.dias_prazo < 0 ? (
                      <span className="text-sm font-bold text-red-500 flex items-center justify-end gap-1"><AlertTriangle size={12}/> Atrasado {Math.abs(order.dias_prazo)}d</span>
                    ) : order.dias_prazo === 0 ? (
                      <span className="text-sm font-bold text-orange-500">Chega Hoje</span>
                    ) : (
                      <span className="text-sm font-bold text-slate-700">Em {order.dias_prazo} dias</span>
                    )}
                  </div>

                  <div className="text-right w-16 md:w-20">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Itens</div>
                    <div className="text-sm font-bold text-slate-700">{fNum(order.total_itens)}<span className="hidden md:inline"> un.</span></div>
                  </div>

                  <div className="text-right w-16 md:w-24">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Itens</div>
                    <div className="text-sm font-bold text-slate-700">{fNum(order.total_itens)}<span className="hidden md:inline"> un.</span></div>
                  </div>

                  <div className="text-right w-24 md:w-32">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Total</div>
                    <div className="text-sm md:text-base font-bold text-slate-800">{fCurrency(order.valor_total)}</div>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="bg-slate-50 p-4 border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-2 px-3 text-[10px] uppercase text-slate-500 font-bold">SKU</th>
                        <th className="py-2 px-3 text-[10px] uppercase text-slate-500 font-bold">Produto</th>
                        <th className="py-2 px-3 text-[10px] uppercase text-slate-500 font-bold text-center">Qtd</th>
                        <th className="py-2 px-3 text-[10px] uppercase text-slate-500 font-bold text-right">Última Entrada</th>
                        <th className="py-2 px-3 text-[10px] uppercase text-slate-500 font-bold text-right">Custo no Pedido</th>
                        <th className="py-2 px-3 text-[10px] uppercase text-slate-500 font-bold text-right">Variação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.itens.map((item: any) => {
                        const diff = item.custo_efetivo_pedido - item.custo_atual_sistema;
                        const percentDiff = item.custo_atual_sistema > 0 ? (diff / item.custo_atual_sistema) * 100 : 0;
                        const isCheaper = diff < 0;

                        return (
                          <tr key={item.sku} className="border-b border-slate-100 last:border-0 hover:bg-white transition-colors">
                            <td className="py-2 px-3 text-xs font-mono text-slate-500">{item.sku}</td>
                            <td className="py-2 px-3 text-xs font-medium text-slate-700 max-w-[250px] truncate" title={item.produto_nome}>{item.produto_nome || "Produto Desconhecido"}</td>
                            <td className="py-2 px-3 text-xs text-center font-bold">{fNum(item.quantidade)}</td>
                            <td className="py-2 px-3 text-xs text-right text-slate-500">{fCurrency(item.custo_atual_sistema)}</td>
                            
                            <td className="py-2 px-3 text-xs text-right font-bold">
                              <button 
                                onClick={(e) => { e.stopPropagation(); fetchHistoricoCusto(item.sku, item.produto_nome); }}
                                className="flex items-center justify-end gap-1 w-full text-blue-600 hover:underline decoration-dotted underline-offset-2"
                                title="Ver gráfico de preços"
                              >
                                <History size={12} /> {fCurrency(item.custo_efetivo_pedido)}
                              </button>
                            </td>
                            
                            <td className="py-2 px-3 text-right">
                              {diff !== 0 ? (
                                <Badge variant="outline" className={cn(
                                  "text-[10px] h-5",
                                  isCheaper ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                                )}>
                                  {isCheaper ? <TrendingDown size={10} className="mr-1" /> : <TrendingUp size={10} className="mr-1" />}
                                  {percentDiff > 0 ? "+" : ""}{percentDiff.toFixed(1)}%
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-slate-300">Igual</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* MODAL DO CALENDÁRIO */}
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0 border-b pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <CalendarIcon className="text-slate-700" /> Agenda de Entregas
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-2 space-y-6 pt-4">
            {calendarData.length === 0 ? (
              <div className="text-center py-10 text-slate-500">Nenhum pedido na agenda.</div>
            ) : (
              calendarData.map((group, idx) => {
                const isLate = group.date !== "Sem Data Prevista" && group.date < new Date().toISOString().split('T')[0];
                return (
                  <div key={idx} className="space-y-2 relative">
                    {/* Cabeçalho do Dia */}
                    <div className="sticky top-0 z-10 bg-white/90 backdrop-blur pb-1 border-b border-slate-100 flex items-center justify-between">
                      <h3 className={cn("text-sm font-bold flex items-center gap-2", isLate ? "text-red-600" : "text-slate-700")}>
                        <CalendarClock size={16} /> 
                        {group.date === "Sem Data Prevista" ? group.date : new Date(group.date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        {isLate && <Badge variant="destructive" className="ml-2">Atrasado</Badge>}
                      </h3>
                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{group.orders.length} pedidos</span>
                    </div>
                    
                    {/* Pedidos do Dia */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.orders.map(o => (
                        <div key={o.id_pedido} className={cn("border rounded-lg p-3 text-sm flex flex-col gap-1", isLate ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-slate-50")}>
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-700">#{o.ordem_compra || o.numero || o.id_pedido}</span>
                            <span>{fCurrency(o.valor_total)}</span>
                          </div>
                          <div className="text-xs text-slate-500 truncate">{o.fornecedor}</div>
                          <div className="text-xs font-medium text-slate-600 flex justify-between mt-1">
                            <span>{fNum(o.total_itens)} itens</span>
                            <Badge variant="outline" className="text-[9px] h-4">
                            {o.loja === 'PORTFIO' ? 'SITE' : o.loja === 'PORTCASA' ? 'LOJA' : o.loja}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE HISTÓRICO DE PREÇOS */}
      <Dialog open={historyModal.isOpen} onOpenChange={(v) => setHistoryModal(prev => ({...prev, isOpen: v}))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="text-blue-600" /> Evolução de Preços
            </DialogTitle>
            <div className="text-sm text-slate-500 font-medium pt-2 border-b pb-2">
              <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">{historyModal.sku}</span> {historyModal.nome}
            </div>
          </DialogHeader>
          
          <div className="mt-2 space-y-6">
            {historyModal.loading ? (
              <div className="text-center py-10 text-sm text-slate-400">Carregando histórico...</div>
            ) : historyModal.data.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-400">Nenhuma compra anterior encontrada para este produto.</div>
            ) : (
              <>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyModal.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="data_curta" tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(val) => `R$ ${val}`} tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} width={60} />
                      <Tooltip 
                        formatter={(value: any) => [fCurrency(value), "Custo Real"]}
                        labelFormatter={(label, payload) => {
                          const item = payload?.[0]?.payload;
                          return item ? `Data: ${new Date(item.data_ref).toLocaleDateString('pt-BR')} (${item.tipo})` : label;
                        }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      />
                      <Line type="monotone" dataKey="valor_num" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Últimas 5 Aquisições</h4>
                  <table className="w-full text-left text-sm border-t border-slate-100">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="py-1 px-2 text-[10px] text-slate-500 font-semibold">Data</th>
                        <th className="py-1 px-2 text-[10px] text-slate-500 font-semibold text-center">Tipo</th>
                        <th className="py-1 px-2 text-[10px] text-slate-500 font-semibold">Doc / NFE</th>
                        <th className="py-1 px-2 text-[10px] text-slate-500 font-semibold">Fornecedor</th>
                        <th className="py-1 px-2 text-[10px] text-slate-500 font-semibold text-right">Custo Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...historyModal.data].reverse().slice(0, 5).map((h, i) => (
                        <tr key={i} className="border-b last:border-0 border-slate-100">
                          <td className="py-1 px-2 text-xs text-slate-700">{h.data_ref ? new Date(h.data_ref).toLocaleDateString('pt-BR') : "-"}</td>
                          <td className="py-1 px-2 text-xs text-center">
                            <Badge variant="secondary" className="text-[9px] font-mono">{h.tipo}</Badge>
                          </td>
                          <td className="py-1 px-2 text-xs text-slate-500">{h.doc || "-"}</td>
                          <td className="py-1 px-2 text-xs text-slate-500 truncate max-w-[150px]" title={h.fornecedor}>{h.fornecedor || "-"}</td>
                          <td className="py-1 px-2 text-xs text-right font-bold text-slate-800">{fCurrency(h.valor_num)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default function PedidosPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <PedidosContent />
    </Suspense>
  );
}