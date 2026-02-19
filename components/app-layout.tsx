// components/app-layout.tsx
"use client";

import { usePathname } from "next/navigation";
import { DashboardProvider } from "@/providers/dashboard-context";
import { Sidebar } from "@/components/sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Define as páginas que usam o layout "limpo" (sem sidebar/header)
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
      <div className="flex h-screen w-full">
        <Sidebar />

        <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          {/* Header Removido Daqui! Ele vai para as páginas agora. */}
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            {children}
          </div>
        </main>
      </div>
    </DashboardProvider>
  );
}