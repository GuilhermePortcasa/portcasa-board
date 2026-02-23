"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { subDays, startOfDay, format } from "date-fns";

interface VendasContextType {
  salesData: any[];
  loading: boolean;
  isRefreshing: boolean; // Indica se está atualizando em background
  fetchSales: (days: number | null) => Promise<void>;
  lastDaysLoaded: number | null;
}

const VendasContext = createContext<VendasContextType>({} as VendasContextType);

export function VendasProvider({ children }: { children: ReactNode }) {
  // Memoiza o client do Supabase para ele não ser recriado a cada render
  const supabase = useMemo(() => createClient(), []);
  
  const [salesData, setSalesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastDaysLoaded, setLastDaysLoaded] = useState<number | null>(null);
  
  // REFS: Mantêm os valores atualizados sem forçar a recriação das funções
  const daysRef = useRef<number | null>(null);
  const lastDaysLoadedRef = useRef<number | null>(null);
  const hasDataRef = useRef<boolean>(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Função ESTÁVEL (Não possui dependências mutáveis como arrays ou states)
  const fetchSales = useCallback(async (days: number | null, isSilent = false) => {
    
    if (!isSilent) {
      const needsFetch = lastDaysLoadedRef.current === null || days === null || (days > lastDaysLoadedRef.current);
      if (!needsFetch && hasDataRef.current) return; // Usa a Ref ao invés do salesData.length
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      let query = supabase.from("view_vendas_detalhadas").select("*");

      if (days !== null) {
        const dateLimit = format(subDays(new Date(), days), "yyyy-MM-dd");
        query = query.gte("data_venda", dateLimit);
      }

      const { data, error } = await query.order("data_venda", { ascending: false });

      if (error) throw error;
      
      setSalesData(data || []);
      hasDataRef.current = (data && data.length > 0) as boolean;
      
      setLastDaysLoaded(days);
      lastDaysLoadedRef.current = days; 
      daysRef.current = days; 
    } catch (err) {
      console.error("Erro ao carregar vendas:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase]); // <- Segredo aqui: Vazia de states, nunca é recriada.

  // REALTIME ATIVADO: Agora ele conecta UMA única vez e fica ouvindo silenciosamente
  useEffect(() => {
    const channel = supabase.channel('vendas-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_venda' }, handleDatabaseChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nfe_saida' }, handleDatabaseChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devolucoes' }, handleDatabaseChange)
      .subscribe();

    function handleDatabaseChange() {
      // Proteção contra múltiplas atualizações simultâneas do BD
      if (debounceRef.current) clearTimeout(debounceRef.current);
      
      debounceRef.current = setTimeout(() => {
        console.log("🔄 Alteração de faturamento detectada. Atualizando vendas em background...");
        fetchSales(daysRef.current, true); 
      }, 3000);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchSales, supabase]); // fetchSales agora é seguro e não derruba o canal

  return (
    <VendasContext.Provider value={{ salesData, loading, isRefreshing, fetchSales, lastDaysLoaded }}>
      {children}
    </VendasContext.Provider>
  );
}

export const useVendas = () => useContext(VendasContext);