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
  Search, Store, TrendingDown, TrendingUp, Truck 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);

export default function PedidosPage() {
  const supabase = createClient();
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [canal, setCanal] = useState<"geral" | "loja" | "site">("geral");
  const [search, setSearch] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  
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
    
    // A mágica: Usamos a View do banco que já juntou NFs e Pedidos Antigos
    const { data } = await supabase
      .from("view_historico_entradas")
      .select("*")
      .eq("sku", sku)
      .order("data_ref", { ascending: true })
      .limit(50);

    const chartData = (data || []).map(item => ({
      ...item,
      data_curta: item.data_ref ? new Date(item.data_ref).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '',
      valor_num: Number(Number(item.custo_real).toFixed(2)) 
    }));

    setHistoryModal({ isOpen: true, sku, nome, data: chartData, loading: false });
  };

  const processedOrders = useMemo(() => {
    let filtered = rawData;
    if (canal === "loja") filtered = filtered.filter(i => i.loja === "PORTCASA");
    if (canal === "site") filtered = filtered.filter(i => i.loja === "PORTFIO");

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
    });

    let result = Object.values(groups);

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(o => 
        o.id_pedido.toString().includes(s) || 
        (o.numero && o.numero.toLowerCase().includes(s)) ||
        (o.ordem_compra && o.ordem_compra.toLowerCase().includes(s)) ||
        (o.fornecedor && o.fornecedor.toLowerCase().includes(s))
      );
    }

    return result;
  }, [rawData, canal, search]);

  const toggleRow = (id: string) => {
    setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
              {tab === "loja" ? "PORTCASA" : tab === "site" ? "PORTFIO" : "GERAL"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">Volume Financeiro (A Chegar)</div>
          <div className="text-2xl font-bold text-slate-800">{fCurrency(stats.totalValor)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">Total de Pedidos</div>
          <div className="text-2xl font-bold text-slate-800">{stats.totalPedidos} <span className="text-sm font-normal text-slate-400">pedidos</span></div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">Peças em Trânsito</div>
          <div className="text-2xl font-bold text-slate-800">{fNum(stats.totalQtd)} <span className="text-sm font-normal text-slate-400">unid.</span></div>
        </Card>
        <Card className={cn("p-4 border-l-4", stats.atrasados > 0 ? "border-l-red-500 bg-red-50" : "border-l-green-500")}>
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">Pedidos Atrasados</div>
          <div className={cn("text-2xl font-bold", stats.atrasados > 0 ? "text-red-600" : "text-green-600")}>
            {stats.atrasados} <span className="text-sm font-normal opacity-70">pedidos</span>
          </div>
        </Card>
      </div>

      <div className="flex gap-2 relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input 
          placeholder="Buscar por ID, Número, OC ou Fornecedor..." 
          className="pl-9 max-w-md bg-white"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3 pb-10">
        {processedOrders.length === 0 && (
          <div className="text-center py-10 text-slate-500 bg-white rounded-xl border border-dashed">Nenhum pedido encontrado.</div>
        )}

        {processedOrders.map(order => {
          const isExpanded = expandedOrders[order.id_pedido];
          const hoje = new Date().toISOString().split('T')[0];
          const isLate = order.data_prevista && order.data_prevista < hoje;
          
          // Lógica de visualização do documento no cabeçalho do card
          const displayDoc = order.ordem_compra || order.numero || order.id_pedido;
          const labelDoc = order.ordem_compra ? "OC" : (order.numero ? "Nº" : "ID");

          return (
            <Card key={order.id_pedido} className="overflow-hidden border-slate-200 transition-all hover:border-blue-300">
              <div 
                className="flex items-center justify-between p-4 cursor-pointer bg-white hover:bg-slate-50"
                onClick={() => toggleRow(order.id_pedido)}
              >
                <div className="flex items-center gap-4 w-1/3">
                  <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400">{labelDoc}</span>
                      <span className="font-bold text-slate-800 text-lg">#{displayDoc}</span>
                      <Badge variant="outline" className={order.loja === 'PORTFIO' ? "text-purple-600 border-purple-200 bg-purple-50" : "text-orange-600 border-orange-200 bg-orange-50"}>
                        {order.loja}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1">
                      <Store size={12}/> {order.fornecedor || "Fornecedor não informado"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8 w-2/3 justify-end">
                  <div className="text-right hidden md:block">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Data Emissão</div>
                    <div className="text-sm font-medium text-slate-700">
                      {order.data_pedido ? new Date(order.data_pedido).toLocaleDateString('pt-BR') : "-"}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Previsão</div>
                    <div className={cn("text-sm font-bold flex items-center gap-1", isLate ? "text-red-500" : "text-slate-700")}>
                      <CalendarClock size={14} />
                      {order.data_prevista ? new Date(order.data_prevista).toLocaleDateString('pt-BR') : "Sem data"}
                    </div>
                  </div>

                  <div className="text-right w-24">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Itens</div>
                    <div className="text-sm font-bold text-slate-700">{fNum(order.total_itens)} un.</div>
                  </div>

                  <div className="text-right w-32">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Total do Pedido</div>
                    <div className="text-base font-bold text-slate-800">{fCurrency(order.valor_total)}</div>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="bg-slate-50 p-4 border-t border-slate-100">
                  <table className="w-full text-left border-collapse">
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
                            <td className="py-2 px-3 text-xs font-medium text-slate-700">{item.produto_nome || "Produto Desconhecido"}</td>
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