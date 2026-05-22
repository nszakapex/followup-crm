import { redirect } from "next/navigation";
import { ExternalLink, LinkIcon, Settings, SlidersHorizontal, Webhook } from "lucide-react";

import { BrandVoiceSelector } from "@/components/settings/brand-voice-selector";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { ReviewLinkForm } from "@/components/settings/review-link-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import type { BrandVoice, Business } from "@/types/database";

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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Keep the business profile, review destination, and communication tone precise."
      />

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
