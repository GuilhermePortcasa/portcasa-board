"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  History,
  BarChartBig,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";

const sidebarItems = [
  { icon: History, label: "Histórico", href: "/historico" },
  { icon: LayoutDashboard, label: "Visão Geral", href: "/" },
  { icon: Package, label: "Estoque", href: "/estoque" },
  { icon: ShoppingCart, label: "Vendas", href: "/vendas" },
  { icon: BarChartBig, label: "Index C&V", href: "/index-cv" },
  { icon: FileText, label: "Compras", href: "/compras" },
  { icon: FileText, label: "Relatório", href: "/relatorio" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login"); // Redireciona para a página de login
  };

  return (
    <div 
      className={cn(
        "h-full border-r bg-card flex flex-col transition-all duration-300 relative",
        // No celular é sempre largura 100% da gaveta. No PC respeita o collapse (w-16 ou w-64)
        isCollapsed ? "w-full md:w-16" : "w-full md:w-64" 
      )}
    >
      {/* Botão de Toggle (Retração) - Oculto no Mobile, pois lá usa-se o Hamburguer */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:flex absolute -right-3 top-6 h-6 w-6 rounded-full border bg-background shadow-sm z-10 hover:bg-slate-100 items-center justify-center"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </Button>

      {/* Logo */}
      <div className={cn("p-6 border-b bg-primary/5 flex items-center h-[80px]", isCollapsed && "md:justify-center md:p-2")}>
        {/* No mobile nunca mostramos o logo "encolhido" (P), sempre o completo */}
        <div className={cn("hidden md:block", !isCollapsed && "hidden")}>
           <h1 className="text-xl font-bold text-primary">P</h1>
        </div>
        
        <div className={cn(isCollapsed ? "md:hidden block" : "block")}>
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            PORT<span className="font-light">Casa</span>
          </h1>
          <p className="text-xs text-muted-foreground whitespace-nowrap">CAMA • MESA • BANHO</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto py-4 overflow-x-hidden">
        <ul className="space-y-1 px-2">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    isCollapsed && "md:justify-center md:px-2"
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className={cn("h-5 w-5 min-w-[20px]", isActive && "text-white")} />
                  {/* No mobile, os textos sempre aparecem */}
                  <span className={cn("truncate", isCollapsed ? "md:hidden block" : "block")}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer / Botão Sair */}
      <div className={cn("p-4 border-t text-sm h-[70px] flex items-center", isCollapsed ? "md:justify-center" : "")}>
        <button 
          onClick={handleLogout}
          disabled={isLoggingOut}
          title="Sair da conta"
          className={cn(
            "w-full flex items-center gap-3 rounded-md transition-all duration-200 text-muted-foreground hover:text-red-600 hover:bg-red-50",
            isCollapsed ? "md:justify-center md:p-2 px-3 py-2" : "px-3 py-2",
            isLoggingOut && "opacity-50 cursor-not-allowed"
          )}
        >
          
          {/* Versão Completa (Sempre visível no Mobile) */}
          <div className={cn("flex items-center gap-3 w-full", isCollapsed ? "md:hidden flex" : "flex")}>
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
              <User size={16} />
            </div>
            <div className="flex flex-col text-left flex-1">
              <span className="font-bold text-xs text-slate-700">Minha Conta</span>
              <span className="text-[10px] uppercase font-semibold text-red-500">
                {isLoggingOut ? "Saindo..." : "Sair do sistema"}
              </span>
            </div>
            <LogOut className="h-4 w-4 shrink-0 text-red-500/70" />
          </div>
        </button>
      </div>
    </div>
  );
}