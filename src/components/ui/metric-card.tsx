import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricTone = "neutral" | "good" | "attention";

const toneClasses: Record<MetricTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  attention: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export function MetricCard({
  label,
  value,
  context,
  trend,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string | number;
  context?: string;
  trend?: ReactNode;
  icon?: ComponentType<LucideProps>;
  tone?: MetricTone;
  className?: string;
}) {
  return (
    <Card className={cn("transition-colors hover:border-foreground/15", className)}>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {label}
            </p>
            <div className="mt-3 text-4xl font-semibold text-foreground">
              {value}
            </div>
          </div>
          {Icon && (
            <div className={cn("rounded-lg p-2.5", toneClasses[tone])}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        {(context || trend) && (
          <div className="flex min-h-5 items-center justify-between gap-3 text-xs text-muted-foreground">
            {context && <p className="truncate">{context}</p>}
            {trend && <div className="shrink-0">{trend}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
