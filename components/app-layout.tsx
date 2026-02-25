"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { DashboardProvider } from "@/providers/dashboard-context";
import { VendasProvider } from "@/providers/vendas-context";
import { Sidebar } from "@/components/sidebar";
import { HeaderNotificacoes } from "@/components/header-notificacoes"; 
import { Menu, X } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const isPublicPage = pathname === "/login" || pathname === "/redefinir-senha";

  if (isPublicPage) {
    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center bg-slate-50">
        {children}
      </main>
    );
  }

  return (
    <DashboardProvider>
      <VendasProvider>
        {/* TROCA 1: h-screen substituído por h-[100dvh] para suportar Safari/iPad */}
        <div className="flex h-[100dvh] w-full bg-slate-50 overflow-hidden">
          
          <div className="hidden md:block h-full z-40 relative shrink-0">
            <Sidebar />
          </div>

          <main className="flex-1 flex flex-col h-full min-w-0 relative">
            
            {/* CABEÇALHO MOBILE ALINHADO COM A SIDEBAR */}
            <div className="md:hidden flex items-center justify-between p-4 bg-card border-b shadow-sm z-50 h-[80px] shrink-0">
              <div className="block">
                <h1 className="text-2xl font-bold text-primary tracking-tight">
                  PORT<span className="font-light">Casa</span>
                </h1>
                <p className="text-xs text-muted-foreground whitespace-nowrap">CAMA • MESA • BANHO</p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="bg-slate-50 rounded-full flex items-center justify-center border border-slate-200">
                  <HeaderNotificacoes />
                </div>

                <button 
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>

            {isMobileMenuOpen && (
              // TROCA 2: Ajuste de altura do fundo fosco para considerar o cabeçalho e usar dvh
              <div className="md:hidden absolute top-[80px] left-0 w-full h-[calc(100dvh-80px)] bg-slate-900/50 z-40 backdrop-blur-sm">
                <div 
                  className="w-3/4 max-w-[280px] h-full bg-white shadow-2xl animate-in slide-in-from-left-4"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Sidebar />
                </div>
              </div>
            )}

            {/* A área de rolagem. pb-safe-bottom é adicionado para suportar a barra inicial do iPhone/iPad */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 scroll-smooth pb-safe">
              {children}
            </div>
          </main>
        </div>
      </VendasProvider>
    </DashboardProvider>
  );
}