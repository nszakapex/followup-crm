import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MessageSquare,
  MousePointerClick,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { ActivityItem } from "@/components/ui/activity-item";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardChart, type DashboardChartPoint } from "@/components/dashboard/dashboard-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { ReadinessPanel, type ReadinessItem } from "@/components/ui/readiness-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { DEMO_EXTERNAL_CRM_NAME } from "@/lib/demo/constants";
import { getBetaReadiness } from "@/lib/diagnostics/beta-readiness";
import {
  getEmailProviderReadiness,
  getSmsProviderReadiness,
  shouldSkipReviewDelivery,
} from "@/lib/messaging/provider-config";
import { getBusinessReadiness } from "@/lib/onboarding/readiness";
import { createClient } from "@/lib/supabase/server";
import type { Automation, Lead, Message, ReviewRequest } from "@/types/database";

type LeadRow = Pick<
  Lead,
  | "id"
  | "first_name"
  | "last_name"
  | "status"
  | "source"
  | "phone"
  | "email"
  | "notes"
  | "ai_summary"
  | "external_crm_name"
  | "next_followup_at"
  | "created_at"
>;

type ReviewRequestRow = Pick<
  ReviewRequest,
  "id" | "lead_id" | "customer_name" | "status" | "sent_at" | "clicked_at" | "created_at"
>;

type AutomationRow = Pick<
  Automation,
  "id" | "name" | "enabled" | "type" | "trigger_count" | "last_triggered_at"
>;

type MessageRow = Pick<Message, "id" | "lead_id" | "direction" | "status" | "created_at">;

type Activity = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: typeof Users;
  date: string;
};

type NextAction = {
  title: string;
  description: string;
  href: string;
  cta: string;
  priority: "High" | "Recommended" | "Optional";
};

function isNextAction(action: NextAction | null): action is NextAction {
  return action !== null;
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function formatError(message: string) {
  return isDevelopment() ? message : "Dashboard data could not be loaded.";
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

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildGrowthSeries(items: { created_at: string }[]): DashboardChartPoint[] {
  if (items.length === 0) return [];

  const days = 30;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const counts = new Map<string, number>();

  for (const item of items) {
    const date = new Date(item.created_at);
    date.setHours(0, 0, 0, 0);
    if (date < start) continue;

    const key = getDateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: counts.get(getDateKey(date)) ?? 0,
    };
  });
}

