import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DashboardProvider } from "@/providers/dashboard-context";
import { DashboardHeader } from "@/components/header";
import { Sidebar } from "@/components/sidebar"; // Importe a sidebar aqui

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dashboard Estoque",
  description: "Gerenciamento de estoque",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 overflow-hidden`}>
        <DashboardProvider>
          {/* Container Flex que ocupa 100% da altura da tela */}
          <div className="flex h-screen w-full">
            
            {/* Sidebar Fixa a Esquerda */}
            <Sidebar />

            {/* Área Principal (Conteúdo) */}
            <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
              
              {/* Header Fixo no Topo da Área Principal */}
              <div className="border-b bg-white px-6 py-4 shadow-sm z-10">
                 <DashboardHeader />
              </div>

              {/* Área de Scroll apenas para o conteúdo da página (Tabela) */}
              <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                {children}
              </div>
              
            </main>
          </div>
        </DashboardProvider>
      </body>
    </html>
  );
}