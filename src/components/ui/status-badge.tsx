import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LeadStatus, ReviewRequestStatus } from "@/types/database";

type SupportedStatus = LeadStatus | ReviewRequestStatus | "enabled" | "paused";

const labels: Record<SupportedStatus, string> = {
  new: "New",
  contacted: "Contacted",
  needs_reply: "Needs reply",
  interested: "Interested",
  booked: "Booked",
  completed: "Completed",
  review_requested: "Review requested",
  lost: "Lost",
  pending: "Pending",
  sent: "Sent",
  clicked: "Clicked",
  failed: "Failed",
  blocked: "Blocked",
  duplicate_prevented: "Duplicate prevented",
  canceled: "Canceled",
  enabled: "Enabled",
  paused: "Paused",
};

const dotClasses: Record<SupportedStatus, string> = {
  new: "bg-sky-500",
  contacted: "bg-amber-500",
  needs_reply: "bg-orange-500",
  interested: "bg-violet-500",
  booked: "bg-emerald-500",
  completed: "bg-emerald-600",
  review_requested: "bg-indigo-500",
  lost: "bg-muted-foreground",
  pending: "bg-amber-500",
  sent: "bg-sky-500",
  clicked: "bg-emerald-500",
  failed: "bg-destructive",
  blocked: "bg-amber-500",
  duplicate_prevented: "bg-amber-500",
  canceled: "bg-muted-foreground",
  enabled: "bg-emerald-500",
  paused: "bg-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: SupportedStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-border/70 bg-background px-2.5 text-muted-foreground",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[status])} />
      {labels[status]}
    </Badge>
  );
}
