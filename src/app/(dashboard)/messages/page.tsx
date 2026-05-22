import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Mail, MessageSquare, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Message, MessageChannel, MessageDirection, MessageStatus } from "@/types/database";

type MessageLead = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type MessageRow = Pick<
  Message,
  | "id"
  | "lead_id"
  | "channel"
  | "direction"
  | "body"
  | "status"
  | "provider"
  | "sent_at"
  | "received_at"
  | "created_at"
> & {
  leads: MessageLead | MessageLead[] | null;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function formatError(message: string) {
  return isDevelopment() ? message : "Messages could not be loaded.";
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

function getLead(message: MessageRow) {
  return Array.isArray(message.leads) ? message.leads[0] ?? null : message.leads;
}

function getChannelLabel(channel: MessageChannel) {
  if (channel === "manual_note") return "Note";
  return channel.toUpperCase();
}

function getDirectionLabel(direction: MessageDirection) {
  if (direction === "outbound") return "Outbound";
  if (direction === "inbound") return "Inbound";
  return "Internal";
}

function getStatusLabel(status: MessageStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function MessagesPage() {
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

  const { data: messagesData, error: messagesError } = await supabase
    .from("messages")
    .select(
      "id, lead_id, channel, direction, body, status, provider, sent_at, received_at, created_at, leads(id, first_name, last_name)"
    )
    .eq("business_id", profile.business_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const messages = (messagesData ?? []) as unknown as MessageRow[];
  const outbound = messages.filter((message) => message.direction === "outbound").length;
  const inbound = messages.filter((message) => message.direction === "inbound").length;
  const failed = messages.filter((message) => message.status === "failed").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Conversation history"
        title="Messages"
        description="A focused record of SMS, email, and internal notes connected to your leads."
      />

      {messagesError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {formatError(messagesError.message)}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Total messages" value={messages.length} context="Latest 50 shown" icon={MessageSquare} />
        <MetricCard label="Outbound" value={outbound} context="Sent follow-ups and requests" icon={Send} />
        <MetricCard
          label="Inbound"
          value={inbound}
          context={failed > 0 ? `${failed} failed message${failed === 1 ? "" : "s"}` : "Customer replies"}
          icon={Mail}
          tone={failed > 0 ? "attention" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message log</CardTitle>
          <CardDescription>Delivery records stay attached to their lead for context.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {messages.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No messages yet"
              description="Messages will appear here as follow-ups, review requests, and notes are created."
            />
          ) : (
            <div className="divide-y divide-border/60">
              {messages.map((message) => {
                const lead = getLead(message);
                const leadName = lead
                  ? `${lead.first_name} ${lead.last_name ?? ""}`.trim()
                  : "Unknown lead";

                return (
                  <Link
                    key={message.id}
                    href={`/leads/${message.lead_id}`}
                    className="group block transition-colors hover:bg-muted/30"
                  >
                    <div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{leadName}</p>
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {getChannelLabel(message.channel)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getDirectionLabel(message.direction)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {message.body}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground md:text-right">
                        <p>{getStatusLabel(message.status)}</p>
                        <p className="mt-1">{message.provider || "manual"}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 md:justify-end">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(message.sent_at ?? message.received_at ?? message.created_at)}
                        </p>
                        <Button variant="ghost" size="icon-sm" className="opacity-70 group-hover:opacity-100">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
