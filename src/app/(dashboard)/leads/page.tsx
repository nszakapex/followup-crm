import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock, Mail, Phone, Users } from "lucide-react";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { LeadFilters } from "@/components/leads/lead-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import type { Lead, LeadStatus } from "@/types/database";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function formatError(message: string) {
  return isDevelopment() ? message : "Leads could not be loaded.";
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
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
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) redirect("/login");

  let query = supabase
    .from("leads")
    .select("*")
    .eq("business_id", profile.business_id)
    .order("created_at", { ascending: false });

  if (searchParams.status && searchParams.status !== "all") {
    query = query.eq("status", searchParams.status);
  }

  const [
    { data: leadsData, error: leadsError },
    { data: allLeadsData, error: allLeadsError },
  ] = await Promise.all([
    query,
    supabase
      .from("leads")
      .select("id, status, created_at, next_followup_at")
      .eq("business_id", profile.business_id),
  ]);

  const leads = (leadsData ?? []) as Lead[];
  const allLeads = (allLeadsData ?? []) as Pick<
    Lead,
    "id" | "status" | "created_at" | "next_followup_at"
  >[];
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);

  const needsReply = allLeads.filter((lead) => lead.status === "needs_reply").length;
  const newThisWeek = allLeads.filter(
    (lead) => new Date(lead.created_at) >= weekStart
  ).length;
  const bookedOrCompleted = allLeads.filter((lead) =>
    ["booked", "completed", "review_requested"].includes(lead.status)
  ).length;
  const upcomingFollowups = allLeads.filter(
    (lead) => lead.next_followup_at && new Date(lead.next_followup_at) >= new Date()
  ).length;
  const pageError = leadsError?.message ?? allLeadsError?.message ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        description="A clean view of every opportunity, where it stands, and what needs attention next."
        actions={<AddLeadDialog />}
      />

      {pageError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {formatError(pageError)}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total leads" value={allLeads.length} context="All time" icon={Users} />
        <MetricCard
          label="New this week"
          value={newThisWeek}
          context="Created in the last 7 days"
          icon={Clock}
          tone={newThisWeek > 0 ? "good" : "neutral"}
        />
        <MetricCard
          label="Needs reply"
          value={needsReply}
          context="Waiting for your response"
          icon={Mail}
          tone={needsReply > 0 ? "attention" : "neutral"}
        />
        <MetricCard
          label="Progressed"
          value={bookedOrCompleted}
          context={`${upcomingFollowups} future follow-up${upcomingFollowups === 1 ? "" : "s"}`}
          icon={ArrowRight}
        />
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Lead pipeline</CardTitle>
            <CardDescription>Filter by status without losing the operational context.</CardDescription>
          </div>
          <LeadFilters currentStatus={searchParams.status || "all"} />
        </CardHeader>
        <CardContent className="p-0">
          {leads.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No leads in this view"
              description="New leads will appear here as they come in from forms, webhooks, or manual entry."
              action={<AddLeadDialog />}
            />
          ) : (
            <div className="divide-y divide-border/60">
              {leads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="group block transition-colors hover:bg-muted/30"
                >
                  <div className="grid gap-4 px-5 py-4 md:grid-cols-[1.1fr_0.8fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {lead.first_name} {lead.last_name || ""}
                        </p>
                        <StatusBadge status={lead.status as LeadStatus} />
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {lead.notes || lead.ai_summary || lead.source || "No notes yet"}
                      </p>
                    </div>

                    <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 md:block">
                      <div className="flex min-w-0 items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lead.phone || "No phone"}</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-2 md:mt-1">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lead.email || "No email"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:justify-end">
                      <div className="text-xs text-muted-foreground md:text-right">
                        <p>Created {formatDate(lead.created_at)}</p>
                        {lead.next_followup_at && (
                          <p className="mt-1">Follow-up {formatDate(lead.next_followup_at)}</p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon-sm" className="opacity-70 group-hover:opacity-100">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
