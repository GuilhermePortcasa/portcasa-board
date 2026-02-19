"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, History, BarChart3, Package } from "lucide-react";
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
        .select("*")
        .order("data", { ascending: false });
      if (res) setData(res);
      setLoading(false);
    }
    fetchHistorico();
  }, []);

  // Lógica para calcular a diferença em relação ao dia anterior (linha abaixo na tabela)
  const rowsWithDiff = useMemo(() => {
    return data.map((current, index) => {
      const previous = data[index + 1]; // O dia anterior está na próxima posição do array (ordem desc)
      
      return {
        ...current,
        diff_est_loja: previous ? current.estoque_loja - previous.estoque_loja : 0,
        diff_est_site: previous ? current.estoque_site - previous.estoque_site : 0,
      };
    });
  }, [data]);

  if (loading) return <div className="p-10 text-center text-slate-500">Carregando linha do tempo...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> Histórico Geral
          </h2>
          <p className="text-sm text-slate-500">Evolução diária de estoque, vendas e performance.</p>
        </div>
      </div>

      <Card className="overflow-hidden border-none shadow-xl">
        <Table>
          <TableHeader className="bg-slate-900">
            <TableRow>
              <TableHead className="text-white text-[10px] uppercase font-bold">Data</TableHead>
              <TableHead className="text-white text-[10px] uppercase font-bold">Estoque Geral</TableHead>
              <TableHead className="text-white text-[10px] uppercase font-bold text-center">Evolução Site</TableHead>
              <TableHead className="text-white text-[10px] uppercase font-bold text-center">Evolução Loja</TableHead>
              <TableHead className="text-white text-[10px] uppercase font-bold">Vendas Site</TableHead>
              <TableHead className="text-white text-[10px] uppercase font-bold">Vendas Loja</TableHead>
              <TableHead className="text-white text-[10px] uppercase font-bold">Top 3 (Loja / Site)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsWithDiff.map((row) => (
              <TableRow key={row.data} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <TableCell className="font-bold text-slate-700">
                  {new Date(row.data).toLocaleDateString('pt-BR')}
                </TableCell>
                
                <TableCell className="font-black text-slate-900">
                  {fCurrency(Number(row.estoque_loja) + Number(row.estoque_site))}
                </TableCell>

                <TableCell className="text-center">
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-medium">{fCurrency(row.estoque_site)}</span>
                    <DiffBadge value={row.diff_est_site} />
                  </div>
                </TableCell>

                <TableCell className="text-center">
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-medium">{fCurrency(row.estoque_loja)}</span>
                    <DiffBadge value={row.diff_est_loja} />
                  </div>
                </TableCell>

                <TableCell className="font-bold text-green-600 bg-green-50/30">
                  {fCurrency(row.vendas_site)}
                </TableCell>

                <TableCell className="font-bold text-green-700 bg-green-50/50">
                  {fCurrency(row.vendas_loja)}
                </TableCell>

                <TableCell className="max-w-[400px]">
                  <div className="grid grid-cols-2 gap-4 py-1">
                    <div className="text-[10px] space-y-1">
                       <span className="font-bold text-orange-600 uppercase block mb-1">Loja</span>
                       {row.top3_loja?.split('\n').map((line: string, i: number) => <div key={i} className="truncate text-slate-500">{line}</div>) || "-"}
                    </div>
                    <div className="text-[10px] space-y-1">
                       <span className="font-bold text-purple-600 uppercase block mb-1">Site</span>
                       {row.top3_site?.split('\n').map((line: string, i: number) => <div key={i} className="truncate text-slate-500">{line}</div>) || "-"}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// Componente auxiliar para a Badge de Diferença
function DiffBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <div className={cn(
      "flex items-center text-[9px] font-bold mt-0.5",
      isPositive ? "text-green-600" : "text-red-500"
    )}>
      {isPositive ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
      {fCurrency(Math.abs(value))}
    </div>
  );
}