"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Package, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotificacaoPage({ params }: { params: { id: string } }) {
  const [notificacao, setNotificacao] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      // Pega usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      
      // Busca a notificação bruta
      const { data } = await supabase.from("notificacoes").select("*").eq("id", params.id).single();
      if (data) {
        setNotificacao(data);
        
        // Marca como LIDA na tabela de estados (só para esse usuário)
        if (user) {
          await supabase.from("notificacoes_estado").upsert({ 
            notificacao_id: params.id, 
            user_id: user.id, 
            lida: true 
          });
        }
      }
    }
    loadData();
  }, [params.id]);

  if (!notificacao) return <div className="p-10 text-center animate-pulse">Carregando detalhes...</div>;

  const d = notificacao.detalhes || {};

  return (
    <div className="space-y-6 max-w-3xl mx-auto pt-10">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-4 text-slate-500"><ArrowLeft size={16} className="mr-2"/> Voltar</Button>
      </Link>

      <Card className="border-none shadow-xl">
        <CardHeader className="bg-slate-900 text-white rounded-t-xl pb-6">
          <div className="flex items-center gap-3">
            {notificacao.tipo === 'fechamento_diario' ? <TrendingUp size={24} className="text-emerald-400"/> : <Package size={24} className="text-blue-400"/>}
            <h1 className="text-xl font-bold">{notificacao.titulo}</h1>
          </div>
          <p className="text-slate-300 text-sm mt-2">{notificacao.mensagem}</p>
        </CardHeader>

        <CardContent className="p-6">
          <h3 className="font-bold text-slate-800 uppercase tracking-widest text-xs mb-4 border-b pb-2">Detalhes Completos</h3>
          
          {notificacao.tipo === 'fechamento_diario' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border">
                <p className="text-xs font-bold text-slate-400 uppercase">Loja Física</p>
                <p className="text-2xl font-black text-slate-800 mt-1">R$ {d.loja?.receita?.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-500 mt-1">{d.loja?.pedidos} vendas registradas</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border">
                <p className="text-xs font-bold text-slate-400 uppercase">Site / E-commerce</p>
                <p className="text-2xl font-black text-slate-800 mt-1">R$ {d.site?.receita?.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-500 mt-1">{d.site?.pedidos} vendas registradas</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span className="font-bold text-slate-500">SKU:</span> <span className="font-mono">{d.sku}</span></div>
              <div className="flex justify-between p-2"><span className="font-bold text-slate-500">Fornecedor:</span> <span>{d.fornecedor}</span></div>
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span className="font-bold text-slate-500">Quantidade:</span> <span className="font-bold text-emerald-600">{d.quantidade} un</span></div>
              <div className="flex justify-between p-2"><span className="font-bold text-slate-500">Destino:</span> <span>{d.loja_destino}</span></div>
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span className="font-bold text-slate-500">Custo Unitário:</span> <span>R$ {Number(d.custo).toFixed(2)}</span></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}