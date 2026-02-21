"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useDashboard } from "@/providers/dashboard-context";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, 
  Package, 
  Store, 
  Globe, 
  BarChart3,
  Truck,
  Receipt // Ícone para representar nota/venda
} from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { subDays, format } from "date-fns";

const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);

const COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#f43f5e', '#eab308'];

export default function VisaoGeralPage() {
  const supabase = createClient();
  const { rawData, totalStats, loading } = useDashboard();
  
  const [comprasStats, setComprasStats] = useState({ qtdPedidos: 0, valorTotal: 0 });
  // Novo estado para contagem de pedidos únicos (Vendas)
  const [vendasUnicas, setVendasUnicas] = useState({ total: 0, loja: 0, site: 0 });

  useEffect(() => {
    async function fetchData() {
      // 1. Busca Compras em andamento
      const { data: pedidosRaw } = await supabase
        .from("view_pedidos_detalhados")
        .select("id_pedido, quantidade, custo_efetivo_pedido");

      if (pedidosRaw) {
        const groups: Record<string, number> = {};
        pedidosRaw.forEach(item => {
          groups[item.id_pedido] = (groups[item.id_pedido] || 0) + (Number(item.quantidade) * Number(item.custo_efetivo_pedido));
        });
        setComprasStats({
          qtdPedidos: Object.keys(groups).length,
          valorTotal: Object.values(groups).reduce((acc, val) => acc + val, 0)
        });
      }

      // 2. BUSCA QUANTIDADE DE VENDAS ÚNICAS (Últimos 30 dias)
      const dataCorte = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const { data: vendasRaw } = await supabase
        .from("view_vendas_detalhadas")
        .select("id_venda, canal_macro")
        .gte("data_venda", dataCorte);

      if (vendasRaw) {
        const idsTotal = new Set();
        const idsLoja = new Set();
        const idsSite = new Set();

        vendasRaw.forEach(v => {
          idsTotal.add(v.id_venda);
          if (v.canal_macro === "LOJA") idsLoja.add(v.id_venda);
          if (v.canal_macro === "SITE") idsSite.add(v.id_venda);
        });

        setVendasUnicas({
          total: idsTotal.size,
          loja: idsLoja.size,
          site: idsSite.size
        });
      }
    }
    fetchData();
  }, [supabase]);

  // Ticket Médio calculado por VENDA (AOV)
  const ticketsMedios = useMemo(() => {
    const totalVendas = vendasUnicas.total || 1; // evita divisão por zero
    const totalLoja = vendasUnicas.loja || 1;
    const totalSite = vendasUnicas.site || 1;

    // Faturamento do site (Soma dos 3 subcanais do contexto)
    const recSite = totalStats.bd_pf_30 + totalStats.bd_full_30 + totalStats.bd_cm_30;

    return {
      geral: totalStats.r30 / totalVendas,
      loja: totalStats.bd_loja_30 / totalLoja,
      site: recSite / totalSite
    };
  }, [totalStats, vendasUnicas]);

  // Lógica de Gráfico por Categoria (Mantida)
  const categoryData = useMemo(() => {
    const catMap: Record<string, number> = {};
    rawData.forEach(item => {
      const receita = Number(item.rec_30d_site || 0) + Number(item.rec_30d_loja || 0);
      if (receita > 0) {
        const cat = item.categoria || "Outros";
        catMap[cat] = (catMap[cat] || 0) + receita;
      }
    });
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [rawData]);

  if (loading) return <div className="p-10 text-center animate-pulse text-slate-500 italic">Sincronizando painel geral...</div>;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-800">Painel de Controle</h1>
        <p className="text-slate-500 text-sm">Resumo operacional consolidado (30 dias)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* FATURAMENTO */}
        <Card className="border-none shadow-md bg-blue-600 text-white">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase opacity-80">Faturamento</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{fCurrency(totalStats.r30)}</div>
            <div className="flex justify-between mt-2 text-[10px] opacity-80 font-medium">
              <span className="flex items-center gap-1"><Store size={10}/> {fCurrency(totalStats.bd_loja_30)}</span>
              <span className="flex items-center gap-1"><Globe size={10}/> {fCurrency(totalStats.bd_pf_30 + totalStats.bd_full_30 + totalStats.bd_cm_30)}</span>
            </div>
          </CardContent>
        </Card>

        {/* PATRIMÔNIO */}
        <Card className="border-none shadow-md bg-white border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase text-slate-400">Patrimônio (Custo)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{fCurrency(totalStats.custo)}</div>
            <p className="text-[10px] mt-1 text-slate-400 font-bold uppercase tracking-tight">Valor Total Imobilizado</p>
          </CardContent>
        </Card>

        {/* TICKET MÉDIO (POR VENDA) */}
        <Card className="border-none shadow-md bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-slate-400">Ticket Médio (Venda)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">{fCurrency(ticketsMedios.geral)}</div>
            <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-bold uppercase">
              <span className="flex items-center gap-1 text-orange-600">
                <Store size={10}/> {fCurrency(ticketsMedios.loja)}
              </span>
              <span className="flex items-center gap-1 text-blue-600">
                <Globe size={10}/> {fCurrency(ticketsMedios.site)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* COMPRAS EM TRÂNSITO */}
        <Card className="border-none shadow-md bg-white border-l-4 border-l-orange-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase text-slate-400">Compras em Trânsito</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-orange-600">{fCurrency(comprasStats.valorTotal)}</div>
            <p className="text-[10px] mt-1 text-slate-400 font-bold uppercase">{comprasStats.qtdPedidos} pedidos aguardando</p>
          </CardContent>
        </Card>
      </div>

      {/* RESTO DO CÓDIGO (GRÁFICOS E LINKS) MANTIDO IGUAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-md bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2">
              <BarChart3 size={18} className="text-blue-500" /> Faturamento por Categoria (Top 6)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ left: 40, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 'bold', fill: '#64748b'}} width={120} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    formatter={(val: any) => fCurrency(Number(val))} 
                    contentStyle={{borderRadius: '10px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={25}>
                    {categoryData.map((_entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h3 className="font-bold text-slate-700 px-1 flex items-center gap-2 text-xs uppercase tracking-widest">Navegação</h3>
          <Link href="/vendas" className="block group">
            <Card className="hover:border-blue-500 transition-all shadow-sm border-slate-100">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all"><TrendingUp size={20} /></div>
                <div><p className="font-bold text-slate-800 text-sm">Vendas Detalhadas</p><p className="text-[11px] text-slate-500">Performance e Margens</p></div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/estoque" className="block group">
            <Card className="hover:border-emerald-500 transition-all shadow-sm border-slate-100">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all"><Package size={20} /></div>
                <div><p className="font-bold text-slate-800 text-sm">Giro de Estoque</p><p className="text-[11px] text-slate-500">Saldo e Sugestão de Compra</p></div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/compras" className="block group">
            <Card className="hover:border-orange-500 transition-all shadow-sm border-slate-100">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="bg-orange-50 p-3 rounded-lg text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-all"><Truck size={20} /></div>
                <div><p className="font-bold text-slate-800 text-sm">Recebimentos</p><p className="text-[11px] text-slate-500">Pedidos em Andamento</p></div>
              </CardContent>
            </Card>
          </Link>
          <div className="bg-slate-900 rounded-xl p-4 text-white mt-6">
             <div className="flex items-center justify-between mb-4">
               <span className="text-[10px] uppercase font-black text-slate-400">Integrador</span>
               <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/><span className="text-[10px] font-bold">ONLINE</span></div>
             </div>
             <div className="space-y-1 text-[11px] text-slate-400">
               <p>Sincronização via Webhook em Tempo Real</p>
               <p>Base: Bling V3 (Produção)</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}