function percent(part: number, whole: number) {
  if (whole === 0) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function sortByDateDesc<T extends { date: string }>(items: T[]) {
  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

const priorityClasses: Record<NextAction["priority"], string> = {
  High: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Recommended: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Optional: "border-border/70 bg-muted/40 text-muted-foreground",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id, name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) redirect("/login");

  const businessId = profile.business_id;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);

  const [
    { data: business, error: businessError },
    { data: leadsData, error: leadsError },
    { data: reviewRequestsData, error: reviewRequestsError },
    { data: automationsData, error: automationsError },
    { data: messagesData, error: messagesError },
    readiness,
    betaReadiness,
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "id, name, google_review_link, review_requests_enabled, lead_followup_enabled, twilio_from_number, sms_compliance_status, resend_from_email, webhook_secret"
      )
      .eq("id", businessId)
      .single(),
    supabase
      .from("leads")
      .select(
        "id, first_name, last_name, status, source, phone, email, notes, ai_summary, external_crm_name, next_followup_at, created_at"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    supabase
      .from("review_requests")
      .select("id, lead_id, customer_name, status, sent_at, clicked_at, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    supabase
      .from("automations")
      .select("id, name, enabled, type, trigger_count, last_triggered_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("messages")
      .select("id, lead_id, direction, status, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(20),
    getBusinessReadiness(supabase, businessId),
    getBetaReadiness(supabase, businessId),
  ]);

  const queryErrors = [
    businessError,
    leadsError,
    reviewRequestsError,
    automationsError,
    messagesError,
    readiness.errors.length > 0 ? { message: readiness.errors[0] } : null,
  ].filter(Boolean);
  const pageError = queryErrors[0]?.message;

  const leads = (leadsData ?? []) as LeadRow[];
  const reviewRequests = (reviewRequestsData ?? []) as ReviewRequestRow[];
  const automations = (automationsData ?? []) as AutomationRow[];
  const messages = (messagesData ?? []) as MessageRow[];

  const totalLeads = leads.length;
  const newLeadsThisWeek = leads.filter(
    (lead) => new Date(lead.created_at) >= weekStart
  ).length;
  const openOpportunities = leads.filter((lead) =>
    ["new", "needs_reply", "interested", "booked"].includes(lead.status)
  ).length;
  const needsReply = leads.filter((lead) => lead.status === "needs_reply").length;
  const reviewRequestsSent = reviewRequests.filter(
    (request) => request.sent_at || ["sent", "clicked", "completed"].includes(request.status)
  ).length;
  const reviewRequestsThisMonth = reviewRequests.filter(
    (request) => new Date(request.created_at) >= monthStart
  ).length;
  const reviewClicks = reviewRequests.filter(
    (request) => request.clicked_at || request.status === "clicked"
  ).length;
  const activeAutomations = automations.filter((automation) => automation.enabled).length;
  const outboundMessagesThisMonth = messages.filter(
    (message) =>
      message.direction === "outbound" &&
      new Date(message.created_at) >= monthStart
  ).length;
  const engagementRate = percent(reviewClicks, reviewRequestsSent);
  const conversionCount = leads.filter((lead) =>
    ["booked", "completed", "review_requested"].includes(lead.status)
  ).length;
  const conversionRate = percent(conversionCount, totalLeads);
  const hasBusinessProfile = Boolean(business?.name);
  const hasReviewLink = Boolean(business?.google_review_link);
  const leadCaptureReady = Boolean(business?.webhook_secret);
  const reviewRequestsEnabled = Boolean(business?.review_requests_enabled);
  const leadFollowupEnabled = Boolean(business?.lead_followup_enabled);
  const smsReadiness = getSmsProviderReadiness(
    business?.twilio_from_number,
    business?.sms_compliance_status
  );
  const emailReadiness = getEmailProviderReadiness(business?.resend_from_email);
  const deliverySkipped = shouldSkipReviewDelivery();
  const providerLabels = [
    smsReadiness.canAttemptLiveSend ? "SMS" : null,
    emailReadiness.configured ? "Email" : null,
  ].filter(Boolean);
  const hasDemoData = leads.some(
    (lead) => lead.external_crm_name === DEMO_EXTERNAL_CRM_NAME
  );

  const chartSource =
    leads.length > 0
      ? { label: "Lead growth", items: leads }
      : { label: "Review request growth", items: reviewRequests };
  const chartPoints = buildGrowthSeries(chartSource.items);

  const recentLeadActivities: Activity[] = leads.slice(0, 5).map((lead) => ({
    id: `lead-${lead.id}`,
    title: `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
    description: lead.source
      ? `New lead from ${lead.source}`
      : lead.phone || lead.email || "New lead added",
    href: `/leads/${lead.id}`,
    icon: Users,
    date: lead.created_at,
  }));

  const reviewActivities: Activity[] = reviewRequests.slice(0, 5).map((request) => ({
    id: `review-${request.id}`,
    title: request.customer_name,
    description:
      request.status === "clicked"
        ? "Clicked the review request link"
        : "Review request sent",
    href: `/leads/${request.lead_id}`,
    icon: Star,
    date: request.clicked_at ?? request.sent_at ?? request.created_at,
  }));

  const messageActivities: Activity[] = messages.slice(0, 5).map((message) => ({
    id: `message-${message.id}`,
    title: message.direction === "outbound" ? "Outbound message" : "New message",
    description: `${message.status} ${message.direction} message`,
    href: `/leads/${message.lead_id}`,
    icon: MessageSquare,
    date: message.created_at,
  }));

  const recentActivity = sortByDateDesc([
    ...recentLeadActivities,
    ...reviewActivities,
    ...messageActivities,
  ]).slice(0, 6);

  const reviewFlowReady = Boolean(
    reviewRequestsEnabled && hasReviewLink && totalLeads > 0
  );
  const readinessItems: ReadinessItem[] = [
    {
      title: "Business profile",
      description: hasBusinessProfile
        ? `${business?.name} is connected to this workspace.`
        : "Complete the core business identity before sending customers anywhere.",
      status: hasBusinessProfile ? "complete" : "needs_setup",
      href: "/settings",
      cta: "Review",
    },
    {
      title: "Google review link",
      description: hasReviewLink
        ? "Customers have a configured destination for honest Google reviews."
        : "Add the Google review destination used by tracked review requests.",
      status: hasReviewLink ? "complete" : "needs_setup",
      href: "/settings",
      cta: "Configure",
    },
    {
      title: "Lead record",
      description:
        totalLeads > 0
          ? `${totalLeads} lead${totalLeads === 1 ? "" : "s"} available for follow-up.`
          : "Add one real customer or prospect to start the operating loop.",
      status: totalLeads > 0 ? "complete" : "needs_setup",
      href: "/leads",
      cta: totalLeads > 0 ? "Open" : "Add lead",
    },
    {
      title: "Missed-call / lead source",
      description: leadCaptureReady
        ? "A private pilot webhook is configured for form or missed-call lead ingestion."
        : "Set up the private pilot webhook before relying on automated missed-call capture.",
      status: leadCaptureReady ? "complete" : "needs_setup",
      href: "/settings",
      cta: "Review",
    },
    {
      title: "Review request flow",
      description: reviewFlowReady
        ? "Ready to send simple review requests to real customers."
        : !reviewRequestsEnabled
          ? "Review requests are paused in business settings."
          : hasReviewLink
            ? "Add a lead before sending the first review request."
            : "Configure the review link before sending requests.",
      status: reviewFlowReady ? "complete" : "needs_setup",
      href: reviewFlowReady || hasReviewLink ? "/reviews" : "/settings",
      cta: reviewFlowReady ? "Send" : "Set up",
    },
    {
      title: "Automations",
      description:
        automations.length === 0
          ? "Default follow-up automations have not been created yet."
          : activeAutomations > 0 && leadFollowupEnabled
            ? `${activeAutomations} automation${activeAutomations === 1 ? "" : "s"} active.`
            : "Turn on the first follow-up automation when you are ready.",
      status:
        automations.length === 0
          ? "not_configured"
          : activeAutomations > 0 && leadFollowupEnabled
            ? "complete"
            : "needs_setup",
      href: "/automations",
      cta: "Open",
    },
    {
      title: "Delivery mode",
      description:
        deliverySkipped
          ? "Review requests create records, but provider delivery is skipped in test mode."
          : providerLabels.length > 0
          ? `${providerLabels.join(" and ")} configured for live delivery.`
          : "SMS and email providers are not configured for live delivery yet.",
      status: deliverySkipped
        ? "optional"
        : providerLabels.length > 0
          ? "complete"
          : "needs_setup",
      href: "/settings",
      cta: "Review",
    },
  ];

  const nextActions = [
    !hasBusinessProfile
      ? {
          title: "Complete the business profile",
          description: "Name and owner details keep the workspace clear for every follow-up.",
          href: "/settings",
          cta: "Open settings",
          priority: "High" as const,
        }
      : null,
    !hasReviewLink
      ? {
          title: "Add your Google review link",
          description: "Review requests need a destination before customers can click through.",
          href: "/settings",
          cta: "Configure link",
          priority: "High" as const,
        }
      : null,
    needsReply > 0
      ? {
          title: `Reply to ${needsReply} lead${needsReply === 1 ? "" : "s"}`,
          description: "These leads are waiting for a response.",
          href: "/leads?status=needs_reply",
          cta: "Open leads",
          priority: "High" as const,
        }
      : null,
    activeAutomations === 0 && automations.length > 0
      ? {
          title: "Turn on your first automation",
          description: "Start with instant replies so new leads are acknowledged right away.",
          href: "/automations",
          cta: "Enable",
          priority: "Recommended" as const,
        }
      : null,
    automations.length === 0
      ? {
          title: "Create default automations",
          description: "Open Automations to initialize the standard follow-up systems.",
          href: "/automations",
          cta: "Open automations",
          priority: "Recommended" as const,
        }
      : null,
    totalLeads === 0
      ? {
          title: "Add your first lead",
          description: "Create one customer record to unlock follow-up and review tracking.",
          href: "/leads",
          cta: "Add lead",
          priority: "High" as const,
        }
      : null,
    reviewFlowReady && reviewRequestsSent === 0
      ? {
          title: "Send a review request",
          description: "Ask a real customer for an honest Google review.",
          href: "/reviews",
          cta: "Send request",
          priority: "Recommended" as const,
        }
      : null,
    messages.length > 0
      ? {
          title: "Review recent messages",
          description: "Check outbound and inbound activity attached to your leads.",
          href: "/messages",
          cta: "Open messages",
          priority: "Optional" as const,
        }
      : null,
  ].filter(isNextAction);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Command center"
        title={`Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${
          profile.name?.split(" ")[0] ?? "there"
        }`}
        description={`A calm read on ${business?.name ?? "your business"}: missed-call leads, follow-up, reviews, and manual action safety in one place.`}
        actions={
          <>
            {hasDemoData && (
              <Badge variant="outline" className="border-border/70 bg-muted/40 text-muted-foreground">
                Demo data
              </Badge>
            )}
            <Link href="/setup" className={buttonVariants({ variant: "outline" })}>
              Setup
              <ArrowRight className="h-4 w-4" />
            </Link>
            <AddLeadDialog />
          </>
        }
      />

      {pageError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {formatError(pageError)}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-foreground">
              Setup readiness: {readiness.overall.score}/{readiness.overall.total} complete
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Next: {readiness.overall.nextBestAction}. Provider secrets are checked
              server-side and never shown.
            </p>
          </div>
          <Link href="/setup" className={buttonVariants({ variant: "outline" })}>
            Open setup
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">Beta readiness</p>
              <Badge variant="outline" className="border-border/70 bg-background text-muted-foreground">
                {betaReadiness.mode}
              </Badge>
              <Badge
                variant="outline"
                className={
                  betaReadiness.readyForManualBeta
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }
              >
                {betaReadiness.readyForManualBeta ? "Manual beta ready" : "Needs attention"}
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {betaReadiness.summary}
            </p>
          </div>
          <Link href="/setup" className={buttonVariants({ variant: "outline" })}>
            Open diagnostics
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="grid gap-4 p-5 md:grid-cols-4">
          {[
            ["1", "Capture lead", "Website form or missed-call tool posts to the private pilot webhook."],
            ["2", "Review details", "Owner opens the lead, checks contact info, and updates status."],
            ["3", "Approve manually", "Any follow-up or review request is reviewed one action at a time."],
            ["4", "Track outcome", "History and review status show sent, blocked, skipped, or duplicate-prevented."],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-lg border border-border/60 bg-background p-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Step {step}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-foreground text-background">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.3fr_0.7fr] md:items-end">
          <div>
            <Badge className="bg-background/10 text-background hover:bg-background/10">
              {business?.google_review_link ? "Review link ready" : "Review link missing"}
            </Badge>
            <h2 className="mt-5 max-w-2xl text-3xl font-semibold sm:text-4xl">
              {openOpportunities} open conversation{openOpportunities === 1 ? "" : "s"} need
              a clear next step.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-background/70">
              {outboundMessagesThisMonth} outbound follow-up
              {outboundMessagesThisMonth === 1 ? "" : "s"} this month,{" "}
              {reviewRequestsThisMonth} review request
              {reviewRequestsThisMonth === 1 ? "" : "s"}, and {activeAutomations} active
              automation{activeAutomations === 1 ? "" : "s"} keeping the pipeline steady.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-background/10 bg-background/5 p-4">
              <p className="text-background/60">Review engagement</p>
              <p className="mt-2 text-3xl font-semibold">{engagementRate}</p>
            </div>
            <div className="rounded-lg border border-background/10 bg-background/5 p-4">
              <p className="text-background/60">Lead progression</p>
              <p className="mt-2 text-3xl font-semibold">{conversionRate}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ReadinessPanel
        title="Business readiness"
        description="A practical setup check for leads, reviews, follow-up, and delivery."
        items={readinessItems}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total leads"
          value={totalLeads}
          context={`${openOpportunities} open opportunities`}
          icon={Users}
        />
        <MetricCard
          label="New this week"
          value={newLeadsThisWeek}
          context="Created in the last 7 days"
          icon={TrendingUp}
          tone={newLeadsThisWeek > 0 ? "good" : "neutral"}
        />
        <MetricCard
          label="Review requests"
          value={reviewRequestsSent}
          context={`${reviewClicks} link click${reviewClicks === 1 ? "" : "s"}`}
          icon={Star}
        />
        <MetricCard
          label="Engagement"
          value={engagementRate}
          context="Clicked review links"
          icon={MousePointerClick}
          tone={reviewClicks > 0 ? "good" : "neutral"}
        />
        <MetricCard
          label="Automations"
          value={`${activeAutomations}/${automations.length}`}
          context="Currently enabled"
          icon={Zap}
          tone={activeAutomations > 0 ? "good" : "attention"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>{chartSource.label}</CardTitle>
            <CardDescription>
              {hasDemoData
                ? "Sample demo activity from seeded records is included."
                : "Real activity from the last 30 days. No sample data is shown."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardChart points={chartPoints} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next best actions</CardTitle>
            <CardDescription>Only the steps that match the current workspace state.</CardDescription>
          </CardHeader>
          <CardContent>
            {nextActions.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing urgent"
                description="Your setup has the essentials in place. Keep an eye on new replies and review clicks."
                className="py-10"
              />
            ) : (
              <div className="space-y-2">
                {nextActions.map((action) => (
                  <Link key={action.title} href={action.href}>
                    <div className="rounded-lg border border-border/70 p-4 transition-colors hover:bg-muted/40">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{action.title}</p>
                            <Badge
                              variant="outline"
                              className={priorityClasses[action.priority]}
                            >
                              {action.priority}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm leading-5 text-muted-foreground">
                            {action.description}
                          </p>
                          <p className="mt-3 text-xs font-medium text-foreground">
                            {action.cta}
                          </p>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Automation health</CardTitle>
            <CardDescription>Quiet systems that keep the business responsive.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {automations.length === 0 ? (
              <EmptyState
                icon={Zap}
                title="No automations configured"
                description="Default automations will appear here once setup is complete."
                className="py-10"
              />
            ) : (
              automations.slice(0, 6).map((automation) => (
                <div
                  key={automation.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{automation.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {automation.trigger_count > 0
                        ? `${automation.trigger_count} trigger${automation.trigger_count === 1 ? "" : "s"}`
                        : "No triggers yet"}
                      {" - "}
                      Last {formatRelative(automation.last_triggered_at)}
                    </p>
                  </div>
                  <StatusBadge status={automation.enabled ? "enabled" : "paused"} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>New leads, messages, and review movement.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No activity yet"
                description="Recent leads, follow-ups, and review requests will appear here."
                className="py-10"
              />
            ) : (
              <div className="space-y-1">
                {recentActivity.map((activity) => (
                  <ActivityItem
                    key={activity.id}
                    icon={activity.icon}
                    title={activity.title}
                    description={activity.description}
                    meta={formatRelative(activity.date)}
                    action={
                      <Link
                        href={activity.href}
                        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    }
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
