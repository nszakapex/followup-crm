import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AuthProvider } from "@/components/auth-provider";
import { SafetyModeBanner } from "@/components/diagnostics/safety-mode-banner";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-transparent">
        <Sidebar />
        <div className="lg:pl-64">
          <Header />
          <SafetyModeBanner />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
            {children}
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </AuthProvider>
  );
}
