"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils"; // Função utilitária do shadcn
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  History,
  BarChartBig,
} from "lucide-react"; // Ícones modernos (instale: npm i lucide-react)

const sidebarItems = [
  { icon: History, label: "Histórico", href: "/historico" },
  { icon: LayoutDashboard, label: "Visão Geral", href: "/" },
  { icon: Package, label: "Estoque", href: "/estoque" }, // Página ativa no print
  { icon: ShoppingCart, label: "Vendas", href: "/vendas" },
  { icon: BarChartBig, label: "Index C&V", href: "/index-cv" },
  { icon: FileText, label: "Pedidos", href: "/pedidos" },
  { icon: FileText, label: "Relatório", href: "/relatorio" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="h-full w-64 border-r bg-card flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b bg-primary/5">
        <h1 className="text-2xl font-bold text-primary tracking-tight">
          PORT<span className="font-light">Casa</span>
        </h1>
        <p className="text-xs text-muted-foreground">CAMA • MESA • BANHO</p>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm" // Estilo Ativo (Vermelho)
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground" // Estilo Inativo
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

       {/* Footer da Sidebar (Opcional: Usuário/Logout) */}
       <div className="p-4 border-t text-sm text-muted-foreground">
          <p>Usuário Logado</p>
       </div>
    </div>
  );
}