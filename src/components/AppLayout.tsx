import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { RouteTransition } from "@/components/RouteTransition";

export function AppLayout({ children, noPadding = false }: { children: React.ReactNode; noPadding?: boolean }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-paper">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-4 border-b border-line px-6 bg-paper">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Set / Painel
            </span>
          </header>
          <div className={`flex-1 overflow-auto ${noPadding ? "" : "p-6 md:p-8"}`}>
            <RouteTransition>{children}</RouteTransition>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
