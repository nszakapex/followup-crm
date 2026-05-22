import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SendReviewRequestDialog } from "@/components/reviews/send-review-request-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, ExternalLink, LinkIcon, MousePointerClick, Send, Star } from "lucide-react";
import type { MessageChannel, ReviewRequestStatus } from "@/types/database";

type ReviewRequestRow = {
  id: string;
  lead_id: string;
  customer_name: string;
  channel: MessageChannel;
  status: ReviewRequestStatus;
  sent_at: string | null;
  clicked_at: string | null;
  created_at: string;
  leads: ReviewRequestLead | ReviewRequestLead[] | null;
};

type ReviewRequestLead = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type ReviewLeadOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  opted_out: boolean;
};

const statusLabels: Record<ReviewRequestStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  clicked: "Clicked",
  completed: "Completed",
  failed: "Failed",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusVariant(status: ReviewRequestStatus) {
  if (status === "failed") return "destructive";
  if (status === "clicked" || status === "completed") return "default";
  if (status === "sent") return "secondary";
  return "outline";
}

function getLinkedLead(request: ReviewRequestRow) {
  return Array.isArray(request.leads) ? request.leads[0] ?? null : request.leads;
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
        "id, lead_id, customer_name, channel, status, sent_at, clicked_at, created_at, leads(id, first_name, last_name, phone, email)"
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
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

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
    (request) => request.status === "failed"
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
          <p className="text-muted-foreground mt-1">
            Send real customers a simple request to leave an honest Google review.
          </p>
        </div>
      </div>

      {(businessError || reviewRequestsError || leadsError) && (
        <Card className="border-destructive/30">
          <CardContent className="flex gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {businessError?.message ||
                reviewRequestsError?.message ||
                leadsError?.message ||
                "Reviews data could not be loaded."}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Review Link</CardTitle>
          <CardDescription>
            This is the destination customers reach after clicking a tracked review request link.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {hasGoogleReviewLink ? (
              <>
                <Badge variant="secondary">Configured</Badge>
                <p className="mt-2 max-w-xl truncate text-sm text-muted-foreground">
                  {business?.google_review_link}
                </p>
              </>
            ) : (
              <>
                <Badge variant="outline">Missing</Badge>
                <p className="text-sm text-muted-foreground mt-2">
                  Add your Google review link in Settings before sending review requests.
                </p>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" render={<Link href="/settings" />}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sent This Month
            </CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{sentThisMonth}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Links Clicked
            </CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{clickedLinks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending
            </CardTitle>
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{pendingRequests}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Failed
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{failedRequests}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send Review Request</CardTitle>
          <CardDescription>
            Choose an existing customer and send a simple request using the saved Google review link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasGoogleReviewLink ? (
            <p className="text-sm text-muted-foreground">
              Add your Google review link in Settings before sending requests.
            </p>
          ) : leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a lead before sending a review request.
            </p>
          ) : (
            <SendReviewRequestDialog
              leads={leads}
              hasGoogleReviewLink={hasGoogleReviewLink}
            />
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Requests</h2>
        {reviewRequests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Star className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-muted-foreground">No review requests sent yet</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                When you send review requests, they&apos;ll appear here with their delivery and click status.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Clicked</TableHead>
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
                      <TableRow key={request.id}>
                        <TableCell>
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
                          <Badge variant={getStatusVariant(request.status)}>
                            {statusLabels[request.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(request.sent_at)}</TableCell>
                        <TableCell>{formatDate(request.clicked_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
