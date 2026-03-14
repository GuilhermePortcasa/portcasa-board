"use client";

import { createContext, useCallback, useContext, useEffect, useState, useMemo, useRef, ReactNode } from "react";
import { createClient } from "@/utils/supabase/client";

interface DashboardContextType {
  rawData: any[];
  loading: boolean;
  isRefreshing: boolean;
  canal: "geral" | "loja" | "site";
  setCanal: (v: "geral" | "loja" | "site") => void;
  search: string;
  setSearch: (v: string) => void;
  filterForn: string;
  setFilterForn: (v: string) => void;
  filterCat: string;
  setFilterCat: (v: string) => void;
  processedData: any[];
  totalStats: any;
  suppliers: string[];
  categories: string[];
  refreshData: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType>({} as DashboardContextType);

export function DashboardProvider({ children }: { children: ReactNode }) {
  // Memoiza o client do Supabase para ele não ser recriado
  const supabase = useMemo(() => createClient(), []);
  
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filtros Globais
  const [canal, setCanal] = useState<"geral" | "loja" | "site">("geral");
  const [search, setSearch] = useState("");
  const [filterForn, setFilterForn] = useState("all");
  const [filterCat, setFilterCat] = useState("all");

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef(true);

  // 1. FETCH OTIMIZADO PARA MATERIALIZED VIEW
  const fetchAll = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true); 
    else setIsRefreshing(true);
    
