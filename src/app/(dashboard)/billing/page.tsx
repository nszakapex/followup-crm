import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$49",
    description: "For businesses just getting started with follow-ups.",
    features: [
      "Up to 100 leads/month",
      "Instant reply automation",
      "24-hour follow-up",
      "Google review requests",
      "Email support",
    ],
  },
  {
    name: "Growth",
    price: "$99",
    description: "For growing businesses that want full automation.",
    features: [
      "Up to 500 leads/month",
      "All automations",
      "AI summaries & suggested replies",
      "SMS + email channels",
      "Webhook integrations",
      "Priority support",
    ],
    popular: true,
  },
  {
    name: "Premium",
    price: "$199",
    description: "For teams and multi-location businesses.",
    features: [
      "Unlimited leads",
      "All Growth features",
      "Multiple users & roles",
      "CRM sync support",
      "Admin portal",
      "Dedicated support",
    ],
  },
];

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and payment method.
        </p>
      </div>

      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Plan</CardTitle>
          <CardDescription>
            You&apos;re currently on the free trial.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge variant="secondary">Free Trial</Badge>
          <span className="text-sm text-muted-foreground">14 days remaining</span>
        </CardContent>
      </Card>

      {/* Plans */}
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.popular ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{plan.name}</CardTitle>
                {plan.popular && <Badge>Popular</Badge>}
              </div>
              <div className="mt-2">
                <span className="text-3xl font-semibold">{plan.price}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
              <CardDescription className="mt-2">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button className="w-full mt-6" variant={plan.popular ? "default" : "outline"} disabled>
                <CreditCard className="h-4 w-4 mr-2" />
                Choose {plan.name}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
