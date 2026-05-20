import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Clock,
  CalendarDays,
  PhoneMissed,
  Star,
  BarChart3,
  Pencil,
} from "lucide-react";

const automations = [
  {
    name: "Instant Reply to New Leads",
    description:
      "Automatically replies when a new lead comes in from your website, form, or connected source.",
    icon: Zap,
    channel: "SMS",
    enabled: false,
    defaultMessage:
      "Hey, this is {{business_name}}. Thanks for reaching out — we'll get back to you shortly. What can we help you with?",
  },
  {
    name: "24-Hour Follow-Up",
    description:
      "Sends a friendly follow-up if a lead hasn't replied within 24 hours.",
    icon: Clock,
    channel: "SMS",
    enabled: false,
    defaultMessage:
      "Hey {{first_name}}, just following up from yesterday. Still interested? Let us know how we can help.",
  },
  {
    name: "3-Day Follow-Up",
    description:
      "Final follow-up sent 3 days after the first message if no response.",
    icon: CalendarDays,
    channel: "SMS",
    enabled: false,
    defaultMessage:
      "Hi {{first_name}}, we wanted to check in one more time. If you're still looking for help, we're here. Just reply to this message.",
  },
  {
    name: "Missed-Call Text-Back",
    description:
      "Automatically texts back when you miss an incoming call.",
    icon: PhoneMissed,
    channel: "SMS",
    enabled: false,
    defaultMessage:
      "Hey, sorry we missed your call. How can we help you?",
  },
  {
    name: "Google Review Request",
    description:
      "Sends a review request after a job or appointment is marked completed.",
    icon: Star,
    channel: "SMS",
    enabled: false,
    defaultMessage:
      "Hi {{first_name}}, thank you for choosing {{business_name}}. If you had a good experience, would you mind leaving us an honest Google review? Here's the link: {{google_review_link}}",
  },
  {
    name: "Weekly Owner Summary",
    description:
      "Sends you a weekly email with lead activity, follow-up stats, and review request results.",
    icon: BarChart3,
    channel: "Email",
    enabled: false,
    defaultMessage: "",
  },
];

export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="text-muted-foreground mt-1">
          Turn on follow-ups and review requests. No complex workflows needed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {automations.map((auto) => (
          <Card key={auto.name}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <auto.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">{auto.name}</CardTitle>
                  <CardDescription className="mt-1">{auto.description}</CardDescription>
                </div>
              </div>
              <Switch checked={auto.enabled} disabled />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">
                  {auto.channel}
                </Badge>
                <Button variant="ghost" size="sm" disabled>
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit message
                </Button>
              </div>
              {auto.defaultMessage && (
                <p className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded-md p-3 leading-relaxed">
                  {auto.defaultMessage}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
