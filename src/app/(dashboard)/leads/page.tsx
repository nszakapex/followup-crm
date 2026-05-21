import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ArrowRight } from "lucide-react";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import type { Lead, LeadStatus } from "@/types/database";
import { LeadFilters } from "@/components/leads/lead-filters";

const statusColors: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  needs_reply: "bg-orange-100 text-orange-800",
  interested: "bg-purple-100 text-purple-800",
  booked: "bg-green-100 text-green-800",
  completed: "bg-emerald-100 text-emerald-800",
  review_requested: "bg-indigo-100 text-indigo-800",
  lost: "bg-gray-100 text-gray-600",
};

const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  needs_reply: "Needs Reply",
  interested: "Interested",
  booked: "Booked",
  completed: "Completed",
  review_requested: "Review Requested",
  lost: "Lost",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function LeadsPage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  let query = supabase
    .from("leads")
    .select("*")
    .eq("business_id", profile.business_id)
    .order("created_at", { ascending: false });

  if (searchParams.status && searchParams.status !== "all") {
    query = query.eq("status", searchParams.status);
  }

  const { data: leads } = await query;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1">
            All your potential customers in one place.
          </p>
        </div>
        <AddLeadDialog />
      </div>

      {/* Filters */}
      <LeadFilters currentStatus={searchParams.status || "all"} />

      {/* Leads list */}
      {!leads || leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-muted-foreground">No leads yet</h3>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
              Leads will appear here as they come in from your website, forms, or webhook
              connections. You can also add them manually.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead: Lead) => (
            <Link key={lead.id} href={`/leads/${lead.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {lead.first_name} {lead.last_name || ""}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {lead.source && (
                          <span className="text-xs text-muted-foreground">
                            via {lead.source}
                          </span>
                        )}
                        {lead.phone && (
                          <span className="text-xs text-muted-foreground">
                            {lead.phone}
                          </span>
                        )}
                        {lead.email && !lead.phone && (
                          <span className="text-xs text-muted-foreground truncate">
                            {lead.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(lead.created_at)}
                      </p>
                      {lead.next_followup_at && (
                        <p className="text-xs text-muted-foreground">
                          Follow-up: {formatDate(lead.next_followup_at)}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${statusColors[lead.status]}`}
                    >
                      {statusLabels[lead.status]}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
