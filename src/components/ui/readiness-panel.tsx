import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  MinusCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ReadinessStatus =
  | "complete"
  | "needs_setup"
  | "optional"
  | "not_configured";

export type ReadinessItem = {
  title: string;
  description: string;
  status: ReadinessStatus;
  href?: string;
  cta?: string;
};

const statusConfig: Record<
  ReadinessStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    dotClassName: string;
    badgeClassName: string;
  }
> = {
  complete: {
    label: "Complete",
    icon: CheckCircle2,
    dotClassName: "text-emerald-600 dark:text-emerald-300",
    badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  needs_setup: {
    label: "Needs setup",
    icon: AlertCircle,
    dotClassName: "text-amber-600 dark:text-amber-300",
    badgeClassName: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  optional: {
    label: "Optional",
    icon: Circle,
    dotClassName: "text-muted-foreground",
    badgeClassName: "border-border/70 bg-muted/40 text-muted-foreground",
  },
  not_configured: {
    label: "Not configured",
    icon: MinusCircle,
    dotClassName: "text-muted-foreground",
    badgeClassName: "border-border/70 bg-background text-muted-foreground",
  },
};

export function ReadinessPanel({
  title = "Business readiness",
  description,
  items,
  footer,
  className,
}: {
  title?: string;
  description?: string;
  items: ReadinessItem[];
  footer?: ReactNode;
  className?: string;
}) {
  const requiredItems = items.filter((item) => item.status !== "optional");
  const completeItems = requiredItems.filter((item) => item.status === "complete");
  const totalRequired = requiredItems.length;
  const completeCount = completeItems.length;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="shrink-0 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-right">
          <p className="text-2xl font-semibold text-foreground">
            {completeCount}/{totalRequired || items.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">essentials ready</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => {
          const config = statusConfig[item.status];
          const Icon = config.icon;
          const content = (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4 transition-colors hover:border-foreground/15 hover:bg-muted/25">
              <div className="flex min-w-0 items-start gap-3">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.dotClassName)} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <Badge variant="outline" className={cn("px-2 py-0 text-[0.68rem]", config.badgeClassName)}>
                      {config.label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
              {item.href && (
                <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className="hidden sm:inline">{item.cta ?? "Open"}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          );

          return item.href ? (
            <Link key={item.title} href={item.href} className="block">
              {content}
            </Link>
          ) : (
            <div key={item.title}>{content}</div>
          );
        })}
        {footer && <div className="pt-2">{footer}</div>}
      </CardContent>
    </Card>
  );
}
