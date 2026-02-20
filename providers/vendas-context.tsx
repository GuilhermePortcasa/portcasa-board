"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { subDays, startOfDay, format } from "date-fns";

interface VendasContextType {
  salesData: any[];
  loading: boolean;
  fetchSales: (days: number | null) => Promise<void>;
  lastDaysLoaded: number | null;
}

const VendasContext = createContext<VendasContextType>({} as VendasContextType);

export function VendasProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [salesData, setSalesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastDaysLoaded, setLastDaysLoaded] = useState<number | null>(null);

  const fetchSales = useCallback(async (days: number | null) => {
    // Se o usuário pedir "Tudo" (null) ou um período maior do que o que já temos em cache
    // Ou se não tivermos nada carregado ainda, buscamos no banco.
    const needsFetch = lastDaysLoaded === null || days === null || (days > lastDaysLoaded);

    if (!needsFetch && salesData.length > 0) return;

    setLoading(true);
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
    } catch (err) {
      console.error("Erro ao carregar vendas:", err);
    } finally {
      setLoading(false);
    }
  }, [lastDaysLoaded, salesData.length, supabase]);

  return (
    <VendasContext.Provider value={{ salesData, loading, fetchSales, lastDaysLoaded }}>
      {children}
    </VendasContext.Provider>
  );
}

export const useVendas = () => useContext(VendasContext);