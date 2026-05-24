import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  PauseCircle,
  PhoneMissed,
  Star,
  XCircle,
  Zap,
} from "lucide-react";

import {
  dismissAutomationAction,
  enableDailyAutomationSchedule,
  markAutomationActionReviewed,
  pauseAutomationSchedule,
  sendAutomationAction,
} from "@/app/actions/automations";
import { AutomationToggle } from "@/components/automations/automation-toggle";
import { Badge } from "@/components/ui/badge";
import { ChannelSelector } from "@/components/automations/channel-selector";
import { EditTemplateDialog } from "@/components/automations/edit-template-dialog";
import { ManualSendSubmitButton } from "@/components/reviews/manual-send-submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  listPendingAutomationActions,
  listRecentAutomationActions,
  type AutomationActionQueueItem,
} from "@/lib/automations/action-queue";
import { getAutomationActionSendPreflight } from "@/lib/automations/action-preflight";
import { ensureDefaultAutomations } from "@/lib/automations/ensure-defaults";
import {
  getAutomationRunHistory,
  type AutomationRunSummary,
} from "@/lib/automations/run-history";
import { getAutomationScheduleForBusiness } from "@/lib/automations/schedule";
import { getBusinessReadiness } from "@/lib/onboarding/readiness";
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

function formatActionStatus(status: AutomationActionQueueItem["status"]) {
  const labels: Record<AutomationActionQueueItem["status"], string> = {
    pending_review: "Pending review",
    reviewed: "Reviewed",
    dismissed: "Dismissed",
    approved_pending_send: "Approved later",
    sent: "Sent",
    send_failed: "Send failed",
    blocked: "Blocked",
  };

  return labels[status];
}

function getActionTone(status: AutomationActionQueueItem["status"]) {
  if (status === "sent") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "send_failed" || status === "blocked") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "dismissed") return "border-border/70 bg-muted/40 text-muted-foreground";
  return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function formatChannel(channel: AutomationActionQueueItem["channel"]) {
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  return "Manual review";
}

function formatSendStatus(action: AutomationActionQueueItem) {
  if (action.send_status === "skipped") return "Delivery skipped";
  if (action.send_status === "sent") return "Provider sent";
  if (action.send_status === "failed") return "Delivery failed";
  if (action.send_status === "blocked") return "Send blocked";
  return null;
}

function formatFrequency(frequency: string) {
  if (frequency === "daily") return "Daily";
  if (frequency === "weekly") return "Weekly";
  return "Manual only";
}

function formatScheduleStatus(status: string | null) {
  if (!status) return "Not recorded";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "no_enabled_automations") return "No enabled automations";
  if (status === "no_eligible_businesses") return "No eligible businesses";
  return status;
}

