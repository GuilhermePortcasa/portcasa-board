"use client";

import React, { useMemo, useState } from "react";
import { useDashboard } from "@/providers/dashboard-context";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardHeader } from "@/components/header";
import { FileBarChart, Filter, Search, Package, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const fNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);

// --- FUNÇÃO AUXILIAR DE MINERAÇÃO DE TEXTO ---
const extrairAtributos = (nome: string) => {
  const n = nome.toUpperCase();
  
  // 1. Tamanho
  let tamanho = "Outros";
  if (n.includes("SOLTEIRO")) tamanho = "Solteiro";
  else if (n.includes("QUEEN")) tamanho = "Queen";
  else if (n.includes("KING")) tamanho = "King";
  else if (n.includes("CASAL")) tamanho = "Casal";

  // 2. Tecido/Estilo
  let estilo = "Liso";
  if (n.includes("ESTAMPADO")) estilo = "Estampado";
  else if (n.includes("MAQUINETADO")) estilo = "Maquinetado";

  // 3. Quantidade de Peças
  let pecas = "N/I";
  const matchPec = n.match(/(\d+)PC/);
  if (matchPec) pecas = `${matchPec[1]} Peças`;

  // 4. Linha de Produto (Ex: Toque de Seda, 300 Fios, etc)
  // Aqui você define as linhas principais para agrupar
  let linha = "Diversos";
  if (n.includes("TOQUE DE SEDA")) linha = "Toque de Seda";
  else if (n.includes("300 FIOS")) linha = "300 Fios";
  else if (n.includes("PREMIUM")) linha = "Premium";
  else if (n.includes("MICROFIBRA")) linha = "Microfibra";

  return { tamanho, estilo, pecas, linha };
};

export default function RelatorioPage() {
  const { rawData, loading } = useDashboard();
  const [busca, setBusca] = useState("");

  const relatorioAgrupado = useMemo(() => {
    const grupos: Record<string, any> = {};

    rawData.forEach((item) => {
      // Ignora Kits Estruturais
      if (item.tipo === 'E') return;

      const { linha, tamanho, estilo, pecas } = extrairAtributos(item.nome);
      
      // Chave única para o agrupamento: Linha + Tamanho + Estilo
      const chave = `${linha}|${tamanho}|${estilo}|${pecas}`;

      if (!grupos[chave]) {
        grupos[chave] = {
          linha,
          tamanho,
          estilo,
          pecas,
          est_total: 0,
          v_30d: 0,
          fornecedores: new Set(),
        };
      }

      grupos[chave].est_total += Number(item.est_total || 0);
      grupos[chave].v_30d += (Number(item.v_qtd_30d_site || 0) + Number(item.v_qtd_30d_loja || 0));
      if (item.fornecedor) grupos[chave].fornecedores.add(item.fornecedor);
    });

    // Converte objeto em array e filtra pela busca
    return Object.values(grupos)
      .filter(g => 
        g.linha.toLowerCase().includes(busca.toLowerCase()) || 
        g.tamanho.toLowerCase().includes(busca.toLowerCase())
      )
      .sort((a, b) => a.linha.localeCompare(b.linha));
  }, [rawData, busca]);

  if (loading) return <div className="p-10 text-center animate-pulse">Gerando relatório consolidado...</div>;

  return (
    <div className="space-y-6 pb-10">
      <DashboardHeader />

      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileBarChart className="text-blue-600" /> Relatório por Linha e Atributos
          </h1>
          <p className="text-sm text-slate-500">Agrupamento inteligente de produtos similares independente do fornecedor.</p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Filtrar linha ou tamanho..." 
            className="pl-9" 
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-none shadow-xl overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-slate-900">
            <TableRow className="hover:bg-slate-900 border-none">
              <TableHead className="text-white font-bold h-12">LINHA DE PRODUTO</TableHead>
              <TableHead className="text-white font-bold">TAMANHO</TableHead>
              <TableHead className="text-white font-bold">ESTILO</TableHead>
              <TableHead className="text-white font-bold">PEÇAS</TableHead>
              <TableHead className="text-white font-bold text-center">ESTOQUE TOTAL</TableHead>
              <TableHead className="text-white font-bold text-center">VENDAS (30D)</TableHead>
              <TableHead className="text-white font-bold">FORNECEDORES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relatorioAgrupado.map((grupo, idx) => (
              <TableRow key={idx} className="hover:bg-slate-50 transition-colors">
                <TableCell className="font-black text-slate-700">{grupo.linha}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-slate-50">{grupo.tamanho}</Badge>
                </TableCell>
                <TableCell>
                  <span className={grupo.estilo === 'Estampado' ? "text-purple-600 font-medium" : "text-slate-600"}>
                    {grupo.estilo}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-slate-500 font-medium">{grupo.pecas}</TableCell>
                <TableCell className="text-center font-bold">
                  <div className="flex items-center justify-center gap-1.5">
                    <Package size={14} className="text-slate-400" />
                    {fNum(grupo.est_total)}
                  </div>
                </TableCell>
                <TableCell className="text-center font-bold text-emerald-600">
                  <div className="flex items-center justify-center gap-1.5">
                    <ShoppingCart size={14} className="text-emerald-400" />
                    {fNum(grupo.v_30d)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {Array.from(grupo.fornecedores).map((f: any) => (
                      <span key={f} className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                        {f.split(' ')[0]} {/* Mostra só o primeiro nome do fornecedor pra não poluir */}
                      </span>
                    ))}
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