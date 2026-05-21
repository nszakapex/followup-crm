import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ensureDefaultAutomations } from "@/lib/automations/ensure-defaults";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Zap,
  Clock,
  CalendarDays,
  PhoneMissed,
  Star,
  BarChart3,
} from "lucide-react";
import { AutomationToggle } from "@/components/automations/automation-toggle";
import { EditTemplateDialog } from "@/components/automations/edit-template-dialog";
import { ChannelSelector } from "@/components/automations/channel-selector";
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
    "Automatically replies when a new lead comes in from your website, form, or connected source.",
  twenty_four_hour_followup:
    "Sends a friendly follow-up if a lead hasn't replied within 24 hours.",
  three_day_followup:
    "Final follow-up sent 3 days after the first message if no response.",
  missed_call_textback:
    "Automatically texts back when you miss an incoming call.",
  review_request:
    "Sends a review request after a job or appointment is marked completed.",
  weekly_owner_summary:
    "Sends you a weekly email with lead activity, follow-up stats, and review request results.",
};

function formatRelative(dateStr: string | null) {
  if (!dateStr) return null;
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

export default async function AutomationsPage() {
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

  // Ensure all 6 default automation types exist (creates only missing ones)
  await ensureDefaultAutomations(supabase, profile.business_id);

  const { data: automations } = await supabase
    .from("automations")
    .select("*")
    .eq("business_id", profile.business_id)
    .order("created_at", { ascending: true });

  const items = (automations ?? []) as Automation[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="text-muted-foreground mt-1">
          Turn on follow-ups and review requests. No complex workflows needed.
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-muted-foreground">No automations yet</h3>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
              Complete onboarding to set up your default automations, or they will be
              created when you first configure follow-ups.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((auto) => {
            const Icon = typeIcons[auto.type] ?? Zap;
            const description = typeDescriptions[auto.type] ?? "";
            const lastTriggered = formatRelative(auto.last_triggered_at);

            return (
              <Card key={auto.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{auto.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {description}
                      </CardDescription>
                    </div>
                  </div>
                  <AutomationToggle
                    automationId={auto.id}
                    enabled={auto.enabled}
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
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

                  {auto.message_template && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 leading-relaxed">
                      {auto.message_template}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {auto.trigger_count > 0
                        ? `Triggered ${auto.trigger_count} time${auto.trigger_count === 1 ? "" : "s"}`
                        : "Never triggered"}
                    </span>
                    {lastTriggered && (
                      <span>Last: {lastTriggered}</span>
                    )}
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
