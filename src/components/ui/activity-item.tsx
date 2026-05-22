import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

import { cn } from "@/lib/utils";

export function ActivityItem({
  icon: Icon,
  title,
  description,
  meta,
  action,
  className,
}: {
  icon?: ComponentType<LucideProps>;
  title: string;
  description?: string;
  meta?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-transparent p-3 transition-colors hover:border-border/70 hover:bg-muted/30",
        className
      )}
    >
      {Icon && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        </div>
        {description && (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
