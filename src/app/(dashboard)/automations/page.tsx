import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock,
  PhoneMissed,
  Star,
  Zap,
} from "lucide-react";

import { AutomationToggle } from "@/components/automations/automation-toggle";
import { Badge } from "@/components/ui/badge";
import { ChannelSelector } from "@/components/automations/channel-selector";
import { EditTemplateDialog } from "@/components/automations/edit-template-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ensureDefaultAutomations } from "@/lib/automations/ensure-defaults";
import {
  getAutomationRunHistory,
  type AutomationRunSummary,
} from "@/lib/automations/run-history";
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

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "Never";

  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStat(value: number | null) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "Not recorded";
}

function formatDuration(value: number | null) {
  if (typeof value !== "number") return "Not recorded";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function getRunTitle(run: AutomationRunSummary) {
  if (run.status === "never_run") return "No automation runs recorded";
  if (run.status === "failed") return "Last run failed";
  if (run.requestMode === "confirmed") return "Last confirmed run completed";
  return "Last dry-run completed";
}

function getRunTone(run: AutomationRunSummary) {
  if (run.status === "failed" || (run.failures ?? 0) > 0) return "warning";
  if (run.status === "never_run") return "neutral";
  return "good";
}

const runToneClasses = {
  good: "border-emerald-500/20 bg-emerald-500/5",
  warning: "border-amber-500/25 bg-amber-500/5",
  neutral: "border-border/60 bg-card/95",
};

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
  const runHistory = await getAutomationRunHistory(supabase, profile.business_id);

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

      <Card className={runToneClasses[getRunTone(runHistory.latest)]}>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Automation run status</CardTitle>
              <CardDescription>
                Protected runner history for this business. Provider sends remain blocked.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-border/70 bg-background text-muted-foreground">
              Cron ready
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {runHistory.error ? (
            <div className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{formatError(runHistory.error)}</p>
            </div>
          ) : runHistory.latest.status === "never_run" ? (
            <EmptyState
              icon={Clock}
              title="No automation runs have been recorded yet"
              description="Run history appears after the protected automation API completes a dry-run or confirmed internal run."
              className="py-8"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border/60 bg-background/70 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{getRunTitle(runHistory.latest)}</p>
                    {runHistory.latest.status === "failed" || (runHistory.latest.failures ?? 0) > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Review
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      >
                        Complete
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Last run {formatRelative(runHistory.latest.lastRunAt)} at{" "}
                    {formatDateTime(runHistory.latest.lastRunAt)}.
                  </p>
                  {runHistory.latest.error && (
                    <p className="mt-2 text-sm leading-6 text-amber-700 dark:text-amber-300">
                      {runHistory.latest.error}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="border-border/70 bg-background">
                    {runHistory.latest.requestMode === "confirmed" ? "Confirmed" : "Dry-run"}
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-background">
                    Provider sends blocked
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Evaluated", formatStat(runHistory.latest.evaluated)],
                  ["Eligible", formatStat(runHistory.latest.eligible)],
                  ["Actions", formatStat(runHistory.latest.actionsCreated)],
                  ["Duplicates", formatStat(runHistory.latest.duplicatesPrevented)],
                  ["Failures", formatStat(runHistory.latest.failures)],
                  ["Duration", formatDuration(runHistory.latest.durationMs)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border/60 p-3">
                    <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-medium tabular-nums text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {runHistory.recentRuns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Recent automation runs
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    {runHistory.recentRuns.map((run) => (
                      <div
                        key={run.id ?? run.lastRunAt ?? "automation-run"}
                        className="grid gap-3 border-b border-border/60 p-3 text-sm last:border-b-0 md:grid-cols-7"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {formatDateTime(run.lastRunAt)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {run.status === "failed" ? "Failed" : "Completed"}
                          </p>
                        </div>
                        <p className="text-muted-foreground">
                          {run.requestMode === "confirmed" ? "Confirmed" : "Dry-run"}
                        </p>
                        <p className="tabular-nums">{formatStat(run.evaluated)}</p>
                        <p className="tabular-nums">{formatStat(run.eligible)}</p>
                        <p className="tabular-nums">{formatStat(run.actionsCreated)}</p>
                        <p className="tabular-nums">{formatStat(run.duplicatesPrevented)}</p>
                        <p className="tabular-nums">{formatStat(run.failures)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs leading-5 text-muted-foreground">
                A production scheduler can call the protected API from a server environment.
                There is no browser trigger here and no live provider delivery in this phase.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Zap}
            title="No automations yet"
            description="Default automations are created automatically when this page loads. If this stays empty, check the database error above."
            action={
              <Button variant="outline" render={<Link href="/settings" />}>
                Review setup
              </Button>
            }
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
