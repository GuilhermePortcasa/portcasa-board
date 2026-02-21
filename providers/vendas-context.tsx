"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from "react";
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
  const supabase = createClient();
  const [salesData, setSalesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastDaysLoaded, setLastDaysLoaded] = useState<number | null>(null);
  
  // Usamos uma Ref para guardar o "último filtro" ativo para o Realtime saber o que buscar
  const daysRef = useRef<number | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // A função agora aceita o parâmetro "isSilent" para não mostrar a tela de loading enquanto atualiza
  const fetchSales = useCallback(async (days: number | null, isSilent = false) => {
    
    // Se não for silencioso e já tivermos esse período ou um maior cacheado, não faz nada
    if (!isSilent) {
        const needsFetch = lastDaysLoaded === null || days === null || (days > lastDaysLoaded);
        if (!needsFetch && salesData.length > 0) return;
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
      
      setLastDaysLoaded(days);
      daysRef.current = days; // Atualiza a referência para o realtime
    } catch (err) {
      console.error("Erro ao carregar vendas:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [lastDaysLoaded, salesData.length, supabase]);

  // REALTIME ATIVADO: Ouve as três tabelas que afetam o faturamento
  useEffect(() => {
    const channel = supabase.channel('vendas-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_venda' }, handleDatabaseChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nfe_saida' }, handleDatabaseChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devolucoes' }, handleDatabaseChange)
      .subscribe();

    function handleDatabaseChange() {
      // Se não houver dados carregados, não precisa atualizar nada
      if (daysRef.current === null && salesData.length === 0) return;
      
      // Proteção contra múltiplas atualizações simultâneas
      if (debounceRef.current) clearTimeout(debounceRef.current);
      
      debounceRef.current = setTimeout(() => {
        console.log("🔄 Alteração de faturamento detectada. Atualizando vendas em background...");
        // Passa o filtro atual (daysRef) e o TRUE para ser silencioso (sem travar a tela)
        fetchSales(daysRef.current, true); 
      }, 3000);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchSales, salesData.length]);

  return (
    <VendasContext.Provider value={{ salesData, loading, isRefreshing, fetchSales, lastDaysLoaded }}>
      {children}
    </VendasContext.Provider>
  );
}

export const useVendas = () => useContext(VendasContext);