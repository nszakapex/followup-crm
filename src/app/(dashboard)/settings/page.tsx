import { redirect } from "next/navigation";
import { ExternalLink, LinkIcon, Settings, SlidersHorizontal, Webhook } from "lucide-react";

import { BrandVoiceSelector } from "@/components/settings/brand-voice-selector";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { ReviewLinkForm } from "@/components/settings/review-link-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ReadinessPanel, type ReadinessItem } from "@/components/ui/readiness-panel";
import { createClient } from "@/lib/supabase/server";
import type { Automation, BrandVoice, Business, Lead, ReviewRequest } from "@/types/database";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function formatError(message: string) {
  return isDevelopment() ? message : "Settings could not be loaded.";
}

export default async function SettingsPage() {
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

  if (!business && !businessError) redirect("/onboarding");

  if (businessError || !business) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Workspace"
          title="Settings"
          description="Manage your business profile and follow-up preferences."
        />
        <Card className="border-destructive/30 bg-destructive/5">
          <EmptyState
            icon={Settings}
            title="Settings unavailable"
            description={formatError(businessError?.message ?? "Business profile not found.")}
          />
        </Card>
      </div>
    );
  }

  const biz = business as Business;
  const [
    { data: leadsData, error: leadsError },
    { data: reviewRequestsData, error: reviewRequestsError },
    { data: automationsData, error: automationsError },
  ] = await Promise.all([
    supabase.from("leads").select("id").eq("business_id", profile.business_id),
    supabase.from("review_requests").select("id").eq("business_id", profile.business_id),
    supabase
      .from("automations")
      .select("id, enabled")
      .eq("business_id", profile.business_id),
  ]);
  const leads = (leadsData ?? []) as Pick<Lead, "id">[];
  const reviewRequests = (reviewRequestsData ?? []) as Pick<ReviewRequest, "id">[];
  const automations = (automationsData ?? []) as Pick<Automation, "id" | "enabled">[];
  const activeAutomations = automations.filter((automation) => automation.enabled).length;
  const settingsStatusError =
    leadsError?.message ?? reviewRequestsError?.message ?? automationsError?.message ?? null;
  const smsProviderConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_PHONE_NUMBER ||
        process.env.TWILIO_MESSAGING_SERVICE_SID ||
        biz.twilio_from_number)
  );
  const emailProviderConfigured = Boolean(
    process.env.RESEND_API_KEY &&
      (process.env.RESEND_FROM_EMAIL || biz.resend_from_email)
  );
  const providerLabels = [
    smsProviderConfigured ? "SMS" : null,
    emailProviderConfigured ? "Email" : null,
  ].filter(Boolean);
  const businessIdentityReady = Boolean(biz.name && biz.owner_email);
  const reviewLinkReady = Boolean(biz.google_review_link);
  const reviewRequestsReady = Boolean(biz.review_requests_enabled && reviewLinkReady);
  const settingsReadinessItems: ReadinessItem[] = [
    {
      title: "Business identity",
      description: businessIdentityReady
        ? "Name and owner email are available for the workspace."
        : "Add the business name and owner email used across the portal.",
      status: businessIdentityReady ? "complete" : "needs_setup",
    },
    {
      title: "Google review link",
      description: reviewLinkReady
        ? "Tracked review requests have a configured destination."
        : "Add the Google review destination before sending requests.",
      status: reviewLinkReady ? "complete" : "needs_setup",
    },
    {
      title: "Review request readiness",
      description: reviewRequestsReady
        ? "The business is ready to send simple, honest review requests."
        : biz.review_requests_enabled
          ? "A review link is required before customers can be sent through."
          : "Review requests are paused for this business.",
      status: reviewRequestsReady ? "complete" : "needs_setup",
    },
    {
      title: "Lead/customer record",
      description:
        leads.length > 0
          ? `${leads.length} lead${leads.length === 1 ? "" : "s"} available for actions.`
          : "Add a real lead or customer before sending the first request.",
      status: leads.length > 0 ? "complete" : "needs_setup",
      href: "/leads",
      cta: leads.length > 0 ? "Open" : "Add lead",
    },
    {
      title: "Automation setup",
      description:
        automations.length === 0
          ? "Default automations have not been initialized yet."
          : activeAutomations > 0 && biz.lead_followup_enabled
            ? `${activeAutomations} automation${activeAutomations === 1 ? "" : "s"} active.`
            : "Turn on at least one follow-up automation when ready.",
      status:
        automations.length === 0
          ? "not_configured"
          : activeAutomations > 0 && biz.lead_followup_enabled
            ? "complete"
            : "needs_setup",
      href: "/automations",
      cta: "Open",
    },
    {
      title: "Messaging provider",
      description:
        providerLabels.length > 0
          ? `${providerLabels.join(" and ")} configured for live delivery.`
          : "Mock delivery is available for local testing; live SMS/email setup is optional for now.",
      status: providerLabels.length > 0 ? "complete" : "optional",
    },
    {
      title: "Review activity",
      description:
        reviewRequests.length > 0
          ? `${reviewRequests.length} review request${reviewRequests.length === 1 ? "" : "s"} recorded.`
          : "Activity will appear after the first review request is sent.",
      status: reviewRequests.length > 0 ? "complete" : "optional",
      href: "/reviews",
      cta: "Open",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Keep the business profile, review destination, and communication tone precise."
      />

      {settingsStatusError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {formatError(settingsStatusError)}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="space-y-4">
          <Card className="bg-foreground text-background">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase text-background/60">
                Business
              </p>
              <h2 className="mt-3 text-2xl font-semibold">{biz.name}</h2>
              <p className="mt-2 text-sm text-background/65">
                {biz.industry || "Industry not set"}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge className="bg-background/10 text-background hover:bg-background/10">
                  {biz.review_requests_enabled ? "Reviews enabled" : "Reviews paused"}
                </Badge>
                <Badge className="bg-background/10 text-background hover:bg-background/10">
                  {biz.lead_followup_enabled ? "Follow-up enabled" : "Follow-up paused"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <ReadinessPanel
            title="Review readiness"
            description="A compact check of what is ready and what still needs attention."
            items={settingsReadinessItems}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ExternalLink className="h-4 w-4" />
                Existing CRM connection
              </CardTitle>
              <CardDescription>
                Use FollowUp standalone or as a calm follow-up layer for another CRM.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                Webhooks can receive leads from forms, Zapier, Make, or external systems while
                keeping the original CRM reference attached to each lead.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" />
                Business information
              </CardTitle>
              <CardDescription>Core details used across the client portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <BusinessSettingsForm business={biz} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LinkIcon className="h-4 w-4" />
                Google review link
              </CardTitle>
              <CardDescription>
                The destination included in tracked review request messages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReviewLinkForm currentLink={biz.google_review_link} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4" />
                Brand voice
              </CardTitle>
              <CardDescription>
                Controls the tone used for future generated summaries and suggested replies.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BrandVoiceSelector currentVoice={biz.brand_voice as BrandVoice} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-4 w-4" />
                Webhook endpoint
              </CardTitle>
              <CardDescription>
                Send lead data into FollowUp from external forms and no-code tools.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3 font-mono text-xs break-all">
                POST /api/webhooks/leads/{biz.id}/{"{secret}"}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Send JSON with first_name, last_name, phone, email, source, message, notes,
                external_crm_id, and external_crm_name.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
