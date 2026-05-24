import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Mail,
  MessageSquare,
  Phone,
  Star,
  Users,
  Webhook,
  Zap,
} from "lucide-react";

import { BrandVoiceSelector } from "@/components/settings/brand-voice-selector";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { ReviewLinkForm } from "@/components/settings/review-link-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getBusinessVerticalLabel } from "@/lib/business-verticals/verticals";
import { getBusinessReadiness } from "@/lib/onboarding/readiness";
import { getReviewProviderReadiness } from "@/lib/reviews/provider-readiness";
import { createClient } from "@/lib/supabase/server";
import type { BrandVoice, Business } from "@/types/database";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function formatError(message: string) {
  return isDevelopment() ? message : "Setup data could not be loaded.";
}

function statusTone(status: "ready" | "partial" | "blocked" | "complete" | "incomplete" | "empty") {
  if (status === "ready" || status === "complete") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "partial") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border/70 bg-muted/40 text-muted-foreground";
}

function statusLabel(status: string) {
  if (status === "complete") return "Complete";
  if (status === "incomplete") return "Needs setup";
  if (status === "ready") return "Ready";
  if (status === "partial") return "Partial";
  if (status === "blocked") return "Blocked";
  if (status === "empty") return "Empty";
  return status;
}

function MissingList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Everything needed for this section is in place.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function SetupCard({
  icon: Icon,
  title,
  description,
  status,
  missing,
  actionHref,
  actionLabel,
}: {
  icon: typeof CheckCircle2;
  title: string;
  description: string;
  status: "ready" | "partial" | "blocked" | "complete" | "incomplete" | "empty";
  missing: string[];
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={statusTone(status)}>
            {statusLabel(status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <MissingList items={missing} />
        {actionHref && (
          <Button className="mt-4" size="sm" variant="outline" render={<Link href={actionHref} />}>
            {actionLabel ?? "Open"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default async function SetupPage() {
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

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", profile.business_id)
    .single();

  if (businessError || !business) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Setup"
          title="Business setup"
          description="A guided readiness center for the CRM."
        />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{formatError(businessError?.message ?? "Business profile not found.")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const biz = business as Business;
  const readiness = await getBusinessReadiness(supabase, profile.business_id);
  const businessVerticalLabel = getBusinessVerticalLabel(biz.industry);

  const canTestReviewRequest =
    readiness.reviewSetup.googleReviewLinkConfigured &&
    readiness.dataSetup.hasTestableRecipient;
  const providerReady =
    readiness.smsProvider.canSend || readiness.emailProvider.canSend;
  const smsManualReadiness = getReviewProviderReadiness({
    business: biz,
    channel: "sms",
    codePath: "direct_manual",
  });
  const emailManualReadiness = getReviewProviderReadiness({
    business: biz,
    channel: "email",
    codePath: "direct_manual",
  });
  const preferredManualReadiness = smsManualReadiness.ready
    ? smsManualReadiness
    : emailManualReadiness;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Setup"
        title="Business setup"
        description="A clear path from profile basics to safe manual sending and automation checks."
        actions={
          <Button render={<Link href="/settings" />}>
            Open settings
            <ArrowRight className="h-4 w-4" />
          </Button>
        }
      />

      {readiness.errors.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{formatError(readiness.errors[0])}</p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-foreground text-background">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <Badge className="bg-background/10 text-background hover:bg-background/10">
              {statusLabel(readiness.overall.status)}
            </Badge>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              {readiness.overall.score}/{readiness.overall.total} setup checks ready.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-background/70">
              Next best action: {readiness.overall.nextBestAction}. The app explains
              blockers before a send can happen.
            </p>
            <p className="mt-3 text-sm leading-6 text-background/70">
              Business type: {businessVerticalLabel}. Unknown or unset types use the
              generic service-business workflow.
            </p>
          </div>
          <div className="rounded-lg border border-background/10 bg-background/5 p-4">
            <p className="text-sm text-background/60">Safe test readiness</p>
            <p className="mt-2 text-2xl font-semibold">
              {canTestReviewRequest && providerReady ? "Ready" : "Needs setup"}
            </p>
            <p className="mt-2 text-sm leading-6 text-background/65">
              {canTestReviewRequest
                ? "A testable lead and review link are available."
                : "Add a review link and a lead with phone or email first."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SetupCard
          icon={Building2}
          title="Business profile"
          description="Identity and public contact basics for the workspace."
          status={readiness.businessProfile.status}
          missing={readiness.businessProfile.missing}
          actionHref="#business-profile"
          actionLabel="Edit profile"
        />
        <SetupCard
          icon={Star}
          title="Review setup"
          description="Destination and message template for honest Google review requests."
          status={readiness.reviewSetup.status}
          missing={readiness.reviewSetup.missing}
          actionHref="#review-link"
          actionLabel="Edit review link"
        />
        <SetupCard
          icon={Phone}
          title="SMS readiness"
          description="Safe SMS status without showing Twilio credentials."
          status={readiness.smsProvider.status === "ready" ? "ready" : "blocked"}
          missing={readiness.smsProvider.missing}
          actionHref="/settings"
          actionLabel="Review settings"
        />
        <SetupCard
          icon={Mail}
          title="Email readiness"
          description="Safe email status without showing Resend credentials."
          status={readiness.emailProvider.status === "ready" ? "ready" : "blocked"}
          missing={readiness.emailProvider.missing}
          actionHref="/settings"
          actionLabel="Review settings"
        />
        <SetupCard
          icon={Users}
          title="Customer data"
          description="At least one lead with a phone or email is needed for testing."
          status={readiness.dataSetup.status}
          missing={readiness.dataSetup.missing}
          actionHref="/leads"
          actionLabel="Open leads"
        />
        <SetupCard
          icon={Zap}
          title="Automation readiness"
          description="Automation checks create pending actions. They do not send automatically."
          status={readiness.automationSetup.status}
          missing={readiness.automationSetup.missing}
          actionHref="/automations"
          actionLabel="Open automations"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provider readiness center</CardTitle>
              <CardDescription>
                Plain-language delivery checks. Secret values never appear here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {[
                ["Google review link", readiness.reviewSetup.googleReviewLinkConfigured ? "Ready" : "Missing"],
                ["Business type", businessVerticalLabel],
                ["SMS delivery", readiness.smsProvider.canSend ? "Ready" : "Blocked"],
                ["Email delivery", readiness.emailProvider.canSend ? "Ready" : "Blocked"],
                ["Current send mode", preferredManualReadiness.mode],
                [
                  "Manual live sending",
                  smsManualReadiness.canAttemptProviderSend ||
                  emailManualReadiness.canAttemptProviderSend
                    ? "Available after confirmation"
                    : "Unavailable",
                ],
                ["Manual approval", "Required"],
                ["Cron delivery", "Disabled"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{label}</span>
                  <Badge variant="outline">{value}</Badge>
                </div>
              ))}
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                {preferredManualReadiness.userFacingExplanation} Scheduled checks create
                pending actions only. Operators manually approve one action at a time before
                any provider helper can run.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead capture readiness</CardTitle>
              <CardDescription>Website form status without exposing private secrets.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Webhook status</span>
                <Badge variant="outline">
                  {readiness.leadCapture.webhookConfigured ? "Configured" : "Not configured"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Recent webhook events</span>
                <Badge variant="outline">{readiness.leadCapture.recentWebhookEvents}</Badge>
              </div>
              <Button size="sm" variant="outline" render={<Link href="/settings" />}>
                Review webhook setup
                <Webhook className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card id="business-profile">
            <CardHeader>
              <CardTitle className="text-base">Business profile</CardTitle>
              <CardDescription>
                Complete the profile fields used across the portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BusinessSettingsForm business={biz} />
            </CardContent>
          </Card>

          <Card id="review-link">
            <CardHeader>
              <CardTitle className="text-base">Google review link</CardTitle>
              <CardDescription>
                Required before review request actions can be sent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReviewLinkForm currentLink={biz.google_review_link} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Brand voice</CardTitle>
              <CardDescription>Keep suggested messages aligned with the business.</CardDescription>
            </CardHeader>
            <CardContent>
              <BrandVoiceSelector currentVoice={biz.brand_voice as BrandVoice} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New business setup checklist</CardTitle>
          <CardDescription>
            The safest order for going from empty workspace to controlled review requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          {[
            "Create business profile",
            "Add public contact details",
            "Add Google review link",
            "Confirm provider readiness",
            "Add first customer",
            "Send a manual review request",
            "Enable automations",
            "Run a dry-run",
            "Run a confirmed automation check",
            "Review pending actions",
            "Approve/send one safe action",
          ].map((item, index) => (
            <div key={item} className="flex gap-3 rounded-lg border border-border/60 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {index + 1}
              </span>
              <span className="leading-6 text-muted-foreground">{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="flex gap-3 py-4 text-sm leading-6 text-muted-foreground">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Test send controls are intentionally limited in this phase. Use the existing
            manual review request flow or approve one pending automation action after setup
            is ready.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
