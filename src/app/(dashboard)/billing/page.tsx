import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, CreditCard, ShieldCheck } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Pilot billing is handled manually while this workspace is in concierge setup.
        </p>
      </div>

      <Card className="border-border/70 bg-muted/20">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Concierge pilot billing</CardTitle>
              <CardDescription>
                No automated subscription, trial clock, or card charge is active in this app.
              </CardDescription>
            </div>
            <Badge variant="outline">Manual pilot</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background p-4">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No card on file</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              The CRM will not collect payment information or attempt charges from this page.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-4">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Setup handled with you</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Pricing, invoices, and pilot terms are confirmed outside the app for now.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-4">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No entitlement automation yet</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Stripe and self-serve plan management are intentionally deferred until after the pilot.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What this means during pilot</CardTitle>
          <CardDescription>
            The app stays focused on missed-call capture, follow-up, and review requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            The business owner can use the CRM without seeing fake trial dates or disabled plan
            choices. Billing questions are handled directly by the FollowUp CRM operator.
          </p>
          <p>
            Before public SaaS launch, this page should be replaced with Stripe checkout,
            subscription status, invoices, and a customer portal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
