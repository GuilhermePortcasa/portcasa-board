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
  
  // KPIs de Venda atualizados com as faixas de 30, 60 e 90 dias
  kpisVendas: { 
    faturamento30: number, vendasCount30: number, faturamentoLoja30: number, faturamentoSite30: number, vendasLoja30: number, vendasSite30: number,
    faturamento60: number, faturamentoLoja60: number, faturamentoSite60: number,
    faturamento90: number, faturamentoLoja90: number, faturamentoSite90: number,
    pf30: number, cm30: number, full30: number,
    pf60: number, cm60: number, full60: number,
    pf90: number, cm90: number, full90: number
  };
}

const DashboardContext = createContext<DashboardContextType>({} as DashboardContextType);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  
  const [rawData, setRawData] = useState<any[]>([]);
  const [vendas90Dias, setVendas90Dias] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [canal, setCanal] = useState<"geral" | "loja" | "site">("geral");
  const [search, setSearch] = useState("");
  const [filterForn, setFilterForn] = useState("all");
  const [filterCat, setFilterCat] = useState("all");

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef(true);

  const fetchAll = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true); 
    else setIsRefreshing(true);
    
    try {
      console.time("Tempo de Carga da View");
      
      // 1. Busca Estoque e Custos (Apenas MVIEW)
      const { data: dataEstoque, error: errorEstoque } = await supabase
        .from("mview_dashboard_completa")
        .select("*")
        .not("sku", "is", null);
        
      if (errorEstoque) throw errorEstoque;

      const normalizedData = (dataEstoque || []).map(item => {
        let fornLimpo = item.fornecedor;
        if (fornLimpo) {
          fornLimpo = String(fornLimpo).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, ' ').trim();
        }
        return { ...item, fornecedor: fornLimpo };
      });

      setRawData(normalizedData);
      
      // 2. Busca Vendas Brutas dos Últimos 90 Dias
      const getDateStr = (daysAgo: number) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
      };

      const dateFrom90 = getDateStr(90);
      const dateTo = getDateStr(0);

      const { data: dataVendas, error: errorVendas } = await supabase
        .from("view_vendas_detalhadas")
        .select("id_venda, data_venda, receita, canal_macro, fornecedor, categoria, canal_detalhado")
        .gte("data_venda", dateFrom90)
        .lte("data_venda", `${dateTo}T23:59:59.999Z`)
        .limit(150000); // 150 mil linhas para garantir que caiba 90 dias com folga
        
      if (errorVendas) throw errorVendas;
      
      setVendas90Dias(dataVendas || []);
      
      console.timeEnd("Tempo de Carga da View");
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase]);

  const refreshDatabase = useCallback(async () => {
    await fetchAll(true);
  }, [fetchAll]);

  useEffect(() => {
    if (isFirstLoadRef.current) {
        fetchAll(false);
        isFirstLoadRef.current = false;
    }

    const channel = supabase.channel('global-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            fetchAll(true);
          }, 3000);
      })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchAll, supabase]);

  const isProductInCanal = useCallback((p: any, c: string) => {
    if (c === "loja") return p.est_loja !== 0 || p.qtd_andamento_loja > 0 || p.rec_90d_loja > 0;
    if (c === "site") return (p.est_site + p.est_full) !== 0 || p.qtd_andamento_site > 0 || p.rec_90d_site > 0;
    return p.est_total !== 0 || p.qtd_andamento > 0 || p.rec_90d_loja > 0 || p.rec_90d_site > 0;
  }, []);

  const suppliers = useMemo(() => {
    let list = rawData.filter(p => isProductInCanal(p, canal));
    if (filterCat !== "all") list = list.filter(p => p.categoria === filterCat);
    return Array.from(new Set(list.map((p: any) => p.fornecedor).filter(Boolean))).sort();
  }, [rawData, canal, filterCat, isProductInCanal]);

  const categories = useMemo(() => {
    let list = rawData.filter(p => isProductInCanal(p, canal));
    if (filterForn !== "all") list = list.filter(p => p.fornecedor === filterForn);
    return Array.from(new Set(list.map((p: any) => p.categoria).filter(Boolean))).sort();
  }, [rawData, canal, filterForn, isProductInCanal]);

  // --- O NOVO MOTOR DE VENDAS (100% Sincronizado e Dividido em 30/60/90) ---
  const kpisVendas = useMemo(() => {
    let list = vendas90Dias;
    
    if (filterForn !== "all") list = list.filter(v => {
        const fornLimpo = v.fornecedor ? String(v.fornecedor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, ' ').trim() : "";
        return fornLimpo === filterForn;
    });
    if (filterCat !== "all") list = list.filter(v => v.categoria === filterCat);
    
    if (canal === "loja") list = list.filter(v => v.canal_macro === "LOJA");
    else if (canal === "site") list = list.filter(v => v.canal_macro === "SITE");

    const getDateStr = (daysAgo: number) => {
        const d = new Date(); d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
    };
    
    const limit30 = getDateStr(30);
    const limit60 = getDateStr(60);

    let faturamento30 = 0, faturamentoLoja30 = 0, faturamentoSite30 = 0;
    let faturamento60 = 0, faturamentoLoja60 = 0, faturamentoSite60 = 0;
    let faturamento90 = 0, faturamentoLoja90 = 0, faturamentoSite90 = 0;
    
    let pf30 = 0, cm30 = 0, full30 = 0;
    let pf60 = 0, cm60 = 0, full60 = 0;
    let pf90 = 0, cm90 = 0, full90 = 0;

    const idsTotal30 = new Set(), idsLoja30 = new Set(), idsSite30 = new Set();

    list.forEach(v => {
        const rec = Number(v.receita) || 0;
        const is30 = v.data_venda >= limit30;
        const is60 = v.data_venda >= limit60;

        // BUCKET 90 DIAS (Todos da lista)
        faturamento90 += rec;
        if (v.canal_macro === "LOJA") faturamentoLoja90 += rec;
        else faturamentoSite90 += rec;

        if (v.canal_detalhado === "SITE_PADRAO" || v.canal_detalhado === "PORTFIO") pf90 += rec;
        if (v.canal_detalhado === "CASA_MODELO") cm90 += rec;
        if (v.canal_detalhado === "FULL") full90 += rec;

        // BUCKET 60 DIAS
        if (is60) {
            faturamento60 += rec;
            if (v.canal_macro === "LOJA") faturamentoLoja60 += rec;
            else faturamentoSite60 += rec;

            if (v.canal_detalhado === "SITE_PADRAO" || v.canal_detalhado === "PORTFIO") pf60 += rec;
            if (v.canal_detalhado === "CASA_MODELO") cm60 += rec;
            if (v.canal_detalhado === "FULL") full60 += rec;
        }

        // BUCKET 30 DIAS
        if (is30) {
            faturamento30 += rec;
            idsTotal30.add(v.id_venda);
            if (v.canal_macro === "LOJA") {
                faturamentoLoja30 += rec;
                idsLoja30.add(v.id_venda);
            } else {
                faturamentoSite30 += rec;
                idsSite30.add(v.id_venda);
            }

            if (v.canal_detalhado === "SITE_PADRAO" || v.canal_detalhado === "PORTFIO") pf30 += rec;
            if (v.canal_detalhado === "CASA_MODELO") cm30 += rec;
            if (v.canal_detalhado === "FULL") full30 += rec;
        }
    });

    return {
        faturamento30, vendasCount30: idsTotal30.size, faturamentoLoja30, faturamentoSite30, vendasLoja30: idsLoja30.size, vendasSite30: idsSite30.size,
        faturamento60, faturamentoLoja60, faturamentoSite60,
        faturamento90, faturamentoLoja90, faturamentoSite90,
        pf30, cm30, full30,
        pf60, cm60, full60,
        pf90, cm90, full90
    };
  }, [vendas90Dias, canal, filterForn, filterCat]);

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
      // ESTOQUE (MANTIDO)
      acc.custo += g.inventory_value;
      acc.est_site_total += g.val_est_site;
      acc.est_full_total += g.val_est_full;
      acc.est_loja_total += g.val_est_loja;

      // RECEITAS RETORNADAS AQUI (Para alimentar a Header)
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
      isRefreshing,
      kpisVendas // EXPOSTO PARA A PÁGINA
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);