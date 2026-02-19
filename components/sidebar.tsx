"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  History,
  BarChartBig,
  ChevronLeft,
  ChevronRight,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";

const sidebarItems = [
  { icon: History, label: "Histórico", href: "/historico" },
  { icon: LayoutDashboard, label: "Visão Geral", href: "/" },
  { icon: Package, label: "Estoque", href: "/estoque" },
  { icon: ShoppingCart, label: "Vendas", href: "/vendas" },
  { icon: BarChartBig, label: "Index C&V", href: "/index-cv" },
  { icon: FileText, label: "Pedidos", href: "/pedidos" },
  { icon: FileText, label: "Relatório", href: "/relatorio" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className={cn(
        "h-full border-r bg-card flex flex-col transition-all duration-300 relative",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Botão de Toggle (Retração) */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-6 h-6 w-6 rounded-full border bg-background shadow-sm z-10 hover:bg-slate-100"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </Button>

      {/* Logo */}
      <div className={cn("p-6 border-b bg-primary/5 flex items-center h-[80px]", isCollapsed && "justify-center p-2")}>
        {isCollapsed ? (
          <h1 className="text-xl font-bold text-primary">P</h1>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">
              PORT<span className="font-light">Casa</span>
            </h1>
            <p className="text-xs text-muted-foreground whitespace-nowrap">CAMA • MESA • BANHO</p>
          </div>
        )}
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
                    isCollapsed && "justify-center px-2"
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className={cn("h-5 w-5 min-w-[20px]", isActive && "text-white")} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className={cn("p-4 border-t text-sm text-muted-foreground h-[60px] flex items-center", isCollapsed && "justify-center")}>
        {isCollapsed ? (
           <LogOut className="h-5 w-5" />
        ) : (
          <div className="flex items-center gap-2">
             <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center">U</div>
             <div className="flex flex-col">
                <span className="font-bold text-xs text-slate-700">Usuário</span>
                <span className="text-[10px]">Sair</span>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}