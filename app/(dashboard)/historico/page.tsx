"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  TrendingUp, TrendingDown, History, 
  Calendar as CalendarIcon, Filter, SearchX
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

// Componentes para o Calendário
import { format, subDays, isWithinInterval, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function HistoricoPage() {
  const supabase = createClient();
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
// Controle do filtro ativo (Padrão: "tudo")
  const [activePreset, setActivePreset] = useState<string>("tudo");

  // Estado do Calendário (Padrão: undefined para não filtrar datas)
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  
  useEffect(() => {
    async function fetchHistorico() {
      setLoading(true);
      const { data: res } = await supabase
        .from("historico_resumo")
        .select("data, estoque_loja, estoque_site")
        .order("data", { ascending: false });
      if (res) setRawData(res);
      setLoading(false);
    }
    fetchHistorico();
  }, []);

  // Função para aplicar os atalhos rápidos
  const handlePreset = (days: number | null, presetName: string) => {
    setActivePreset(presetName);
    if (days === null) {
      setDate(undefined); // "Tudo" - remove o filtro de datas
    } else {
      setDate({
        from: subDays(new Date(), days),
        to: new Date(),
      });
    }
  };

  // FILTRAGEM DINÂMICA PELO CALENDÁRIO OU ATALHO
  const filteredData = useMemo(() => {
    let list = [...rawData];
    
    // Se tiver data 'from' (mesmo que 'to' ainda não tenha sido clicada no calendário)
    if (date?.from) {
      list = list.filter(item => {
        const itemDate = new Date(item.data + 'T00:00:00');
        const endDay = date.to ? startOfDay(date.to) : startOfDay(date.from!); // Resolve o clique único
        return isWithinInterval(itemDate, { 
          start: startOfDay(date.from!), 
          end: endDay
        });
      });
    }

    return list.map((current, index) => {
      // Buscamos o "dia anterior" no rawData original para não quebrar o cálculo da evolução
      const previous = rawData[rawData.findIndex(d => d.data === current.data) + 1];
      const total = Number(current.estoque_loja) + Number(current.estoque_site);
      const prevTotal = previous ? Number(previous.estoque_loja) + Number(previous.estoque_site) : total;

      return {
        ...current,
        total,
        diff_loja: previous ? current.estoque_loja - previous.estoque_loja : 0,
        diff_site: previous ? current.estoque_site - previous.estoque_site : 0,
        diff_total: total - prevTotal,
        data_fmt: format(new Date(current.data + 'T00:00:00'), "dd/MM", { locale: ptBR })
      };
    });
  }, [rawData, date]);

  const chartData = useMemo(() => [...filteredData].reverse(), [filteredData]);

  if (loading) return <div className="p-10 text-center text-slate-500 italic animate-pulse font-medium">Sincronizando base de dados...</div>;

  return (
    <div className="space-y-6 pb-10">
      {/* HEADER COM DATE PICKER E ATALHOS */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> Evolução de Patrimônio
          </h2>
          <p className="text-sm text-slate-500">Histórico de inventário por período selecionado.</p>
        </div>

        {/* CONTROLES DE FILTRO */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
          
          {/* BOTÕES DE ATALHO RÁPIDO */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg w-full sm:w-auto justify-between">
            <Button variant={activePreset === "7d" ? "default" : "ghost"} size="sm" className="text-xs h-7 px-3" onClick={() => handlePreset(7, "7d")}>7D</Button>
            <Button variant={activePreset === "30d" ? "default" : "ghost"} size="sm" className="text-xs h-7 px-3" onClick={() => handlePreset(30, "30d")}>30D</Button>
            <Button variant={activePreset === "90d" ? "default" : "ghost"} size="sm" className="text-xs h-7 px-3" onClick={() => handlePreset(90, "90d")}>90D</Button>
            <Button variant={activePreset === "tudo" ? "default" : "ghost"} size="sm" className="text-xs h-7 px-3" onClick={() => handlePreset(null, "tudo")}>Tudo</Button>
          </div>

          {/* COMPONENTE DE CALENDÁRIO */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                className={cn(
                  "w-full sm:w-[260px] justify-start text-left font-normal border-slate-200 shadow-sm hover:bg-slate-50",
                  !date && "text-muted-foreground",
                  activePreset === "custom" && "border-blue-500 ring-1 ring-blue-500" // Destaca se estiver no modo custom
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-blue-600" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "dd/MM/yy")} a {format(date.to, "dd/MM/yy")}
                    </>
                  ) : (
                    format(date.from, "dd/MM/yy")
                  )
                ) : (
                  <span>Período personalizado</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={(newDate) => {
                  setDate(newDate);
                  setActivePreset("custom"); // Muda o estado para customizado ao clicar no calendário
                }}
                numberOfMonths={2}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <Card className="p-20 flex flex-col items-center justify-center text-slate-400">
           <SearchX size={48} className="mb-4 opacity-20" />
           <p className="font-medium">Nenhum registro encontrado para este período.</p>
           <Button variant="link" onClick={() => handlePreset(30, "30d")}>
             Voltar para 30 dias
           </Button>
        </Card>
      ) : (
        <>
          {/* GRÁFICO */}
          <Card className="p-6 border-none shadow-xl bg-white overflow-hidden">
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSite" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLoja" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="data_fmt" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 10, fill: '#94a3b8'}}
                    minTickGap={20}
                  />
                  <YAxis hide domain={['dataMin * 0.95', 'dataMax * 1.05']} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [fCurrency(value), ""]}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingBottom: '25px' }} />
                  <Area 
                    type="monotone" 
                    name="Site" 
                    dataKey="estoque_site" 
                    stroke="#8b5cf6" 
                    strokeWidth={3} 
                    fill="url(#colorSite)" 
                  />
                  <Area 
                    type="monotone" 
                    name="Loja" 
                    dataKey="estoque_loja" 
                    stroke="#f59e0b" 
                    strokeWidth={3} 
                    fill="url(#colorLoja)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* TABELA */}
          <Card className="overflow-hidden border-none shadow-xl">
            <Table>
              <TableHeader className="bg-slate-900 text-white">
                <TableRow className="hover:bg-slate-900 border-none">
                  <TableHead className="text-white font-bold h-12">DATA</TableHead>
                  <TableHead className="text-white font-bold text-center">ESTOQUE SITE</TableHead>
                  <TableHead className="text-white font-bold text-center">ESTOQUE LOJA</TableHead>
                  <TableHead className="text-white font-bold text-right">PATRIMÔNIO TOTAL</TableHead>
                  <TableHead className="text-white font-bold text-right">VARIAÇÃO (24H)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((row) => {
                  const isToday = row.data === new Date().toISOString().split('T')[0];
                  return (
                    <TableRow key={row.data} className={cn(isToday && "bg-blue-50/50")}>
                      <TableCell className="font-bold text-slate-700 whitespace-nowrap">
                        {format(new Date(row.data + 'T00:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR })}
                        {isToday && <Badge className="ml-2 bg-blue-500 hover:bg-blue-600 text-[9px] h-4">HOJE</Badge>}
                      </TableCell>
                      <TableCell className="text-center font-medium">{fCurrency(row.estoque_site)} <DiffBadge value={row.diff_site} /></TableCell>
                      <TableCell className="text-center font-medium">{fCurrency(row.estoque_loja)} <DiffBadge value={row.diff_loja} /></TableCell>
                      <TableCell className="text-right font-black text-slate-900 text-base">{fCurrency(row.total)}</TableCell>
                      <TableCell className="text-right">
                        <div className={cn(
                          "inline-flex items-center px-2 py-1 rounded-md font-bold text-[10px]",
                          row.diff_total > 0 ? "bg-green-100 text-green-700" : row.diff_total < 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {row.diff_total > 0 ? "+" : ""}{fCurrency(row.diff_total)}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function DiffBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <div className={cn("flex items-center justify-center text-[9px] font-bold mt-0.5", isPositive ? "text-green-600" : "text-red-500")}>
      {isPositive ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
      {fCurrency(Math.abs(value))}
    </div>
  );
}