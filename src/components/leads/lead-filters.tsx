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
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <Link key={filter.value} href={`/leads?status=${filter.value}`}>
          <Badge
            variant={currentStatus === filter.value ? "default" : "secondary"}
            className="cursor-pointer px-3 py-1 text-sm"
          >
            {filter.label}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
