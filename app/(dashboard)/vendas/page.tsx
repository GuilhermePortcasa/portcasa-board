"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react"; // Adicionado Suspense
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, DollarSign, TrendingUp, SearchX, ShoppingCart, Percent, Store, Globe, PackageOpen, ChevronRight, ChevronDown, Search, ArrowUpDown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Input } from "@/components/ui/input";

import { format, subDays, isWithinInterval, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);
const fPercent = (v: number) => new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 }).format(v || 0);

// Criamos um componente interno para isolar o uso do useSearchParams
function VendasContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const initialSearch = searchParams.get("busca") || "";
  const initialCanal = (searchParams.get("canal") as "geral" | "loja" | "site") || "geral";

  const [canalAtivo, setCanalAtivo] = useState<"geral" | "loja" | "site">(initialCanal);
  const [subCanalSite, setSubCanalSite] = useState<"todos" | "padrao" | "full" | "casamodelo">("todos");
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'lucro', direction: 'desc' });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [activePreset, setActivePreset] = useState<string>(initialSearch ? "tudo" : "30d");
  const [date, setDate] = useState<DateRange | undefined>(
    initialSearch ? undefined : { from: subDays(new Date(), 30), to: new Date() }
  );

  useEffect(() => {
    async function fetchVendas() {
      setLoading(true);
      const { data: res } = await supabase
        .from("view_vendas_detalhadas")
        .select("*")
        .order("data_venda", { ascending: false });
      if (res) setRawData(res);
      setLoading(false);
    }
    fetchVendas();
  }, []);

  const handlePreset = (days: number | null, presetName: string) => {
    setActivePreset(presetName);
    if (days === null) setDate(undefined);
    else setDate({ from: subDays(new Date(), days), to: new Date() });
  };

  const toggleRow = (pai: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(pai)) newSet.delete(pai);
    else newSet.add(pai);
    setExpandedRows(newSet);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => {
    let list = [...rawData];
    if (canalAtivo === "loja") list = list.filter(v => v.canal_macro === "LOJA");
    else if (canalAtivo === "site") {
      list = list.filter(v => v.canal_macro === "SITE");
      if (subCanalSite === "padrao") list = list.filter(v => v.canal_detalhado === "SITE_PADRAO" || v.canal_detalhado === "PORTFIO");
      else if (subCanalSite === "full") list = list.filter(v => v.canal_detalhado === "FULL");
      else if (subCanalSite === "casamodelo") list = list.filter(v => v.canal_detalhado === "CASA_MODELO");
    }

    if (date?.from) {
      list = list.filter(item => {
        const itemDate = new Date(item.data_venda + 'T00:00:00');
        const endDay = date.to ? startOfDay(date.to) : startOfDay(date.from!);
        return isWithinInterval(itemDate, { start: startOfDay(date.from!), end: endDay });
      });
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      list = list.filter(v => 
        (v.nome_pai && v.nome_pai.toLowerCase().includes(lowerSearch)) ||
        (v.nome_produto && v.nome_produto.toLowerCase().includes(lowerSearch)) ||
        (v.sku && v.sku.toLowerCase().includes(lowerSearch))
      );
    }
    return list;
  }, [rawData, date, canalAtivo, subCanalSite, searchTerm]);

  const { kpis, chartData, topProducts, siteBreakdown } = useMemo(() => {
    let receita = 0, cmv = 0, lucro = 0, qtd = 0;
    let recSite = 0, recFull = 0, recCM = 0, recLoja = 0; 
    const dailyMap: Record<string, any> = {};
    const parentMap: Record<string, any> = {};

    filteredData.forEach(v => {
      receita += Number(v.receita);
      cmv += Number(v.cmv);
      lucro += Number(v.lucro);
      qtd += Number(v.qtd_vendida);

      if (v.canal_macro === "SITE") {
        if (v.canal_detalhado === "FULL") recFull += Number(v.receita);
        else if (v.canal_detalhado === "CASA_MODELO") recCM += Number(v.receita);
        else recSite += Number(v.receita); 
      } else recLoja += Number(v.receita);

      const dataStr = v.data_venda;
      if (!dailyMap[dataStr]) dailyMap[dataStr] = { data: dataStr, receita: 0, lucro: 0 };
      dailyMap[dataStr].receita += Number(v.receita);
      dailyMap[dataStr].lucro += Math.max(0, Number(v.lucro));

      const pai = v.nome_pai || v.nome_produto || "Produto Desconhecido";
      if (!parentMap[pai]) {
        parentMap[pai] = { 
          nome_pai: pai, qtd: 0, receita: 0, lucro: 0,
          canais: { LOJA: 0, SITE_PADRAO: 0, FULL: 0, CASA_MODELO: 0, PORTFIO: 0 },
          variacoes: {} 
        };
      }
      parentMap[pai].qtd += Number(v.qtd_vendida);
      parentMap[pai].receita += Number(v.receita);
      parentMap[pai].lucro += Number(v.lucro);
      if (v.canal_detalhado) parentMap[pai].canais[v.canal_detalhado] = (parentMap[pai].canais[v.canal_detalhado] || 0) + Number(v.receita);

      if (!parentMap[pai].variacoes[v.sku]) parentMap[pai].variacoes[v.sku] = { sku: v.sku, nome: v.nome_produto, qtd: 0, receita: 0, lucro: 0 };
      parentMap[pai].variacoes[v.sku].qtd += Number(v.qtd_vendida);
      parentMap[pai].variacoes[v.sku].receita += Number(v.receita);
      parentMap[pai].variacoes[v.sku].lucro += Number(v.lucro);
    });

    const chart = Object.values(dailyMap)
      .sort((a: any, b: any) => a.data.localeCompare(b.data))
      .map((d: any) => ({ ...d, data_fmt: format(new Date(d.data + 'T00:00:00'), "dd/MM") }));

    let top = Object.values(parentMap);
    top.sort((a: any, b: any) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      if (sortConfig.key === 'margem') {
        valA = a.receita > 0 ? a.lucro / a.receita : 0;
        valB = b.receita > 0 ? b.lucro / b.receita : 0;
      }
      if (sortConfig.key === 'preco_medio') {
        valA = a.qtd > 0 ? a.receita / a.qtd : 0;
        valB = b.qtd > 0 ? b.receita / b.qtd : 0;
      }
      if (sortConfig.key === 'nome_pai') return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    top = top.map((p: any) => ({
      ...p,
      variacoes: Object.values(p.variacoes).sort((a: any, b: any) => b.lucro - a.lucro)
    }));

    return {
      kpis: { receita, cmv, lucro, qtd, margem: receita > 0 ? lucro / receita : 0, markup: cmv > 0 ? lucro / cmv : 0 },
      siteBreakdown: { site: recSite, full: recFull, cm: recCM, loja: recLoja },
      chartData: chart,
      topProducts: top
    };
  }, [filteredData, sortConfig]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => { setCurrentPage(1); }, [canalAtivo, subCanalSite, date, searchTerm, sortConfig]);

  const totalPages = Math.ceil(topProducts.length / itemsPerPage);
  const paginatedProducts = topProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="p-10 text-center text-slate-500 italic animate-pulse">Consolidando devoluções e calculando CMV...</div>;

  return (
    <div className="space-y-3 pb-10">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-white p-3 rounded-xl border shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="text-blue-600" size={20} /> Análise de Vendas
          </h2>
        </div>
        <div className="flex flex-col w-full xl:w-auto gap-2">
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full justify-end">
            <div className="relative w-full sm:w-[250px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
              <Input placeholder="Buscar produto..." className="pl-9 h-8 text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <Tabs value={canalAtivo} onValueChange={(v: any) => { setCanalAtivo(v); setSubCanalSite("todos"); }} className="w-full sm:w-auto">
              <TabsList className="grid grid-cols-3 h-8">
                <TabsTrigger value="geral" className="text-[11px]">Geral</TabsTrigger>
                <TabsTrigger value="loja" className="text-[11px] flex gap-1"><Store size={12}/> Loja</TabsTrigger>
                <TabsTrigger value="site" className="text-[11px] flex gap-1"><Globe size={12}/> Site</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full justify-end">
            {canalAtivo === "site" && (
              <div className="flex items-center gap-1 justify-center bg-slate-50 p-1 rounded-md border">
                <Button variant={subCanalSite === "todos" ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setSubCanalSite("todos")}>Todos</Button>
                <Button variant={subCanalSite === "padrao" ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px] px-2 text-blue-600" onClick={() => setSubCanalSite("padrao")}>Portfio</Button>
                <Button variant={subCanalSite === "full" ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px] px-2 text-yellow-600" onClick={() => setSubCanalSite("full")}>Full</Button>
                <Button variant={subCanalSite === "casamodelo" ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px] px-2 text-green-600" onClick={() => setSubCanalSite("casamodelo")}>Casa Modelo</Button>
              </div>
            )}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg w-full sm:w-auto justify-between h-8">
              <Button variant={activePreset === "7d" ? "default" : "ghost"} size="sm" className="text-[10px] h-6 px-2" onClick={() => handlePreset(7, "7d")}>7D</Button>
              <Button variant={activePreset === "30d" ? "default" : "ghost"} size="sm" className="text-[10px] h-6 px-2" onClick={() => handlePreset(30, "30d")}>30D</Button>
              <Button variant={activePreset === "90d" ? "default" : "ghost"} size="sm" className="text-[10px] h-6 px-2" onClick={() => handlePreset(90, "90d")}>90D</Button>
              <Button variant={activePreset === "tudo" ? "default" : "ghost"} size="sm" className="text-[10px] h-6 px-2" onClick={() => handlePreset(null, "tudo")}>Tudo</Button>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full sm:w-[200px] justify-start text-left font-normal border-slate-200 shadow-sm h-8 text-xs", activePreset === "custom" && "border-blue-500 ring-1 ring-blue-500")}>
                  <CalendarIcon className="mr-2 h-3 w-3 text-blue-600" />
                  {date?.from ? (date.to ? `${format(date.from, "dd/MM/yy")} a ${format(date.to, "dd/MM/yy")}` : format(date.from, "dd/MM/yy")) : "Personalizado"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={(d) => { setDate(d); setActivePreset("custom"); }} numberOfMonths={2} locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <Card className="p-10 flex flex-col items-center justify-center text-slate-400">
          <SearchX size={32} className="mb-2 opacity-20" />
          <p className="font-medium text-sm">Nenhuma movimentação encontrada.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Card className={cn("border-t-4 border-blue-500 shadow-sm transition-all", (canalAtivo === "site" || canalAtivo === "geral") ? "hover:shadow-md hover:bg-slate-50 cursor-pointer" : "")}>
                  <CardHeader className="pb-1 pt-3 text-[10px] font-bold text-slate-500 uppercase flex flex-row items-center justify-between">
                    <span>Receita Líq. {(canalAtivo === "site" || canalAtivo === "geral") && <span className="text-blue-500 lowercase">(ver)</span>}</span>
                  </CardHeader>
                  <CardContent className="text-xl font-black text-slate-800 flex items-center justify-between pb-3">
                    {fCurrency(kpis.receita)} <DollarSign className="text-blue-100" size={20} />
                  </CardContent>
                </Card>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Detalhamento de Receita Líquida</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4 text-sm">
                  {canalAtivo === "geral" && <div className="flex justify-between border-b pb-2"><span className="font-medium text-orange-600">Loja Física:</span> <span className="text-orange-600 font-bold">{fCurrency(siteBreakdown.loja)}</span></div>}
                  <div className="flex justify-between border-b pb-2 text-slate-600"><span className="font-medium">Site Portfio (Padrão):</span> <span>{fCurrency(siteBreakdown.site)}</span></div>
                  <div className="flex justify-between border-b pb-2 text-slate-600"><span className="font-medium">Mercado Livre FULL:</span> <span>{fCurrency(siteBreakdown.full)}</span></div>
                  <div className="flex justify-between border-b pb-2 text-slate-600"><span className="font-medium">Casa Modelo:</span> <span>{fCurrency(siteBreakdown.cm)}</span></div>
                  <div className="flex justify-between pt-2 text-lg font-black text-slate-800 border-t-2 border-slate-900 mt-2"><span>TOTAL:</span> <span>{fCurrency(kpis.receita)}</span></div>
                </div>
              </DialogContent>
            </Dialog>

            <Card className="border-t-4 border-orange-400 shadow-sm">
              <CardHeader className="pb-1 pt-3 text-[10px] font-bold text-slate-500 uppercase">CMV Reposição</CardHeader>
              <CardContent className="text-xl font-black text-slate-800 flex items-center justify-between pb-3">{fCurrency(kpis.cmv)} <ShoppingCart className="text-orange-100" size={20} /></CardContent>
            </Card>
            <Card className="border-t-4 border-green-500 shadow-sm">
              <CardHeader className="pb-1 pt-3 text-[10px] font-bold text-slate-500 uppercase">Lucro Bruto</CardHeader>
              <CardContent className="text-xl font-black text-green-600 flex items-center justify-between pb-3">{fCurrency(kpis.lucro)} <TrendingUp className="text-green-100" size={20} /></CardContent>
            </Card>
            <Card className="border-t-4 border-purple-500 shadow-sm">
              <CardHeader className="pb-0 pt-3 text-[10px] font-bold text-slate-500 uppercase">Rentabilidade</CardHeader>
              <CardContent className="text-xl font-black text-purple-600 flex items-center justify-between pb-2">
                <div>
                  {fPercent(kpis.margem)} <span className="text-[9px] text-slate-400 font-normal uppercase ml-0.5">Margem</span>
                  <div className="text-[11px] text-slate-500 font-bold leading-tight">{fPercent(kpis.markup)} <span className="font-normal uppercase text-[8px]">Markup</span></div>
                </div>
                <Percent className="text-purple-100" size={20} />
              </CardContent>
            </Card>
          </div>

          {!searchTerm && (
            <Card className="p-3 border-none shadow-xl bg-white">
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                      <linearGradient id="colorLucro" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="data_fmt" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#94a3b8'}} minTickGap={20} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }} formatter={(value: any) => [fCurrency(value), ""]} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold', paddingBottom: '10px' }} />
                    <Area type="monotone" name="Receita" dataKey="receita" stroke="#3b82f6" strokeWidth={2} fill="url(#colorRec)" />
                    <Area type="monotone" name="Lucro" dataKey="lucro" stroke="#22c55e" strokeWidth={2} fill="url(#colorLucro)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden border-none shadow-xl">
            <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-2 font-bold"><PackageOpen size={18} /> Performance de Famílias</div>
              <div className="relative w-full sm:w-[300px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/>
                <Input placeholder="Buscar produto ou SKU..." className="pl-9 h-9 bg-slate-800 border-slate-700 text-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="w-[35%]"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => handleSort('nome_pai')}>PRODUTO {sortConfig.key === 'nome_pai' && <ArrowUpDown className="ml-1 h-3 w-3" />}</Button></TableHead>
                  <TableHead className="text-center font-bold text-[10px] uppercase text-slate-500">CANAIS</TableHead>
                  <TableHead className="text-center w-[10%]"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => handleSort('qtd')}>QTD</Button></TableHead>
                  <TableHead className="text-right w-[10%]"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => handleSort('preco_medio')}>TICKET</Button></TableHead>
                  <TableHead className="text-right w-[15%]"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => handleSort('receita')}>RECEITA</Button></TableHead>
                  <TableHead className="text-right w-[15%]"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => handleSort('lucro')}>LUCRO</Button></TableHead>
                  <TableHead className="text-right w-[10%]"><Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => handleSort('margem')}>MARGEM</Button></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((p: any) => {
                  const margem = p.receita > 0 ? p.lucro / p.receita : 0;
                  const isExpanded = expandedRows.has(p.nome_pai);
                  let labelsContent = null;
                  let barContent = null;
                  if (canalAtivo === "geral") {
                    const recSite = p.canais.SITE_PADRAO + p.canais.FULL + p.canais.CASA_MODELO + p.canais.PORTFIO;
                    const pctLoja = p.receita > 0 ? (p.canais.LOJA / p.receita) * 100 : 0;
                    const pctSite = p.receita > 0 ? (recSite / p.receita) * 100 : 0;
                    labelsContent = <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1 px-1"><span>Loja {pctLoja.toFixed(0)}%</span><span>Site {pctSite.toFixed(0)}%</span></div>;
                    barContent = <><div style={{ width: `${pctLoja}%` }} className="bg-orange-400"></div><div style={{ width: `${pctSite}%` }} className="bg-blue-500"></div></>;
                  } else if (canalAtivo === "site") {
                    const totalSite = p.canais.SITE_PADRAO + p.canais.FULL + p.canais.CASA_MODELO + p.canais.PORTFIO;
                    const pctSitePadrao = totalSite > 0 ? ((p.canais.SITE_PADRAO + p.canais.PORTFIO) / totalSite) * 100 : 0;
                    const pctFull = totalSite > 0 ? (p.canais.FULL / totalSite) * 100 : 0;
                    const pctCasaModelo = totalSite > 0 ? (p.canais.CASA_MODELO / totalSite) * 100 : 0;
                    labelsContent = <div className="flex justify-center gap-2 text-[8px] font-bold text-slate-500 mb-1 px-1">{pctSitePadrao > 0 && <span className="text-blue-500">Prtf {pctSitePadrao.toFixed(0)}%</span>}{pctFull > 0 && <span className="text-yellow-500">Full {pctFull.toFixed(0)}%</span>}{pctCasaModelo > 0 && <span className="text-green-500">CM {pctCasaModelo.toFixed(0)}%</span>}</div>;
                    barContent = <><div style={{ width: `${pctSitePadrao}%` }} className="bg-blue-500"></div><div style={{ width: `${pctFull}%` }} className="bg-yellow-400"></div><div style={{ width: `${pctCasaModelo}%` }} className="bg-green-500"></div></>;
                  }
                  return (
                    <React.Fragment key={p.nome_pai}>
                      <TableRow className="hover:bg-slate-50 cursor-pointer text-xs" onClick={() => toggleRow(p.nome_pai)}>
                        <TableCell><div className="flex items-center gap-2"> {isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>} <div className="font-bold text-slate-700 truncate max-w-[200px]">{p.nome_pai}</div> </div></TableCell>
                        <TableCell>{canalAtivo !== "loja" && !["padrao", "full", "casamodelo"].includes(subCanalSite) ? <div className="w-full max-w-[150px] mx-auto">{labelsContent}<div className="h-1.5 w-full bg-slate-100 rounded-full flex overflow-hidden">{barContent}</div></div> : <div className="text-center text-[10px] text-slate-400">-</div>}</TableCell>
                        <TableCell className="text-center font-bold">{fNum(p.qtd)}</TableCell>
                        <TableCell className="text-right text-slate-500">{fCurrency(p.qtd > 0 ? p.receita / p.qtd : 0)}</TableCell>
                        <TableCell className="text-right font-medium text-slate-600">{fCurrency(p.receita)}</TableCell>
                        <TableCell className="text-right font-black text-green-600">{fCurrency(p.lucro)}</TableCell>
                        <TableCell className="text-right font-bold text-purple-600">{fPercent(margem)}</TableCell>
                      </TableRow>
                      {isExpanded && p.variacoes.map((vr: any) => (
                        <TableRow key={vr.sku} className="bg-slate-50/70 border-b border-slate-100 text-[11px]">
                          <TableCell className="pl-10 py-1" colSpan={2}><div className="flex items-center gap-2"><span className="text-[9px] font-bold text-slate-400 border px-1 rounded bg-white">{vr.sku}</span><span className="text-slate-600">{vr.nome}</span></div></TableCell>
                          <TableCell className="text-center py-1 text-slate-500">{fNum(vr.qtd)}</TableCell>
                          <TableCell className="text-right py-1 text-slate-500">{fCurrency(vr.qtd > 0 ? vr.receita / vr.qtd : 0)}</TableCell>
                          <TableCell className="text-right py-1 text-slate-500">{fCurrency(vr.receita)}</TableCell>
                          <TableCell className="text-right py-1 text-slate-600 font-medium">{fCurrency(vr.lucro)}</TableCell>
                          <TableCell className="text-right py-1 text-slate-400">{fPercent(vr.receita > 0 ? vr.lucro / vr.receita : 0)}</TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="p-2 flex items-center justify-between bg-slate-50 border-t shrink-0">
                <div className="text-[10px] text-muted-foreground font-bold">Pág {currentPage} de {totalPages}</div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>ANT</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>PRÓX</Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// O export default final agora envolve o conteúdo em Suspense
export default function VendasPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500 animate-pulse italic">Carregando análise de vendas...</div>}>
      <VendasContent />
    </Suspense>
  );
}