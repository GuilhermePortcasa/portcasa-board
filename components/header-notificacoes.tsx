"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Bell, Check, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function HeaderNotificacoes() {
  const supabase = createClient();
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Busca usuário atual e carrega notificações
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        fetchNotificacoes(user.id);
      }
    };
    init();
    
    // Escuta novas notificações em tempo real
    const channel = supabase.channel('notificacoes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes' }, (payload) => {
        // Nova notificação chega sempre não lida e não oculta para o usuário atual
        const nova = { ...payload.new, lida: false, oculta: false };
        setNotificacoes(prev => [nova, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchNotificacoes = async (uid: string) => {
    // 1. Busca as últimas notificações gerais
    const { data: notifs } = await supabase.from("notificacoes").select("*").order("created_at", { ascending: false }).limit(30);
    
    // 2. Busca o que ESSE usuário já leu ou apagou
    const { data: estados } = await supabase.from("notificacoes_estado").select("*").eq("user_id", uid);
    
    if (notifs) {
      // 3. Cruza os dados
      const mescladas = notifs.map(n => {
        const estadoUsuario = estados?.find(e => e.notificacao_id === n.id);
        return {
          ...n,
          lida: estadoUsuario?.lida || false,
          oculta: estadoUsuario?.oculta || false
        };
      }).filter(n => !n.oculta); // Oculta as que o usuário clicou em X

      setNotificacoes(mescladas);
    }
  };

  const marcarComoLida = async (id: string, e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userId) return;
    
    // Insere ou atualiza o estado PARA ESTE USUÁRIO (Upsert)
    await supabase.from("notificacoes_estado").upsert({ notificacao_id: id, user_id: userId, lida: true });
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  };

  const apagarNotificacao = async (id: string, e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userId) return;
    
    // Insere ou atualiza o estado PARA ESTE USUÁRIO marcando como oculta (Upsert)
    await supabase.from("notificacoes_estado").upsert({ notificacao_id: id, user_id: userId, oculta: true });
    setNotificacoes(prev => prev.filter(n => n.id !== id));
  };

  const naoLidas = notificacoes.filter(n => !n.lida).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell size={20} className="text-slate-600" />
          {naoLidas > 0 && (
            <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {naoLidas}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="bg-slate-900 text-white font-bold text-sm p-3 rounded-t-lg">Notificações</div>
        <div className="max-h-96 overflow-y-auto">
          {notificacoes.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">Nenhuma notificação nova.</div>
          ) : (
            notificacoes.map(n => (
              <Link href={`/notificacao/${n.id}`} key={n.id} className={`block p-3 border-b hover:bg-slate-50 relative group ${!n.lida ? 'bg-blue-50/50' : ''}`}>
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-xs font-bold ${!n.lida ? 'text-blue-700' : 'text-slate-700'}`}>{n.titulo}</span>
                  <span className="text-[9px] text-slate-400">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}</span>
                </div>
                <p className="text-[11px] text-slate-600 pr-6 leading-tight">{n.mensagem}</p>
                
                {/* Ações Rápidas (Aparecem no hover) */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex-col gap-1 hidden group-hover:flex">
                  {!n.lida && (
                    <button onClick={(e) => marcarComoLida(n.id, e)} className="p-1 bg-white border rounded shadow hover:bg-emerald-50 text-emerald-600" title="Marcar como lida"><Check size={12}/></button>
                  )}
                  <button onClick={(e) => apagarNotificacao(n.id, e)} className="p-1 bg-white border rounded shadow hover:bg-red-50 text-red-500" title="Excluir da minha lista"><X size={12}/></button>
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}