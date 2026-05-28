import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  ShieldAlert,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";

import {
  dismissAutomationAction,
  markAutomationActionReviewed,
  sendAutomationAction,
} from "@/app/actions/automations";
import { AddNoteForm } from "@/components/leads/add-note-form";
import { LeadStatusActions } from "@/components/leads/lead-status-actions";
import { ManualSendSubmitButton } from "@/components/reviews/manual-send-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAutomationActionSendPreflight } from "@/lib/automations/action-preflight";
import { getLeadDetail, type ContactTimelineItem } from "@/lib/crm/contact-detail";
import {
  getReviewRequestLifecycle,
  getReviewRequestRetryEligibility,
  getSafeReviewRequestDestination,
} from "@/lib/reviews/lifecycle";
import { createClient } from "@/lib/supabase/server";
import type { AutomationActionRecord, LeadStatus, Message, ReviewRequest } from "@/types/database";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function formatError(message: string) {
  return isDevelopment() ? message : "Lead details could not be loaded.";
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Not recorded";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(dateStr: string | null) {
  if (!dateStr) return "Not recorded";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatChannel(channel: string | null) {
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  if (channel === "manual_note") return "Note";
  return "Manual";
}

function formatAutomationStatus(status: AutomationActionRecord["status"]) {
  const labels: Record<AutomationActionRecord["status"], string> = {
    pending_review: "Pending review",
    reviewed: "Reviewed",
    dismissed: "Dismissed",
    approved_pending_send: "Approved",
    sent: "Sent",
    send_failed: "Send failed",
    blocked: "Blocked",
  };

  return labels[status];
}

function getAutomationTone(status: AutomationActionRecord["status"]) {
  if (status === "sent" || status === "reviewed") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (status === "send_failed" || status === "blocked") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  if (status === "dismissed") return "border-border/70 bg-muted/40 text-muted-foreground";

  return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function getTimelineTone(status: ContactTimelineItem["status"]) {
  if (status === "success") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (status === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  if (status === "error") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }

  return "border-border/70 bg-muted/40 text-muted-foreground";
}

function getReviewLifecycleTone(request: ReviewRequest) {
  const lifecycle = getReviewRequestLifecycle(request);

  if (lifecycle.attentionLevel === "success") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (lifecycle.attentionLevel === "danger") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }

  if (lifecycle.attentionLevel === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-border/70 bg-muted/40 text-muted-foreground";
}

function getMessageStatusLabel(message: Message) {
  if (message.provider === "test_mode") return "Skipped/Test";
  if (message.status === "failed") return "Failed";
  if (message.direction === "internal") return "Internal note";
  return message.status.charAt(0).toUpperCase() + message.status.slice(1);
}

function isPotentiallySendable(action: AutomationActionRecord) {
  return (
    action.status === "pending_review" &&
    Boolean(action.lead_id) &&
    (action.channel === "sms" || action.channel === "email")
  );
}

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  if (!isUuid(id)) notFound();

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

  const result = await getLeadDetail(supabase, profile.business_id, id);

  if (result.notFound) notFound();

  if (!result.detail || !result.lead) {
    return (
      <div className="space-y-6">
        <Link href="/leads" className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Link>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{formatError(result.errors[0] ?? "Lead details could not be loaded.")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { lead, detail, timeline, pendingAutomationActions, automationActions, reviewRequests, messages } =
    result;
  const lastReviewStatus = detail.reviewStatus.lastReviewRequestStatus;
  const lastSendStatus = detail.sendStatus.lastSendStatus;
  const latestReviewLifecycle = reviewRequests[0]
    ? getReviewRequestLifecycle(reviewRequests[0])
    : null;
  const latestInboundSms = messages.find(
    (message) => message.direction === "inbound" && message.channel === "sms"
  );
  const pendingPreflightEntries = await Promise.all(
    pendingAutomationActions
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
  const preflightByActionId = new Map(pendingPreflightEntries);

  return (
    <div className="space-y-8">
      <Link href="/leads" className={buttonVariants({ variant: "ghost" })}>
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      <PageHeader
        eyebrow="Contact record"
        title={detail.name}
        description="A complete view of profile details, review requests, automation actions, messages, and the next best step."
        actions={<StatusBadge status={detail.status as LeadStatus} />}
      />

      {result.errors.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{formatError(result.errors[0])}</p>
          </CardContent>
        </Card>
      )}

      {latestInboundSms && (
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 gap-3">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Customer replied by SMS
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-amber-700 dark:text-amber-300">
                  {latestInboundSms.body}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-amber-500/25 bg-background/80">
              {lead.status === "needs_reply" ? "Needs response" : "Inbound reply"}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Review requests"
          value={detail.reviewStatus.reviewRequestCount}
          context={
            latestReviewLifecycle
              ? `Last status: ${latestReviewLifecycle.label}`
              : lastReviewStatus
                ? `Last status: ${lastReviewStatus.replaceAll("_", " ")}`
              : "None sent yet"
          }
          icon={Star}
          tone={detail.reviewStatus.reviewRequestCount > 0 ? "good" : "neutral"}
        />
        <MetricCard
          label="Pending actions"
          value={detail.automationStatus.pendingActionCount}
          context="Automation queue items"
          icon={Sparkles}
          tone={detail.automationStatus.pendingActionCount > 0 ? "attention" : "neutral"}
        />
        <MetricCard
          label="Failed sends"
          value={detail.sendStatus.failedSendCount}
          context={lastSendStatus ? `Last send: ${lastSendStatus}` : "No failed sends"}
          icon={ShieldAlert}
          tone={detail.sendStatus.failedSendCount > 0 ? "attention" : "neutral"}
        />
        <MetricCard
          label="Last activity"
          value={detail.lastActivityAt ? formatShortDate(detail.lastActivityAt) : "None"}
          context="Messages, reviews, or actions"
          icon={Clock}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Next best action</CardTitle>
                <CardDescription>{detail.nextBestAction.reason}</CardDescription>
              </div>
              {detail.nextBestAction.href ? (
                <Link
                  href={detail.nextBestAction.href}
                  className={buttonVariants({ size: "sm" })}
                >
                  {detail.nextBestAction.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Badge variant="outline" className="border-border/70 bg-muted/40 text-muted-foreground">
                  {detail.nextBestAction.label}
                </Badge>
              )}
            </CardHeader>
          </Card>

          <Card id="pending-actions">
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Pending automation actions</CardTitle>
                  <CardDescription>
                    Review, dismiss, or manually approve one action at a time. No bulk send exists.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-border/70 bg-background text-muted-foreground">
                  {pendingAutomationActions.length} pending
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingAutomationActions.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="No pending actions for this record"
                  description="Confirmed automation runs will place reviewable work here when this lead becomes eligible."
                  className="py-8"
                />
              ) : (
                <div className="grid gap-4">
                  {pendingAutomationActions.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-lg border border-border/60 bg-background/70 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{action.title}</p>
                            <Badge variant="outline" className={getAutomationTone(action.status)}>
                              {formatAutomationStatus(action.status)}
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

                      {action.summary && (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
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
            </CardContent>
          </Card>

          <Card id="activity">
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
              <CardDescription>
                Messages, review requests, automation actions, and safe audit events in one place.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No activity yet"
                  description="Activity will appear as messages, review requests, notes, and automation actions attach to this record."
                  className="py-8"
                />
              ) : (
                <div className="space-y-4">
                  {timeline.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-foreground/30" />
                      <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background/70 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{item.title}</p>
                              <Badge variant="outline" className={getTimelineTone(item.status)}>
                                {item.status}
                              </Badge>
                            </div>
                            {item.description && (
                              <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatShortDate(item.occurredAt)}
                          </p>
                        </div>
                        <p className="mt-3 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {item.source.replaceAll("_", " ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Contact data and source context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {lead.phone ? (
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a href={`tel:${lead.phone}`} className="truncate hover:underline">
                      {lead.phone}
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No phone number</p>
                )}
                {lead.email ? (
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a href={`mailto:${lead.email}`} className="truncate hover:underline">
                      {lead.email}
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No email address</p>
                )}
                {lead.source && (
                  <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span className="truncate">{lead.source}</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid gap-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-right">{formatDate(lead.created_at)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Last contacted</span>
                  <span className="text-right">{formatDate(lead.last_contacted_at)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Next follow-up</span>
                  <span className="text-right">{formatDate(lead.next_followup_at)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Follow-ups</span>
                  <span>{lead.followup_count}</span>
                </div>
                {lead.opted_out && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm leading-6 text-amber-700 dark:text-amber-300">
                    This contact has opted out. SMS review requests are blocked.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lead actions</CardTitle>
              <CardDescription>Update pipeline status without sending messages.</CardDescription>
            </CardHeader>
            <CardContent>
              <LeadStatusActions leadId={id} currentStatus={lead.status as LeadStatus} />
            </CardContent>
          </Card>

          {(lead.notes || lead.ai_summary) && (
            <Card>
              <CardHeader>
                <CardTitle>Context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {lead.ai_summary && (
                  <div>
                    <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Summary
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {lead.ai_summary}
                    </p>
                  </div>
                )}
                {lead.notes && (
                  <div>
                    <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Notes
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {lead.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Add note</CardTitle>
              <CardDescription>Stores an internal note on this record.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddNoteForm leadId={id} />
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Review request history</CardTitle>
            <CardDescription>Tracked requests connected to this contact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewRequests.length === 0 ? (
              <EmptyState
                icon={Star}
                title="No review requests yet"
                description="Review request history appears here after a manual request or approved automation action."
                className="py-8"
              />
            ) : (
              reviewRequests.map((request) => {
                const lifecycle = getReviewRequestLifecycle(request);
                const retry = getReviewRequestRetryEligibility(request);

                return (
                  <div key={request.id} className="rounded-lg border border-border/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{formatChannel(request.channel)}</p>
                          <Badge variant="outline" className={getReviewLifecycleTone(request)}>
                            {lifecycle.label}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Created {formatShortDate(request.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>

                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {lifecycle.shortExplanation} {lifecycle.sentCopy}
                    </p>

                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>Send status: {request.send_status ?? "not recorded"}</p>
                      <p>Source: {request.source ?? "manual"}</p>
                      <p>Destination: {getSafeReviewRequestDestination(request)}</p>
                      <p>Provider: {request.provider ?? "none"}</p>
                      <p>Sent: {formatShortDate(request.sent_at)}</p>
                      <p>Clicked: {formatShortDate(request.clicked_at)}</p>
                      <p>Blocked: {formatShortDate(request.blocked_at)}</p>
                      <p>Failed: {formatShortDate(request.failed_at)}</p>
                      <p>Duplicate prevented: {formatShortDate(request.duplicate_prevented_at)}</p>
                      <p>
                        Provider ID: {request.provider_message_id ? "recorded" : "not recorded"}
                      </p>
                    </div>

                    {request.automation_action_id && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Linked automation action recorded
                      </p>
                    )}
                    {lifecycle.reason && (
                      <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
                        {lifecycle.reason}
                      </p>
                    )}
                    <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-xs font-medium text-foreground">
                        Next action: {lifecycle.operatorNextAction}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Retry: {retry.nextActionLabel}. {retry.reason}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages and notes</CardTitle>
            <CardDescription>Latest SMS, email, inbound messages, and internal notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No messages yet"
                description="Messages and internal notes will stay attached to this record."
                className="py-8"
              />
            ) : (
              messages.slice(0, 8).map((message) => (
                <div key={message.id} className="rounded-lg border border-border/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{formatChannel(message.channel)}</p>
                      <Badge variant="outline" className="border-border/70 bg-muted/40 text-muted-foreground">
                        {message.direction}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatShortDate(message.sent_at ?? message.received_at ?? message.created_at)}
                    </p>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {message.body}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {getMessageStatusLabel(message)}
                    {message.direction === "inbound" && message.channel === "sms"
                      ? ` - From ${lead.phone ?? "customer"}`
                      : ""}
                    {message.provider_message_id ? " - Provider ID recorded" : ""}
                  </p>
                  {message.error_message && (
                    <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      {message.error_message}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {automationActions.length > pendingAutomationActions.length && (
        <Card>
          <CardHeader>
            <CardTitle>Recent automation outcomes</CardTitle>
            <CardDescription>Reviewed, dismissed, sent, failed, or blocked queue items.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {automationActions
              .filter((action) => action.status !== "pending_review")
              .slice(0, 6)
              .map((action) => (
                <div key={action.id} className="rounded-lg border border-border/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">{action.title}</p>
                    <Badge variant="outline" className={getAutomationTone(action.status)}>
                      {formatAutomationStatus(action.status)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.reason}</p>
                  {action.send_error && (
                    <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                      {action.send_error}
                    </p>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
