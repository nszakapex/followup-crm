import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, MessageSquare, Zap, Star, ArrowRight } from "lucide-react";
import type { Lead, LeadStatus } from "@/types/database";

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

function formatRelative(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("business_id, name")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  const businessId = profile.business_id;

  // Get counts in parallel
  const [newLeadsRes, needsReplyRes, followupsSentRes, reviewRequestsRes, attentionRes] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "new"),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "needs_reply"),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("direction", "outbound")
        .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase
        .from("review_requests")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase
        .from("leads")
        .select("*")
        .eq("business_id", businessId)
        .in("status", ["new", "needs_reply", "interested"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const stats = [
    {
      name: "New Leads",
      value: newLeadsRes.count ?? 0,
      icon: Users,
      description: "Waiting for first contact",
    },
    {
      name: "Needs Reply",
      value: needsReplyRes.count ?? 0,
      icon: MessageSquare,
      description: "Leads who responded",
    },
    {
      name: "Follow-Ups Sent",
      value: followupsSentRes.count ?? 0,
      icon: Zap,
      description: "This month",
    },
    {
      name: "Review Requests",
      value: reviewRequestsRes.count ?? 0,
      icon: Star,
      description: "Sent this month",
    },
  ];

  const attentionLeads = (attentionRes.data ?? []) as Lead[];

  function getSuggestedAction(lead: Lead): string {
    if (lead.status === "new") {
      return "Send an initial reply to introduce yourself and ask how you can help.";
    }
    if (lead.status === "needs_reply") {
      return "This lead responded — read their message and reply.";
    }
    if (lead.status === "interested") {
      return "They're interested — follow up to confirm details or book.";
    }
    return "Review and take action.";
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening with your leads today.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.name}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Needs Attention */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Needs Attention</h2>
        {attentionLeads.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-muted-foreground">All caught up</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                No leads need attention right now. When new leads come in or someone
                responds, they&apos;ll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {attentionLeads.map((lead) => (
              <Card key={lead.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">
                          {lead.first_name} {lead.last_name || ""}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {statusLabels[lead.status]}
                        </Badge>
                        {lead.source && (
                          <span className="text-xs text-muted-foreground">
                            via {lead.source}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(lead.created_at)}
                        </span>
                      </div>
                      {lead.ai_summary ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {lead.ai_summary}
                        </p>
                      ) : lead.notes ? (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                          {lead.notes}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {lead.phone || lead.email || "No contact info yet"}
                        </p>
                      )}
                      <p className="text-xs text-primary mt-2">
                        {getSuggestedAction(lead)}
                      </p>
                    </div>
                    <Link href={`/leads/${lead.id}`}>
                      <Button variant="outline" size="sm">
                        View
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
