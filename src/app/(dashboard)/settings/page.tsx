import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { ReviewLinkForm } from "@/components/settings/review-link-form";
import { BrandVoiceSelector } from "@/components/settings/brand-voice-selector";
import type { Business, BrandVoice } from "@/types/database";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", profile.business_id)
    .single();

  if (!business) redirect("/onboarding");

  const biz = business as Business;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your business profile and preferences.
        </p>
      </div>

      {/* Business Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business Information</CardTitle>
          <CardDescription>Basic details about your business.</CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessSettingsForm business={biz} />
        </CardContent>
      </Card>

      <Separator />

      {/* Google Review Link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Review Link</CardTitle>
          <CardDescription>
            This link is included in review request messages sent to your customers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewLinkForm currentLink={biz.google_review_link} />
        </CardContent>
      </Card>

      <Separator />

      {/* Brand Voice */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Voice</CardTitle>
          <CardDescription>
            Controls the tone of AI-generated summaries and suggested replies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandVoiceSelector currentVoice={biz.brand_voice as BrandVoice} />
        </CardContent>
      </Card>

      <Separator />

      {/* Webhook Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook Endpoint</CardTitle>
          <CardDescription>
            Use this URL to send leads from external forms, Zapier, Make, or other tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">
            POST /api/webhooks/leads/{biz.id}/{"{secret}"}
          </div>
          <p className="text-xs text-muted-foreground">
            Your webhook secret is configured in your database. Send a JSON body with: first_name,
            last_name, phone, email, source, message, notes, external_crm_id, external_crm_name.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* CRM Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing CRM Connection</CardTitle>
          <CardDescription>
            Use this as your simple CRM, or connect it to the CRM you already use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If you already use another CRM, this system can act as the follow-up layer. It can
            receive leads, send follow-ups, request reviews, and keep the external CRM reference
            attached to each lead.
          </p>
          <Badge variant="secondary" className="mt-3">
            Zapier &amp; Make compatible via webhooks
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
