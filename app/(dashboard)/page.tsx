import React from "react";
import { DashboardHeader } from "@/components/header";
import { Card } from "@/components/ui/card";
import { LayoutDashboard } from "lucide-react";

export default function VisaoGeralPage() {
  return (
    <div className="space-y-6">
      <DashboardHeader />
      <Card className="p-20 flex flex-col items-center justify-center text-slate-400 border-none shadow-xl bg-white rounded-xl h-[calc(100vh-180px)]">
        <LayoutDashboard size={64} className="mb-6 text-blue-500 opacity-20" />
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Visão Geral</h2>
        <p className="font-medium text-slate-500">
          O Dashboard Consolidado será construído nesta página em breve.
        </p>
        <p className="text-xs mt-4 text-slate-400">
          Navegue para as abas de <span className="font-bold text-slate-500">Estoque</span> ou <span className="font-bold text-slate-500">Vendas</span> no menu lateral para acessar o sistema.
        </p>
      </Card>
    </div>
  );
}