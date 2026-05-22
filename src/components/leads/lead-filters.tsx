"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const filters = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Needs Reply", value: "needs_reply" },
  { label: "Interested", value: "interested" },
  { label: "Booked", value: "booked" },
  { label: "Completed", value: "completed" },
  { label: "Review Requested", value: "review_requested" },
  { label: "Lost", value: "lost" },
];

export function LeadFilters({ currentStatus }: { currentStatus: string }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
      {filters.map((filter) => (
        <Link key={filter.value} href={`/leads?status=${filter.value}`}>
          <Badge
            variant={currentStatus === filter.value ? "default" : "ghost"}
            className="h-7 cursor-pointer rounded-md px-3 text-xs"
          >
            {filter.label}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
