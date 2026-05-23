import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ExternalLink,
  LinkIcon,
  MousePointerClick,
  Send,
  Star,
} from "lucide-react";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { SendReviewRequestDialog } from "@/components/reviews/send-review-request-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEMO_EXTERNAL_CRM_NAME } from "@/lib/demo/constants";
import { createClient } from "@/lib/supabase/server";
import type { MessageChannel, ReviewRequestSendStatus, ReviewRequestStatus } from "@/types/database";

type ReviewRequestRow = {
  id: string;
  lead_id: string;
  customer_name: string;
  channel: MessageChannel;
  status: ReviewRequestStatus;
  send_status: ReviewRequestSendStatus | null;
  provider: string | null;
  sent_at: string | null;
  clicked_at: string | null;
  blocked_at: string | null;
  failed_at: string | null;
  duplicate_prevented_at: string | null;
  failure_reason: string | null;
  blocked_reason: string | null;
  duplicate_reason: string | null;
  source: string | null;
  automation_action_id: string | null;
  created_at: string;
  leads: ReviewRequestLead | ReviewRequestLead[] | null;
};

type ReviewRequestLead = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  external_crm_name: string | null;
};

type ReviewLeadOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  opted_out: boolean;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function formatError(message: string) {
  return isDevelopment() ? message : "Reviews data could not be loaded.";
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

function getLinkedLead(request: ReviewRequestRow) {
  return Array.isArray(request.leads) ? request.leads[0] ?? null : request.leads;
}

function percent(part: number, whole: number) {
  if (whole === 0) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function getReviewAttentionReason(request: ReviewRequestRow) {
  if (request.status === "blocked") return request.blocked_reason;
  if (request.status === "failed") return request.failure_reason;
  if (request.status === "duplicate_prevented") return request.duplicate_reason;
  if (request.send_status === "blocked") return request.blocked_reason;
  if (request.send_status === "failed") return request.failure_reason;
  if (request.send_status === "duplicate_prevented") return request.duplicate_reason;
  if (request.send_status === "not_attempted" && request.blocked_reason) {
    return request.blocked_reason;
  }
  return null;
}

export default async function ReviewsPage() {
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

  const [
    { data: business, error: businessError },
    { data: reviewRequestsData, error: reviewRequestsError },
    { data: leadsData, error: leadsError },
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, google_review_link")
      .eq("id", profile.business_id)
      .single(),
    supabase
      .from("review_requests")
      .select(
        "id, lead_id, customer_name, channel, status, send_status, provider, sent_at, clicked_at, blocked_at, failed_at, duplicate_prevented_at, failure_reason, blocked_reason, duplicate_reason, source, automation_action_id, created_at, leads(id, first_name, last_name, phone, email, external_crm_name)"
      )
      .eq("business_id", profile.business_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("leads")
      .select("id, first_name, last_name, phone, email, opted_out")
      .eq("business_id", profile.business_id)
      .order("created_at", { ascending: false }),
  ]);

  const reviewRequests = (reviewRequestsData ?? []) as unknown as ReviewRequestRow[];
  const leads = (leadsData ?? []) as ReviewLeadOption[];
  const hasGoogleReviewLink = Boolean(business?.google_review_link);
  const hasDemoData = reviewRequests.some(
    (request) => getLinkedLead(request)?.external_crm_name === DEMO_EXTERNAL_CRM_NAME
  );
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const pageError =
    businessError?.message ?? reviewRequestsError?.message ?? leadsError?.message ?? null;

  const sentThisMonth = reviewRequests.filter(
    (request) => request.sent_at && new Date(request.sent_at) >= monthStart
  ).length;
  const clickedLinks = reviewRequests.filter(
    (request) => request.clicked_at || request.status === "clicked"
  ).length;
  const pendingRequests = reviewRequests.filter(
    (request) => request.status === "pending"
  ).length;
  const failedRequests = reviewRequests.filter(
    (request) =>
      request.status === "failed" ||
      request.status === "blocked" ||
      request.send_status === "failed" ||
      request.send_status === "blocked"
  ).length;
  const engagementRate = percent(clickedLinks, reviewRequests.length);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reputation"
        title="Reviews"
        description="Send real customers a simple request to leave an honest Google review, then track clicks without adding friction."
        actions={
          <>
            {hasDemoData && (
              <Badge variant="outline" className="border-border/70 bg-muted/40 text-muted-foreground">
                Demo data
              </Badge>
            )}
            {hasGoogleReviewLink && leads.length > 0 ? (
              <SendReviewRequestDialog
                leads={leads}
                hasGoogleReviewLink={hasGoogleReviewLink}
              />
            ) : hasGoogleReviewLink ? (
              <AddLeadDialog />
            ) : (
              <Button variant="outline" render={<Link href="/settings" />}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Settings
              </Button>
            )}
          </>
        }
      />

      {pageError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{formatError(pageError)}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Sent this month"
          value={sentThisMonth}
          context="Review requests delivered"
          icon={Send}
        />
        <MetricCard
          label="Clicked links"
          value={clickedLinks}
          context={`${engagementRate} engagement`}
          icon={MousePointerClick}
          tone={clickedLinks > 0 ? "good" : "neutral"}
        />
        <MetricCard
          label="Pending"
          value={pendingRequests}
          context="Waiting for delivery or action"
          icon={LinkIcon}
        />
        <MetricCard
          label="Needs attention"
          value={failedRequests}
          context="Blocked or failed"
          icon={AlertCircle}
          tone={failedRequests > 0 ? "attention" : "neutral"}
        />
      </div>

      <Card className={hasGoogleReviewLink ? "" : "border-amber-500/30 bg-amber-500/5"}>
        <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Google review destination</CardTitle>
            <CardDescription>
              Customers reach this link after clicking a tracked review request.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/settings" />}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </CardHeader>
        <CardContent>
          {hasGoogleReviewLink ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Configured link
              </p>
              <p className="mt-2 truncate text-sm">{business?.google_review_link}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add your Google review link in Settings before sending review requests.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent requests</CardTitle>
            <CardDescription>Delivery status, click tracking, and linked customer records.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {reviewRequests.length === 0 ? (
            <EmptyState
              icon={Star}
              title={
                hasGoogleReviewLink
                  ? leads.length > 0
                    ? "Send the first review request"
                    : "Add a customer before sending"
                  : "Configure the review link"
              }
              description={
                hasGoogleReviewLink
                  ? leads.length > 0
                    ? "Choose a real customer and send a simple request to leave an honest Google review."
                    : "Review requests attach to a lead or customer record, keeping activity easy to trace."
                  : "Customers need a real Google review destination before tracked requests can be sent."
              }
              action={
                hasGoogleReviewLink && leads.length > 0 ? (
                  <SendReviewRequestDialog
                    leads={leads}
                    hasGoogleReviewLink={hasGoogleReviewLink}
                  />
                ) : hasGoogleReviewLink ? (
                  <AddLeadDialog />
                ) : (
                  <Button variant="outline" render={<Link href="/settings" />}>
                    Configure review link
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5">Customer</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="pr-5">Clicked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewRequests.slice(0, 20).map((request) => {
                  const linkedLead = getLinkedLead(request);
                  const customerName =
                    request.customer_name ||
                    [linkedLead?.first_name, linkedLead?.last_name]
                      .filter(Boolean)
                      .join(" ") ||
                    "Unknown customer";

                  return (
                    <TableRow key={request.id} className="hover:bg-muted/30">
                      <TableCell className="px-5">
                        <div className="flex flex-col">
                          <Link
                            href={`/leads/${request.lead_id}`}
                            className="font-medium hover:underline"
                          >
                            {customerName}
                          </Link>
                          {linkedLead && (
                            <span className="text-xs text-muted-foreground">
                              {linkedLead.phone || linkedLead.email || "No contact info"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{request.channel.toUpperCase()}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <StatusBadge status={request.status} />
                          {request.send_status && (
                            <p className="text-xs text-muted-foreground">
                              Send: {request.send_status.replaceAll("_", " ")}
                            </p>
                          )}
                          {getReviewAttentionReason(request) && (
                            <p className="max-w-[18rem] text-xs leading-5 text-amber-700 dark:text-amber-300">
                              {getReviewAttentionReason(request)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(request.sent_at)}</TableCell>
                      <TableCell className="pr-5">{formatDate(request.clicked_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
