"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  Menu,
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
  { name: "Admin", href: "/admin", icon: ShieldCheck },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" />}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-20 items-center border-b border-border/60 px-6">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <span className="block font-heading text-base font-semibold tracking-tight">
                FollowUp
              </span>
              <span className="block text-[0.64rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                CRM
              </span>
            </div>
          </Link>
        </div>
        <nav className="flex flex-col gap-y-1 p-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-x-3 rounded-lg px-3 py-2.5 text-sm font-medium tracking-[-0.01em] transition-all",
                  isActive
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
