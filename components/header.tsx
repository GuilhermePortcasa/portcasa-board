"use client";

import { useDashboard } from "@/providers/dashboard-context";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// Formatadores
const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const StockModal = ({ total, site, full, loja, canal }: any) => (
  <Dialog>
    <DialogTrigger asChild>
      <Card className="border-t-4 border-primary shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
        <CardHeader className="pb-1 text-[10px] uppercase font-bold text-muted-foreground">Custo Estoque Filtrado (Ver)</CardHeader>
        <CardContent className="text-xl font-black">{fCurrency(total)}</CardContent>
      </Card>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Distribuição de Valor em Estoque</DialogTitle></DialogHeader>
      <div className="space-y-4 pt-4 text-sm">
        {(canal === 'geral' || canal === 'site') && (
          <>
            <div className="flex justify-between border-b pb-2"><span>Valor em Depósito SITE:</span> <span className="font-bold">{fCurrency(site)}</span></div>
            <div className="flex justify-between border-b pb-2"><span>Valor em Depósito FULL:</span> <span className="font-bold">{fCurrency(full)}</span></div>
          </>
        )}
        {(canal === 'geral' || canal === 'loja') && (
          <div className="flex justify-between border-b pb-2"><span>Valor em Depósito LOJA:</span> <span className="font-bold">{fCurrency(loja)}</span></div>
        )}
        <p className="text-[10px] text-muted-foreground italic">Nota: Os valores representam o (Custo Médio × Estoque Atual) de cada item filtrado.</p>
      </div>
    </DialogContent>
  </Dialog>
);

const RevenueModal = ({ title, total, pf, cm, full, loja, color, border, canal }: any) => (
  <Dialog>
    <DialogTrigger asChild>
      <Card className={`border-t-4 ${border} shadow-sm cursor-pointer hover:bg-slate-50 transition-colors`}>
        <CardHeader className="pb-1 text-[10px] uppercase font-bold text-muted-foreground">{title} (Ver)</CardHeader>
        <CardContent className={`text-xl font-black ${color}`}>{fCurrency(total)}</CardContent>
      </Card>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>{title} - Detalhes</DialogTitle></DialogHeader>
      <div className="space-y-4 pt-4 text-sm">
        {(canal === 'geral' || canal === 'site') && <>
          <div className="flex justify-between border-b pb-2"><span className="font-medium">PortFio:</span> <span>{fCurrency(pf)}</span></div>
          <div className="flex justify-between border-b pb-2"><span className="font-medium">Casa Modelo:</span> <span>{fCurrency(cm)}</span></div>
          <div className="flex justify-between border-b pb-2"><span className="font-medium">Full:</span> <span>{fCurrency(full)}</span></div>
        </>}
        {(canal === 'geral' || canal === 'loja') && <div className="flex justify-between border-b pb-2"><span className="font-medium">Loja:</span> <span>{fCurrency(loja)}</span></div>}
        <div className={`flex justify-between pt-2 text-lg font-bold ${color}`}><span>TOTAL:</span> <span>{fCurrency(total)}</span></div>
      </div>
    </DialogContent>
  </Dialog>
);

