"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Bell, Check, X, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function HeaderNotificacoes() {
  const supabase = createClient();
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchNotificacoes = useCallback(async (uid: string) => {
    const { data: notifs } = await supabase.from("notificacoes").select("*").order("created_at", { ascending: false }).limit(30);
    const { data: estados } = await supabase.from("notificacoes_estado").select("*").eq("user_id", uid);
    
    if (notifs) {
      const mescladas = notifs.map(n => {
        const estadoUsuario = estados?.find(e => e.notificacao_id === n.id);
        return { ...n, lida: estadoUsuario?.lida || false, oculta: estadoUsuario?.oculta || false };
      }).filter(n => !n.oculta);
      setNotificacoes(mescladas);
    }
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        fetchNotificacoes(user.id);
      }
    };
    init();
    
    const channel = supabase.channel('notificacoes-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes' }, () => {
        if (userId) fetchNotificacoes(userId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchNotificacoes]);

  const marcarComoLida = async (id: string, e: any) => {
    e.preventDefault(); e.stopPropagation();
    if (!userId) return;
    await supabase.from("notificacoes_estado").upsert({ notificacao_id: id, user_id: userId, lida: true });
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  };

  const apagarNotificacao = async (id: string, e: any) => {
    e.preventDefault(); e.stopPropagation();
    if (!userId) return;
    await supabase.from("notificacoes_estado").upsert({ notificacao_id: id, user_id: userId, oculta: true });
    setNotificacoes(prev => prev.filter(n => n.id !== id));
  };

  const limparTudo = async () => {
    if (!userId || notificacoes.length === 0) return;
    const upserts = notificacoes.map(n => ({ notificacao_id: n.id, user_id: userId, oculta: true }));
    await supabase.from("notificacoes_estado").upsert(upserts);
    setNotificacoes([]);
  };

  const naoLidas = notificacoes.filter(n => !n.lida).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-full">
          <Bell size={20} className="text-slate-600" />
          {naoLidas > 0 && <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">{naoLidas}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-2xl border-slate-200" align="end">
        <div className="bg-slate-900 text-white font-bold text-sm p-3 rounded-t-lg flex justify-between items-center">
          <span>Notificações</span>
          {notificacoes.length > 0 && (
            <button onClick={limparTudo} className="text-[10px] flex items-center gap-1 hover:text-red-400 transition-colors uppercase tracking-tighter">
              <Trash2 size={12}/> Limpar Tudo
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto bg-white">
          {notificacoes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">Nenhum aviso novo.</div>
          ) : (
            notificacoes.map(n => (
              <Link href={`/notificacao/${n.id}`} key={n.id} className={`block p-3 border-b hover:bg-slate-50 relative group ${!n.lida ? 'bg-blue-50/40' : ''}`}>
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-[11px] font-bold ${!n.lida ? 'text-blue-700' : 'text-slate-700'}`}>{n.titulo}</span>
                  <span className="text-[9px] text-slate-400 whitespace-nowrap">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}</span>
                </div>
                <p className="text-[10px] text-slate-500 pr-6 leading-tight line-clamp-2">{n.mensagem}</p>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!n.lida && <button onClick={(e) => marcarComoLida(n.id, e)} className="p-1.5 bg-white border rounded-full shadow-sm text-emerald-600 hover:bg-emerald-50"><Check size={12}/></button>}
                  <button onClick={(e) => apagarNotificacao(n.id, e)} className="p-1.5 bg-white border rounded-full shadow-sm text-red-500 hover:bg-red-50"><X size={12}/></button>
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}