"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Zap,
  Star,
  MessageSquare,
  Settings,
  CreditCard,
  ShieldCheck,
  ClipboardCheck,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Setup", href: "/setup", icon: ClipboardCheck },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Automations", href: "/automations", icon: Zap },
  { name: "Reviews", href: "/reviews", icon: Star },
  { name: "Messages", href: "/messages", icon: MessageSquare },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Billing", href: "/billing", icon: CreditCard },
];

const adminNav = [
  { name: "Admin", href: "/admin", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
      <div className="flex grow flex-col gap-y-6 overflow-y-auto border-r border-shell-border bg-shell px-5 pb-5">
        <div className="flex h-20 shrink-0 items-center">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <span className="block font-heading text-base font-semibold tracking-tight text-shell-text">
                FollowUp
              </span>
              <span className="block text-[0.64rem] font-medium uppercase tracking-[0.18em] text-shell-muted">
                CRM
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-x-3 rounded-lg px-3 py-2.5 text-sm font-medium tracking-[-0.01em] transition-all",
                      isActive
                        ? "bg-shell-card text-white shadow-sm"
                        : "text-shell-muted hover:bg-shell-card/60 hover:text-shell-text"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-primary" : ""
                      )}
                    />
                    {item.name}
                  </Link>
                </li>
              );
            })}

            <li className="mt-auto">
              <div className="mb-3">
                <Separator />
              </div>
              {adminNav.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-x-3 rounded-lg px-3 py-2.5 text-sm font-medium tracking-[-0.01em] transition-all",
                      isActive
                        ? "bg-shell-card text-white shadow-sm"
                        : "text-shell-muted hover:bg-shell-card/60 hover:text-shell-text"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-primary" : ""
                      )}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </li>
          </ul>
        </nav>
      </div>
    </aside>
  );
}

function Separator() {
  return <div className="h-px bg-shell-border" />;
}
