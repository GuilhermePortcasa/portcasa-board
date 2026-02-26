"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft, Package, TrendingUp, Boxes, Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Correção para Next.js 15: params é uma Promise
export default function NotificacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params);
  const id = unwrappedParams.id;

  const [notificacao, setNotificacao] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from("notificacoes").select("*").eq("id", id).single();
      
      if (data) {
        setNotificacao(data);
        if (user) {
          await supabase.from("notificacoes_estado").upsert({ notificacao_id: id, user_id: user.id, lida: true });
        }
      }
    }
    loadData();
  }, [id, supabase]);

  if (!notificacao) return <div className="p-10 text-center animate-pulse">Carregando detalhes...</div>;

  const d = notificacao.detalhes || {};
  const itens = d.itens || (d.sku ? [d] : []); // Lida com o formato antigo e o novo

  // Função para exportar os dados para CSV
  const exportToCSV = () => {
    if (!itens || itens.length === 0) return;

    const headers = ["SKU", "Produto", "Quantidade", "Custo Anterior", "Custo Recebido", "Variacao %", "Preco Venda", "Markup %"];
    
    const rows = itens.map((i: any) => {
      const cNovo = i.custo_novo || i.custo || 0;
      const cAnt = i.custo_ant;
      const pVenda = i.preco_venda || 0;
      const mup = i.markup || 0;
      
      let variacao = "0%";
      if (cAnt) {
        variacao = (((cNovo - cAnt) / cAnt) * 100).toFixed(2) + "%";
      } else {
        variacao = "Novo";
      }

      return [
        i.sku, 
        `"${i.nome || 'Produto Indefinido'}"`, 
        i.quantidade, 
        cAnt ? cAnt.toFixed(2).replace('.', ',') : 'N/A', 
        cNovo.toFixed(2).replace('.', ','), 
        variacao.replace('.', ','),
        pVenda.toFixed(2).replace('.', ','),
        mup.toFixed(2).replace('.', ',') + "%"
      ].join(";");
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `auditoria_entrada_${d.numero_pedido || d.nfe || 'produtos'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pt-6 px-4">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-2 text-slate-500"><ArrowLeft size={16} className="mr-2"/> Voltar</Button>
      </Link>

      <Card className="border-none shadow-xl overflow-hidden">
        <CardHeader className="bg-slate-900 text-white p-6">
          <div className="flex items-center gap-3">
            {notificacao.tipo === 'fechamento_diario' ? <TrendingUp size={24} className="text-emerald-400"/> : <Boxes size={24} className="text-blue-400"/>}
            <div>
              <h1 className="text-xl font-bold">{notificacao.titulo}</h1>
              <p className="text-slate-400 text-xs mt-1">{new Date(notificacao.created_at).toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {notificacao.tipo === 'fechamento_diario' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                <p className="text-[10px] font-bold text-orange-400 uppercase">Loja Física</p>
                <p className="text-2xl font-black text-orange-700">R$ {d.loja?.receita?.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                <p className="text-xs text-orange-600/70">{d.loja?.pedidos} vendas</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <p className="text-[10px] font-bold text-blue-400 uppercase">Site / E-commerce</p>
                <p className="text-2xl font-black text-blue-700">R$ {d.site?.receita?.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                <p className="text-xs text-blue-600/70">{d.site?.pedidos} vendas</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div><p className="text-[10px] text-slate-400 uppercase font-bold">Fornecedor</p><p className="font-bold text-slate-700">{d.fornecedor}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-bold">Pedido / NF</p><p className="font-bold text-slate-700">#{d.numero_pedido || d.nfe}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-bold">Destino</p><p className="font-bold text-blue-600">{d.loja_destino}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase font-bold">Status</p><p className="font-bold text-emerald-600">RECEBIDO</p></div>
                </div>
                
                <Button onClick={exportToCSV} variant="outline" className="text-xs border-slate-300">
                  <Download size={14} className="mr-2" /> Exportar Auditoria
                </Button>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Package size={16}/> Itens e Auditoria de Preço</h3>
                <div className="bg-slate-50 rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="bg-slate-100 text-[10px] uppercase text-slate-500 font-bold">
                        <th className="p-3 text-left">Produto</th>
                        <th className="p-3 text-center">Qtd</th>
                        <th className="p-3 text-right">Custo Ant.</th>
                        <th className="p-3 text-right">Custo Novo</th>
                        <th className="p-3 text-center">Variação</th>
                        <th className="p-3 text-right">Preço Venda</th>
                        <th className="p-3 text-right">Markup Atual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {itens.map((item: any, idx: number) => {
                        const custoNovo = item.custo_novo || item.custo || 0;
                        const custoAnt = item.custo_ant;
                        
                        // Cálculo de variação
                        let variacao = 0;
                        let varColor = "text-slate-500";
                        let varSinal = "";

                        if (custoAnt) {
                          variacao = ((custoNovo - custoAnt) / custoAnt) * 100;
                          if (variacao > 0.01) { varColor = "text-red-600 font-bold"; varSinal = "▲"; }
                          else if (variacao < -0.01) { varColor = "text-emerald-600 font-bold"; varSinal = "▼"; }
                        }

                        return (
                          <tr key={idx} className="hover:bg-white transition-colors">
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-700 text-[11px] leading-tight truncate max-w-[250px]" title={item.nome}>
                                  {item.nome || "Nome não disponível"}
                                </span>
                                <span className="font-mono text-[9px] text-slate-400">SKU: {item.sku}</span>
                              </div>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-600">{item.quantidade}</td>
                            
                            <td className="p-3 text-right text-slate-400">
                              {custoAnt ? `R$ ${custoAnt.toFixed(2).replace('.', ',')}` : <span className="text-[9px] uppercase">Novo Produto</span>}
                            </td>
                            
                            <td className="p-3 text-right font-bold text-slate-700">
                              R$ {custoNovo.toFixed(2).replace('.', ',')}
                            </td>
                            
                            <td className={cn("p-3 text-center text-xs", varColor)}>
                              {custoAnt ? `${varSinal} ${Math.abs(variacao).toFixed(1).replace('.', ',')}%` : "-"}
                            </td>

                            <td className="p-3 text-right text-blue-600 font-medium">
                              R$ {(item.preco_venda || 0).toFixed(2).replace('.', ',')}
                            </td>

                            <td className="p-3 text-right font-bold text-purple-600">
                              {(item.markup || 0).toFixed(1).replace('.', ',')}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}