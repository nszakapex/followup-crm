import { redirect } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Clock,
  PhoneMissed,
  Star,
  Zap,
} from "lucide-react";

import { AutomationToggle } from "@/components/automations/automation-toggle";
import { ChannelSelector } from "@/components/automations/channel-selector";
import { EditTemplateDialog } from "@/components/automations/edit-template-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ensureDefaultAutomations } from "@/lib/automations/ensure-defaults";
import { createClient } from "@/lib/supabase/server";
import type { Automation, AutomationType, MessageChannel } from "@/types/database";

const typeIcons: Record<AutomationType, typeof Zap> = {
  instant_lead_reply: Zap,
  twenty_four_hour_followup: Clock,
  three_day_followup: CalendarDays,
  missed_call_textback: PhoneMissed,
  review_request: Star,
  weekly_owner_summary: BarChart3,
};

const typeDescriptions: Record<AutomationType, string> = {
  instant_lead_reply:
    "Acknowledges new leads immediately so they know the business saw them.",
  twenty_four_hour_followup:
    "Follows up after a day when a lead has not moved forward.",
  three_day_followup:
    "Closes the loop with one final, polite check-in.",
  missed_call_textback:
    "Responds to missed calls with a simple text-back.",
  review_request:
    "Requests an honest Google review after a completed job or appointment.",
  weekly_owner_summary:
    "Summarizes lead activity and review movement for the owner.",
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function formatError(message: string) {
  return isDevelopment() ? message : "Automations could not be loaded.";
}

function formatRelative(dateStr: string | null) {
  if (!dateStr) return "Not yet";
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

export default async function AutomationsPage() {
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

  const defaultsResult = await ensureDefaultAutomations(supabase, profile.business_id);

  const { data: automations, error: automationsError } = await supabase
    .from("automations")
    .select("*")
    .eq("business_id", profile.business_id)
    .order("created_at", { ascending: true });

  const items = (automations ?? []) as Automation[];
  const activeCount = items.filter((automation) => automation.enabled).length;
  const pausedCount = items.length - activeCount;
  const totalTriggers = items.reduce((sum, automation) => sum + automation.trigger_count, 0);
  const pageError =
    (defaultsResult.success ? null : defaultsResult.error) ?? automationsError?.message ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operating system"
        title="Automations"
        description="Simple follow-up systems with clear on/off states. No workflow builder, no clutter."
      />

      {pageError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{formatError(pageError)}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Active"
          value={activeCount}
          context={`${pausedCount} paused`}
          icon={Zap}
          tone={activeCount > 0 ? "good" : "attention"}
        />
        <MetricCard
          label="Available"
          value={items.length}
          context="Default follow-up systems"
          icon={BarChart3}
        />
        <MetricCard
          label="Triggered"
          value={totalTriggers}
          context="Recorded automation runs"
          icon={Clock}
        />
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Zap}
            title="No automations yet"
            description="Default automations are created automatically when this page loads. If this stays empty, check the database error above."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((auto) => {
            const Icon = typeIcons[auto.type] ?? Zap;
            const description = typeDescriptions[auto.type] ?? "";
            const lastTriggered = formatRelative(auto.last_triggered_at);

            return (
              <Card key={auto.id} className="transition-colors hover:border-foreground/15">
                <CardHeader className="gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base">{auto.name}</CardTitle>
                          <StatusBadge status={auto.enabled ? "enabled" : "paused"} />
                        </div>
                        <CardDescription className="mt-2 leading-6">
                          {description}
                        </CardDescription>
                      </div>
                    </div>
                    <AutomationToggle automationId={auto.id} enabled={auto.enabled} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <ChannelSelector
                      automationId={auto.id}
                      currentChannel={auto.channel as MessageChannel}
                    />
                    <EditTemplateDialog
                      automationId={auto.id}
                      automationName={auto.name}
                      currentTemplate={auto.message_template}
                    />
                  </div>

                  {auto.message_template ? (
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {auto.message_template}
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                      No customer-facing message is needed for this automation yet.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div className="rounded-lg border border-border/60 p-3">
                      <p className="font-medium text-foreground">{auto.trigger_count}</p>
                      <p className="mt-1">Recorded triggers</p>
                    </div>
                    <div className="rounded-lg border border-border/60 p-3">
                      <p className="font-medium text-foreground">{lastTriggered}</p>
                      <p className="mt-1">Last triggered</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
