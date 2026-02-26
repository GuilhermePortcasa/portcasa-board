"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";

interface VendasContextType {
  salesData: any[];
  loading: boolean;
  isRefreshing: boolean; 
  fetchSales: (dateFrom: string | null, dateTo: string | null, isSilent?: boolean) => Promise<void>;
}

const VendasContext = createContext<VendasContextType>({} as VendasContextType);

export function VendasProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  
  const [salesData, setSalesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Guardamos o filtro atual para o Realtime poder recarregar a mesma janela de tempo
  const currentFilterRef = useRef<{ from: string | null, to: string | null }>({ from: null, to: null });
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSales = useCallback(async (dateFrom: string | null, dateTo: string | null, isSilent = false) => {
    // Evita recarregar se os filtros forem idênticos e não for silencioso
    if (!isSilent) {
        setLoading(true);
    } else {
        setIsRefreshing(true);
    }

    try {
      let query = supabase.from("view_vendas_detalhadas").select("*");

      // Aplica o filtro de Data no Supabase
      if (dateFrom) query = query.gte("data_venda", dateFrom);
      if (dateTo) query = query.lte("data_venda", dateTo);

      // Proteção contra timeout no banco (Se pedir "Tudo", limitamos a 50 mil linhas)
      if (!dateFrom && !dateTo) {
          query = query.limit(50000);
      }

      const { data, error } = await query.order("data_venda", { ascending: false });

      if (error) throw error;
      
      setSalesData(data || []);
      currentFilterRef.current = { from: dateFrom, to: dateTo };
      
    } catch (err) {
      console.error("Erro ao carregar vendas:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase]);

  // REALTIME ATIVADO
  useEffect(() => {
    const channel = supabase.channel('vendas-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_venda' }, handleDatabaseChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nfe_saida' }, handleDatabaseChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devolucoes' }, handleDatabaseChange)
      .subscribe();

    function handleDatabaseChange() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        console.log("🔄 Alteração de faturamento detectada. Atualizando...");
        fetchSales(currentFilterRef.current.from, currentFilterRef.current.to, true); 
      }, 3000);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchSales, supabase]);

  return (
    <VendasContext.Provider value={{ salesData, loading, isRefreshing, fetchSales }}>
      {children}
    </VendasContext.Provider>
  );
}

export const useVendas = () => useContext(VendasContext);