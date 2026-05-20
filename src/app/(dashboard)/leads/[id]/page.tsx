import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Phone, Mail, Globe, Calendar, ExternalLink } from "lucide-react";
import { LeadStatusActions } from "@/components/leads/lead-status-actions";
import { AddNoteForm } from "@/components/leads/add-note-form";
import type { LeadStatus, Message } from "@/types/database";

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
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load lead
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (!lead) notFound();

  // Load messages for this lead
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lead.first_name} {lead.last_name || ""}
          </h1>
          {lead.source && (
            <p className="text-muted-foreground mt-1">via {lead.source}</p>
          )}
        </div>
        <Badge
          variant="secondary"
          className={`text-sm ${statusColors[lead.status as LeadStatus]}`}
        >
          {statusLabels[lead.status as LeadStatus]}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Summary */}
          {lead.ai_summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {lead.ai_summary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {lead.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {lead.notes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Message History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {messages && messages.length > 0 ? (
                <div className="space-y-3">
                  {messages.map((msg: Message) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg p-3 text-sm ${
                        msg.direction === "outbound"
                          ? "bg-primary/5 ml-8"
                          : msg.direction === "internal"
                          ? "bg-muted/50 border border-dashed border-border"
                          : "bg-muted mr-8"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-muted-foreground capitalize">
                          {msg.direction === "internal" ? "Note" : msg.direction} &middot; {msg.channel}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(msg.sent_at || msg.received_at || msg.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No messages yet. Messages will appear here as they are sent and received.
                </p>
              )}
              <Separator />
              <AddNoteForm leadId={id} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadStatusActions leadId={id} currentStatus={lead.status as LeadStatus} />
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${lead.phone}`} className="hover:underline">
                    {lead.phone}
                  </a>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.email}`} className="hover:underline truncate">
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.source && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.source}</span>
                </div>
              )}
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDate(lead.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last contacted</span>
                  <span>{formatDate(lead.last_contacted_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next follow-up</span>
                  <span>{formatDate(lead.next_followup_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Follow-ups sent</span>
                  <span>{lead.followup_count}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* External CRM */}
          {(lead.external_crm_name || lead.external_crm_id) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">External CRM</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {lead.external_crm_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CRM</span>
                    <span>{lead.external_crm_name}</span>
                  </div>
                )}
                {lead.external_crm_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">External ID</span>
                    <span className="font-mono text-xs">{lead.external_crm_id}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sync status</span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {lead.sync_status.replace("_", " ")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
