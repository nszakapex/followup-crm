import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-64">
        <Header />
        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
