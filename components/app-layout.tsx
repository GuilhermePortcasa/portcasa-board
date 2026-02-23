"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { DashboardProvider } from "@/providers/dashboard-context";
import { VendasProvider } from "@/providers/vendas-context";
import { Sidebar } from "@/components/sidebar";
import { HeaderNotificacoes } from "@/components/header-notificacoes"; 
import { Menu, X, Package } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const isPublicPage = pathname === "/login" || pathname === "/redefinir-senha";

  if (isPublicPage) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-50">
        {children}
      </main>
    );
  }

  return (
    <DashboardProvider>
      <VendasProvider>
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
          
          <div className="hidden md:block h-full z-40 relative">
            <Sidebar />
          </div>

          <main className="flex-1 flex flex-col h-full min-w-0 relative">
            
            {/* 🔔 SINO DESKTOP CORRIGIDO: Fundo branco, sombra e z-index super alto */}
            <div className="hidden md:flex absolute top-6 right-8 z-[9999] bg-white rounded-full shadow-md border border-slate-200 p-0.5">
              <HeaderNotificacoes />
            </div>

            <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 text-white z-50 shadow-md">
              <div className="flex items-center gap-2 font-bold text-lg">
                <div className="bg-blue-600 p-1.5 rounded-lg text-white">
                  <Package size={20} />
                </div>
                PortCasa Board
              </div>
              
              <div className="flex items-center gap-2">
                <div className="bg-slate-100 rounded-full flex items-center justify-center shadow-sm">
                  <HeaderNotificacoes />
                </div>

                <button 
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors focus:outline-none"
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>

            {isMobileMenuOpen && (
              <div className="md:hidden absolute top-[68px] left-0 w-full h-[calc(100vh-68px)] bg-slate-900/50 z-40 backdrop-blur-sm">
                <div 
                  className="w-3/4 max-w-[280px] h-full bg-white shadow-2xl animate-in slide-in-from-left-4"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Sidebar />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 scroll-smooth">
              {children}
            </div>
          </main>
        </div>
      </VendasProvider>
    </DashboardProvider>
  );
}