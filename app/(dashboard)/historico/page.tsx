"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, History, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const fCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function HistoricoPage() {
  const supabase = createClient();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistorico() {
      const { data: res } = await supabase
        .from("historico_resumo")
        .select("data, estoque_loja, estoque_site")
        .order("data", { ascending: false });
      if (res) setData(res);
      setLoading(false);
    }
    fetchHistorico();
  }, []);

  const rowsWithDiff = useMemo(() => {
    return data.map((current, index) => {
      const previous = data[index + 1];
      return {
        ...current,
        total: Number(current.estoque_loja) + Number(current.estoque_site),
        diff_loja: previous ? current.estoque_loja - previous.estoque_loja : 0,
        diff_site: previous ? current.estoque_site - previous.estoque_site : 0,
        diff_total: previous ? (Number(current.estoque_loja) + Number(current.estoque_site)) - (Number(previous.estoque_loja) + Number(previous.estoque_site)) : 0,
      };
    });
  }, [data]);

  if (loading) return <div className="p-10 text-center text-slate-500 italic">Consultando arquivos de inventário...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <History className="text-blue-600" /> Histórico de Inventário
        </h2>
        <p className="text-sm text-slate-500">Acompanhamento diário do patrimônio em estoque (Site e Loja).</p>
      </div>

      <Card className="overflow-hidden border-none shadow-xl">
        <Table>
          <TableHeader className="bg-slate-900 text-white">
            <TableRow className="hover:bg-slate-900 border-none">
              <TableHead className="text-white font-bold w-[150px]">DATA</TableHead>
              <TableHead className="text-white font-bold text-center">ESTOQUE SITE</TableHead>
              <TableHead className="text-white font-bold text-center">ESTOQUE LOJA</TableHead>
              <TableHead className="text-white font-bold text-right">PATRIMÔNIO TOTAL</TableHead>
              <TableHead className="text-white font-bold text-right">EVOLUÇÃO (24H)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsWithDiff.map((row) => {
              const dateObj = new Date(row.data + 'T00:00:00');
              const isToday = row.data === new Date().toISOString().split('T')[0];

              return (
                <TableRow key={row.data} className={cn(isToday && "bg-blue-50/50")}>
                  <TableCell className="font-bold text-slate-700">
                    {dateObj.toLocaleDateString('pt-BR')}
                    {isToday && <Badge className="ml-2 bg-blue-500 text-[9px] h-4">HOJE</Badge>}
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="text-sm font-medium">{fCurrency(row.estoque_site)}</div>
                    <DiffBadge value={row.diff_site} />
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="text-sm font-medium">{fCurrency(row.estoque_loja)}</div>
                    <DiffBadge value={row.diff_loja} />
                  </TableCell>

                  <TableCell className="text-right font-black text-slate-900 text-base">
                    {fCurrency(row.total)}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className={cn(
                      "inline-flex items-center px-2 py-1 rounded-md font-bold text-xs",
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
    </div>
  );
}

function DiffBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <div className={cn(
      "flex items-center justify-center text-[10px] font-bold mt-0.5",
      isPositive ? "text-green-600" : "text-red-500"
    )}>
      {isPositive ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
      {fCurrency(Math.abs(value))}
    </div>
  );
}