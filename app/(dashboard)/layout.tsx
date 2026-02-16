import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar fixa a esquerda */}
      <aside className="hidden md:block">
        <Sidebar />
      </aside>

      {/* Área principal de conteúdo */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
        {/* Aqui é onde entrará o conteúdo de page.tsx, /estoque/page.tsx, etc. */}
        {children}
      </main>
    </div>
  );
}