    try {
      console.time("Tempo de Carga da View");
      
      const { data, error } = await supabase
        .from("mview_dashboard_completa") // <-- NOVO NOME AQUI
        .select("*")
        .not("sku", "is", null)          
      if (error) throw error;

      // Normalização dos dados
      const normalizedData = (data || []).map(item => {
        let fornLimpo = item.fornecedor;
        if (fornLimpo) {
          fornLimpo = String(fornLimpo)
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .toUpperCase() 
            .replace(/\s+/g, ' ') 
            .trim();
        }
        return { ...item, fornecedor: fornLimpo };
      });

      setRawData(normalizedData);
      console.timeEnd("Tempo de Carga da View");
    } catch (err) {
      console.error("Erro ao buscar dados da View:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase]);

  // 2. REFRESH EXPOSTO AO CONTEXTO
  const refreshDatabase = useCallback(async () => {
    await fetchAll(true);
  }, [fetchAll]);

  // 3. REALTIME BLINDADO (Conecta uma vez e atualiza no background)
  useEffect(() => {
    // Carrega a primeira vez se for o load inicial
    if (isFirstLoadRef.current) {
        fetchAll(false);
        isFirstLoadRef.current = false;
    }

    // Canal global ouve mudanças genéricas
    const channel = supabase.channel('global-db-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public' }, 
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            console.log("🔄 Alteração detectada no banco. Atualizando a View global em background...");
            fetchAll(true); // Sempre silencioso no realtime
          }, 3000);
      })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchAll, supabase]); // O lint fica feliz e a conexão fica estável

  // --- FUNÇÃO AUXILIAR: Verifica se o produto pertence ao canal ativo ---
  const isProductInCanal = useCallback((p: any, c: string) => {
    if (c === "loja") {
        return p.est_loja !== 0 || (p.v_qtd_120d_geral > 0 && p.v_qtd_90d_loja > 0) || p.qtd_andamento_loja > 0;
    }
    if (c === "site") {
        return (p.est_site + p.est_full) !== 0 || (p.v_qtd_120d_geral > 0 && p.v_qtd_90d_site > 0) || p.qtd_andamento_site > 0;
    }
    return p.est_total !== 0 || p.v_qtd_120d_geral > 0 || p.qtd_andamento > 0;
  }, []);

  // 1. FORNECEDORES DINÂMICOS (Filtra por Canal e Categoria)
  const suppliers = useMemo(() => {
    let list = rawData.filter(p => isProductInCanal(p, canal));
    if (filterCat !== "all") list = list.filter(p => p.categoria === filterCat);
    return Array.from(new Set(list.map((p: any) => p.fornecedor).filter(Boolean))).sort();
  }, [rawData, canal, filterCat, isProductInCanal]);

  // 2. CATEGORIAS DINÂMICAS (Filtra por Canal e Fornecedor)
  const categories = useMemo(() => {
    let list = rawData.filter(p => isProductInCanal(p, canal));
    if (filterForn !== "all") list = list.filter(p => p.fornecedor === filterForn);
    return Array.from(new Set(list.map((p: any) => p.categoria).filter(Boolean))).sort();
  }, [rawData, canal, filterForn, isProductInCanal]);

  // 3. LÓGICA DA TABELA E GRÁFICOS
  const processedData = useMemo(() => {
    const parentSkuMap: Record<string, string> = {};
    rawData.forEach(p => {
        const nomeLimpo = p.nome.trim();
        const paiLimpo = (p.nome_pai || "").trim();
        if (paiLimpo && nomeLimpo === paiLimpo) {
            parentSkuMap[paiLimpo] = p.sku;
        }
    });

    let filtered = rawData.filter(p => isProductInCanal(p, canal));

    if (filterForn !== "all") filtered = filtered.filter(p => p.fornecedor === filterForn);
    if (filterCat !== "all") filtered = filtered.filter(p => p.categoria === filterCat);

    const safeNum = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };

    const tempGroups: Record<string, any[]> = {};
    filtered.forEach(p => {
        const key = p.nome_pai || p.nome;
        if (!tempGroups[key]) tempGroups[key] = [];
        tempGroups[key].push(p);
    });

    const s = search.toLowerCase().trim();

    const result = Object.entries(tempGroups).reduce((acc: any[], [key, items]) => {
        const mainSku = parentSkuMap[key.trim()] || items[0].sku;
        
        const matchesSearch = !s || 
            key.toLowerCase().includes(s) || 
            mainSku.toLowerCase().includes(s) ||
            items.some(i => i.sku.toLowerCase().includes(s) || i.nome.toLowerCase().includes(s));

        if (matchesSearch) {
            const group = {
                ...items[0],
                sku: mainSku,
                nome: key,
                isParent: true,
                hasVariations: items.length > 1 || items.some(i => i.nome.trim() !== (i.nome_pai || "").trim()),
                children: [],
                est_total: 0, est_loja: 0, est_site: 0, est_full: 0,
                val_est_site: 0, val_est_full: 0, val_est_loja: 0,
                v_30: 0, v_60: 0, v_90: 0, 
                r_30: 0, r_60: 0, r_90: 0,
                r_30_pf: 0, r_60_pf: 0, r_90_pf: 0,
                r_30_cm: 0, r_60_cm: 0, r_90_cm: 0,
                r_30_full: 0, r_60_full: 0, r_90_full: 0,
                r_30_loja: 0, r_60_loja: 0, r_90_loja: 0,
                qtd_ped: 0, sum_preco: 0, sum_unit_cost: 0, inventory_value: 0, count: 0
            };

            items.forEach(p => {
                // CUSTOS INTELIGENTES POR CANAL
                const custo_loja = safeNum(p.custo_final_loja || p.custo_final);
                const custo_site = safeNum(p.custo_final_site || p.custo_final);
                const custo_geral = safeNum(p.custo_final);

                const pedItem = safeNum(canal === 'loja' ? p.qtd_andamento_loja : canal === 'site' ? p.qtd_andamento_site : p.qtd_andamento);

                const estSite = safeNum(p.est_site);
                const estFull = safeNum(p.est_full);
                const estLoja = safeNum(p.est_loja);
                const estTotal = safeNum(p.est_total);

                // Multiplica o estoque daquele local pelo custo daquele local
                const valSite = estSite * custo_site;
                const valFull = estFull * custo_site;
                const valLoja = estLoja * custo_loja;

                group.children.push({ ...p, isParent: false, qtd_ped_atual: pedItem });

                if (p.tipo !== 'E') {
                    group.est_total += estTotal; group.est_loja += estLoja;
                    group.est_site += estSite; group.est_full += estFull;
                    
                    group.val_est_site += valSite;
                    group.val_est_full += valFull;
                    group.val_est_loja += valLoja;

                    if (canal === "loja") group.inventory_value += valLoja;
                    else if (canal === "site") group.inventory_value += (valSite + valFull);
                    else group.inventory_value += (valLoja + valSite + valFull);
                }

                group.qtd_ped += pedItem;

                const v30 = safeNum(canal === 'loja' ? p.v_qtd_30d_loja : canal === 'site' ? p.v_qtd_30d_site : (safeNum(p.v_qtd_30d_loja) + safeNum(p.v_qtd_30d_site)));
                const v60 = safeNum(canal === 'loja' ? p.v_qtd_60d_loja : canal === 'site' ? p.v_qtd_60d_site : (safeNum(p.v_qtd_60d_loja) + safeNum(p.v_qtd_60d_site)));
                const v90 = safeNum(canal === 'loja' ? p.v_qtd_90d_loja : canal === 'site' ? p.v_qtd_90d_site : (safeNum(p.v_qtd_90d_loja) + safeNum(p.v_qtd_90d_site)));
                group.v_30 += v30; group.v_60 += v60; group.v_90 += v90;

                const r30 = safeNum(canal === 'loja' ? p.rec_30d_loja : canal === 'site' ? p.rec_30d_site : (safeNum(p.rec_30d_loja) + safeNum(p.rec_30d_site)));
                const r60 = safeNum(canal === 'loja' ? p.rec_60d_loja : canal === 'site' ? p.rec_60d_site : (safeNum(p.rec_60d_loja) + safeNum(p.rec_60d_site)));
                const r90 = safeNum(canal === 'loja' ? p.rec_90d_loja : canal === 'site' ? p.rec_90d_site : (safeNum(p.rec_90d_loja) + safeNum(p.rec_90d_site)));
                group.r_30 += r30; group.r_60 += r60; group.r_90 += r90;

                group.r_30_pf += safeNum(p.rec_30d_portfio); group.r_60_pf += safeNum(p.rec_60d_portfio); group.r_90_pf += safeNum(p.rec_90d_portfio);
                group.r_30_cm += safeNum(p.rec_30d_casamodelo); group.r_60_cm += safeNum(p.rec_60d_casamodelo); group.r_90_cm += safeNum(p.rec_90d_casamodelo);
                group.r_30_full += safeNum(p.rec_30d_full); group.r_60_full += safeNum(p.rec_60d_full); group.r_90_full += safeNum(p.rec_90d_full);
                group.r_30_loja += safeNum(p.rec_30d_loja); group.r_60_loja += safeNum(p.rec_60d_loja); group.r_90_loja += safeNum(p.rec_90d_loja);

                const precoUnit = canal === 'site' ? (safeNum(p.ultimo_preco_site) || safeNum(p.preco_venda_padrao)) : safeNum(p.preco_venda_padrao);
                group.sum_preco += precoUnit;
                
                // Custo unitário dinâmico para produtos sem estoque (fallback do markup)
                group.sum_unit_cost += canal === 'loja' ? custo_loja : canal === 'site' ? custo_site : custo_geral;
                
                group.count++;
            });

            acc.push(group);
        }
        return acc;
    }, []);

    return result.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [rawData, canal, search, filterForn, filterCat, isProductInCanal]);

  const totalStats = useMemo(() => {
    return processedData.reduce((acc, g) => {
      acc.custo += g.inventory_value;
      acc.est_site_total += g.val_est_site;
      acc.est_full_total += g.val_est_full;
      acc.est_loja_total += g.val_est_loja;

      acc.r30 += g.r_30; acc.r60 += g.r_60; acc.r90 += g.r_90;
      acc.bd_pf_30 += g.r_30_pf; acc.bd_pf_60 += g.r_60_pf; acc.bd_pf_90 += g.r_90_pf;
      acc.bd_cm_30 += g.r_30_cm; acc.bd_cm_60 += g.r_60_cm; acc.bd_cm_90 += g.r_90_cm;
      acc.bd_full_30 += g.r_30_full; acc.bd_full_60 += g.r_60_full; acc.bd_full_90 += g.r_90_full;
      acc.bd_loja_30 += g.r_30_loja; acc.bd_loja_60 += g.r_60_loja; acc.bd_loja_90 += g.r_90_loja;
      
      return acc;
    }, { 
      custo: 0, est_site_total: 0, est_full_total: 0, est_loja_total: 0,
      r30: 0, r60: 0, r90: 0, 
      bd_pf_30: 0, bd_pf_60: 0, bd_pf_90: 0, 
      bd_cm_30: 0, bd_cm_60: 0, bd_cm_90: 0,
      bd_full_30: 0, bd_full_60: 0, bd_full_90: 0, 
      bd_loja_30: 0, bd_loja_60: 0, bd_loja_90: 0
    });
  }, [processedData]);

  // --- AUTO-LIMPEZA DE FILTROS ---
  useEffect(() => {
    if (filterForn !== "all" && !suppliers.includes(filterForn)) setFilterForn("all");
  }, [suppliers, filterForn]);

  useEffect(() => {
    if (filterCat !== "all" && !categories.includes(filterCat)) setFilterCat("all");
  }, [categories, filterCat]);

  return (
    <DashboardContext.Provider value={{ 
      rawData, loading, processedData, totalStats, suppliers, categories,
      canal, setCanal, search, setSearch, filterForn, setFilterForn, filterCat, setFilterCat, 
      refreshData: refreshDatabase,
      isRefreshing
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);