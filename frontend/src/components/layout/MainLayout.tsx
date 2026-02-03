import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="h-screen flex w-full bg-gradient-to-br from-background via-background to-primary/5 overflow-hidden">
      {/* Decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-40 right-32 w-80 h-80 bg-cyan/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-success/10 rounded-full blur-3xl" />
      </div>

      <AppSidebar />

      <main className="flex-1 relative z-10 h-screen overflow-hidden">
        <div className="h-full p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