function isPotentiallySendable(action: AutomationActionQueueItem) {
  return (
    action.status === "pending_review" &&
    Boolean(action.leadId) &&
    (action.channel === "sms" || action.channel === "email")
  );
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
  const [
    runHistory,
    scheduleResult,
    readiness,
    pendingActionsResult,
    recentActionsResult,
  ] = await Promise.all([
    getAutomationRunHistory(supabase, profile.business_id),
    getAutomationScheduleForBusiness(supabase, profile.business_id),
    getBusinessReadiness(supabase, profile.business_id),
    listPendingAutomationActions(supabase, profile.business_id),
    listRecentAutomationActions(supabase, profile.business_id),
  ]);

  const items = (automations ?? []) as Automation[];
  const schedule = scheduleResult.schedule;
  const pendingActions = pendingActionsResult.actions;
  const recentActions = recentActionsResult.actions.filter(
    (action) => action.status !== "pending_review"
  );
  const preflightEntries = await Promise.all(
    pendingActions
      .filter(isPotentiallySendable)
      .map(async (action) => {
        const preflight = await getAutomationActionSendPreflight(
          supabase,
          profile.business_id,
          action.id
        );

        return [action.id, preflight] as const;
      })
  );
  const preflightByActionId = new Map(preflightEntries);
  const activeCount = items.filter((automation) => automation.enabled).length;
  const pausedCount = items.length - activeCount;
  const totalTriggers = items.reduce((sum, automation) => sum + automation.trigger_count, 0);
  const pageError =
    (defaultsResult.success ? null : defaultsResult.error) ??
    automationsError?.message ??
    runHistory.error ??
    scheduleResult.error ??
    (readiness.errors.length > 0 ? readiness.errors[0] : null) ??
    pendingActionsResult.error ??
    recentActionsResult.error ??
    null;

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

      {readiness.overall.status !== "ready" && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-medium text-foreground">
                Setup is {readiness.overall.score}/{readiness.overall.total} complete
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Automations can create pending actions, but sending may be blocked until setup is complete.
                {readiness.overall.criticalMissing.length > 0
                  ? ` Missing: ${readiness.overall.criticalMissing.slice(0, 3).join(", ")}.`
                  : ""}
              </p>
            </div>
            <Link href="/setup" className={buttonVariants({ variant: "outline" })}>
              Open setup
              <ArrowRight className="h-4 w-4" />
            </Link>
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

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Scheduled automation readiness</CardTitle>
              <CardDescription>
                Cron checks can create pending actions for this business. Provider sends still
                require manual approval.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={
                schedule.scheduleMode === "scheduled"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border/70 bg-background text-muted-foreground"
              }
            >
              {schedule.scheduleMode === "scheduled" ? "Scheduled" : "Manual only"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {scheduleResult.error ? (
            <div className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{formatError(scheduleResult.error)}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Mode", schedule.scheduleMode === "scheduled" ? "Scheduled" : "Manual only"],
                  ["Frequency", formatFrequency(schedule.frequency)],
                  ["Timezone", schedule.timezone],
                  ["Last run", formatDateTime(schedule.lastRunAt)],
                  ["Next run", formatDateTime(schedule.nextRunAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border/60 p-3">
                    <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Last scheduler status: {formatScheduleStatus(schedule.lastStatus)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    The scheduler endpoint is server-only. It creates pending queue actions,
                    never customer communications.
                  </p>
                  {schedule.lastError && (
                    <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      {schedule.lastError}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {schedule.scheduleMode === "scheduled" ? (
                    <form action={pauseAutomationSchedule}>
                      <Button type="submit" size="sm" variant="outline">
                        <PauseCircle className="h-3.5 w-3.5" />
                        Pause schedule
                      </Button>
                    </form>
                  ) : (
                    <form action={enableDailyAutomationSchedule}>
                      <Button type="submit" size="sm" variant="outline">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Enable daily checks
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                There is no browser trigger here and the protected runner cannot deliver
                through providers.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Pending automation actions</CardTitle>
              <CardDescription>
                Confirmed runs create reviewable actions here. Sending is manual,
                one action at a time.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-border/70 bg-background text-muted-foreground">
              {pendingActions.length} pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {pendingActionsResult.error ? (
            <div className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{formatError(pendingActionsResult.error)}</p>
            </div>
          ) : pendingActions.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No pending automation actions"
              description="Confirmed automation runs will create reviewable actions here when eligible leads are found."
              className="py-10"
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pendingActions.map((action) => (
                <div
                  key={action.id}
                  className="rounded-lg border border-border/60 bg-background/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{action.title}</p>
                        <Badge variant="outline" className={getActionTone(action.status)}>
                          {formatActionStatus(action.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {action.reason}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-border/70 bg-muted/40 text-muted-foreground">
                      {formatChannel(action.channel)}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                    <div className="rounded-lg border border-border/60 p-3">
                      {action.leadId ? (
                        <Link
                          href={`/leads/${action.leadId}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {action.leadLabel ?? "Open lead"}
                        </Link>
                      ) : (
                        <p className="font-medium text-foreground">No lead linked</p>
                      )}
                      <p className="mt-1">
                        {action.leadStatus ?? "Unknown status"}
                        {action.leadSource ? ` from ${action.leadSource}` : ""}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 p-3">
                      <p className="font-medium text-foreground">
                        {formatRelative(action.created_at)}
                      </p>
                      <p className="mt-1">Created for review</p>
                    </div>
                  </div>

                  {action.summary && (
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {action.summary}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-border/70 bg-background">
                      {action.reason_code?.replaceAll("_", " ") ?? action.action_type}
                    </Badge>
                    <Badge variant="outline" className="border-border/70 bg-background">
                      Manual approval required
                    </Badge>
                  </div>

                  {action.suggested_message && (
                    <div className="mt-4 rounded-lg border border-border/70 bg-muted/30 p-3">
                      <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Suggested message
                      </p>
                      <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">
                        {action.suggested_message}
                      </p>
                    </div>
                  )}

                  {!isPotentiallySendable(action) && (
                    <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm leading-6 text-amber-700 dark:text-amber-300">
                      This action needs a linked lead and SMS or email channel before it can be sent.
                    </div>
                  )}

                  {preflightByActionId.get(action.id) && (
                    <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {preflightByActionId.get(action.id)?.confirmationTitle}
                        </p>
                        <Badge variant="outline" className="border-border/70 bg-background">
                          {preflightByActionId.get(action.id)?.mode}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {preflightByActionId.get(action.id)?.confirmationBody}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Destination: {preflightByActionId.get(action.id)?.destinationSummary}
                      </p>
                      {preflightByActionId.get(action.id)?.blockingIssues.length ? (
                        <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                          {preflightByActionId.get(action.id)?.blockingIssues[0]}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {preflightByActionId.get(action.id)?.nextOperatorAction}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-full truncate text-xs text-muted-foreground">
                      Dedupe protected: {action.dedupe_key}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {isPotentiallySendable(action) && (
                        <form action={sendAutomationAction.bind(null, action.id)}>
                          <ManualSendSubmitButton
                            mode={preflightByActionId.get(action.id)?.mode ?? null}
                            label={
                              preflightByActionId.get(action.id)?.mode === "live"
                                ? "Approve & send live"
                                : preflightByActionId.get(action.id)?.submitLabel ??
                                  "Approve & send manually"
                            }
                            confirmationTitle={
                              preflightByActionId.get(action.id)?.confirmationTitle ??
                              "Approve automation action?"
                            }
                            confirmationBody={
                              preflightByActionId.get(action.id)?.confirmationBody ??
                              "This will process one automation action."
                            }
                          />
                        </form>
                      )}
                      <form action={markAutomationActionReviewed.bind(null, action.id)}>
                        <Button type="submit" size="sm" variant="outline">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mark reviewed
                        </Button>
                      </form>
                      <form action={dismissAutomationAction.bind(null, action.id)}>
                        <Button type="submit" size="sm" variant="ghost">
                          <XCircle className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {recentActions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Recent automation actions
              </p>
              <div className="overflow-hidden rounded-lg border border-border/60">
                {recentActions.slice(0, 5).map((action) => (
                  <div
                    key={action.id}
                    className="grid gap-3 border-b border-border/60 p-3 text-sm last:border-b-0 md:grid-cols-[1.2fr_0.8fr_0.7fr_1fr]"
                  >
                    <div>
                      <p className="font-medium text-foreground">{action.title}</p>
                      {action.leadId ? (
                        <Link
                          href={`/leads/${action.leadId}`}
                          className="mt-1 inline-flex text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {action.leadLabel ?? "Open lead"}
                        </Link>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">No lead linked</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">{formatActionStatus(action.status)}</p>
                      {formatSendStatus(action) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatSendStatus(action)}
                        </p>
                      )}
                      {action.send_error && (
                        <p className="mt-1 line-clamp-2 text-xs text-amber-700 dark:text-amber-300">
                          {action.send_error}
                        </p>
                      )}
                    </div>
                    <p className="text-muted-foreground">{formatChannel(action.channel)}</p>
                    <p className="text-muted-foreground">{formatRelative(action.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            Reviewing or dismissing an action only updates this queue. Approve & send
            processes one action through the existing provider-safe path; there is no send-all
            control and no cron-based provider delivery.
          </p>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Zap}
            title="No automations yet"
            description="Default automations are created automatically when this page loads. If this stays empty, check the database error above."
            action={
              <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
                Review setup
              </Link>
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
