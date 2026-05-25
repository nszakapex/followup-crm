"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Star, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const primaryNav = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Actions", href: "/automations", icon: Zap },
  { name: "Reviews", href: "/reviews", icon: Star },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-shell-border/90 bg-shell/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2 backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5 gap-1">
        {primaryNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.name}>
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] font-medium",
                  active
                    ? "bg-shell-card text-shell-text"
                    : "text-shell-muted hover:bg-shell-card/60 hover:text-shell-text"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className={cn("mb-1 h-4 w-4", active ? "text-primary" : "")} />
                <span>{item.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