export function DashboardHeader() {
  const { 
    totalStats, canal, setCanal, search, setSearch, 
    filterForn, setFilterForn, filterCat, setFilterCat, 
    suppliers, categories 
  } = useDashboard();

  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const handleSearchSubmit = () => {
    setSearch(localSearch);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearchSubmit();
  };

  return (
    <div className="space-y-4"> 
      {/* 1. CARDS DE RESUMO (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StockModal total={totalStats.custo} site={totalStats.est_site_total} full={totalStats.est_full_total} loja={totalStats.est_loja_total} canal={canal} />
        <RevenueModal canal={canal} title="Receita 30d" total={totalStats.r30} pf={totalStats.bd_pf_30} cm={totalStats.bd_cm_30} full={totalStats.bd_full_30} loja={totalStats.bd_loja_30} color="text-green-600" border="border-green-600" />
        <RevenueModal canal={canal} title="Receita 60d" total={totalStats.r60} pf={totalStats.bd_pf_60} cm={totalStats.bd_cm_60} full={totalStats.bd_full_60} loja={totalStats.bd_loja_60} color="text-green-700" border="border-green-700 opacity-90" />
        <RevenueModal canal={canal} title="Receita 90d" total={totalStats.r90} pf={totalStats.bd_pf_90} cm={totalStats.bd_cm_90} full={totalStats.bd_full_90} loja={totalStats.bd_loja_90} color="text-green-800" border="border-green-800 opacity-80" />
      </div>

      {/* 2. BARRA DE AÇÕES */}
      <div className="bg-white p-1 rounded-xl flex items-center gap-4">
        
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground cursor-pointer hover:text-blue-500 transition-colors z-10" onClick={handleSearchSubmit} />
          <Input placeholder="Buscar por SKU ou Nome (Aperte Enter)..." className="pl-10" value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} onKeyDown={handleKeyDown} />
        </div>

        <Tabs value={canal} onValueChange={(v:any) => setCanal(v)} className="hidden md:block">
          <TabsList>
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="loja">Loja</TabsTrigger>
            <TabsTrigger value="site">Site</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* SIDEBAR DE FILTROS */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="ml-auto flex gap-2">
              <Filter size={16} /> Filtros Avançados
              {(filterForn !== 'all' || filterCat !== 'all') && (<Badge className="ml-1 h-5 px-1.5 bg-primary text-[10px]">Ativos</Badge>)}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] flex flex-col h-full overflow-hidden p-0">
            <div className="p-6 border-b shrink-0">
              <SheetTitle className="flex items-center gap-2"><Filter size={20} /> Filtros de Estoque</SheetTitle>
            </div>
            
            {/* O conteúdo rolável fica aqui, dividindo o espaço restante igualmente */}
            <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
              
              {/* FILTRO FORNECEDOR */}
              <div className="flex flex-col h-1/2">
                <div className="flex justify-between items-center mb-3 shrink-0">
                  <label className="text-sm font-bold uppercase text-slate-500 tracking-wider">Fornecedor</label>
                  {filterForn !== 'all' && <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 p-0" onClick={() => setFilterForn('all')}>Limpar</Button>}
                </div>
                {/* Altura preenche o espaço pai e rola */}
                <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-1">
                  <Button variant={filterForn === 'all' ? 'default' : 'outline'} size="sm" className="justify-start h-8 shrink-0 text-[11px]" onClick={() => setFilterForn('all')}>Todos Fornecedores</Button>
                  {suppliers.map(f => (
                    <Button key={f} variant={filterForn === f ? 'secondary' : 'ghost'} size="sm" className={`justify-start h-8 shrink-0 text-[11px] truncate ${filterForn === f ? 'border-primary ring-1 ring-primary bg-slate-100 font-bold' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setFilterForn(f)}>{f}</Button>
                  ))}
                </div>
              </div>

              {/* FILTRO CATEGORIA EM ÁRVORE */}
              <div className="flex flex-col h-1/2">
                <div className="flex justify-between items-center mb-3 shrink-0">
                  <label className="text-sm font-bold uppercase text-slate-500 tracking-wider">Categoria</label>
                  {filterCat !== 'all' && <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 p-0" onClick={() => setFilterCat('all')}>Limpar</Button>}
                </div>
                {/* Altura preenche o espaço pai e rola */}
                <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-0.5">
                  <Button variant={filterCat === 'all' ? 'default' : 'outline'} size="sm" className="justify-start h-8 shrink-0 text-[11px] mb-1" onClick={() => setFilterCat('all')}>Todas Categorias</Button>
                  
                  {/* MÁGICA VISUAL AQUI */}
                  {categories.map(c => {
                    const parts = c.split(' > '); 
                    const depth = parts.length - 1; 
                    const displayName = parts[parts.length - 1]; 

                    return (
                      <Button 
                        key={c} 
                        variant={filterCat === c ? 'secondary' : 'ghost'} 
                        size="sm" 
                        title={c} 
                        className={cn(
                          "justify-start h-7 shrink-0 text-[11px] truncate transition-all",
                          filterCat === c ? "border-primary ring-1 ring-primary bg-blue-50 text-blue-700 font-bold" : "text-slate-600 hover:bg-slate-50 font-medium",
                          depth === 0 && "mt-2 uppercase text-[10px] tracking-wide text-slate-800 bg-slate-100/50" 
                        )}
                        style={{ paddingLeft: `${(depth * 16) + 12}px` }}
                        onClick={() => setFilterCat(c)}
                      >
                        {depth > 0 && <span className="text-slate-300 mr-1.5 font-normal">└</span>}
                        {displayName}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Rodapé fixo */}
            <div className="p-6 border-t shrink-0 bg-slate-50/50">
              <Button variant="outline" className="w-full flex gap-2" onClick={() => { setFilterCat('all'); setFilterForn('all'); setSearch(''); }}>
                <RotateCcw size={14} /> Resetar Tudo
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}