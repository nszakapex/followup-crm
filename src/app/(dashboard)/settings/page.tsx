import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
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
          <CardDescription>
            Basic details about your business.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business-name">Business name</Label>
            <Input id="business-name" placeholder="Your Business Name" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" placeholder="e.g. Restaurant, Contractor, Salon" disabled />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="owner-name">Owner name</Label>
              <Input id="owner-name" placeholder="Jane Smith" disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-email">Owner email</Label>
              <Input id="owner-email" type="email" placeholder="jane@example.com" disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" placeholder="https://yourbusiness.com" disabled />
          </div>
          <Button disabled>Save changes</Button>
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
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="review-link">Review link URL</Label>
            <Input id="review-link" placeholder="https://g.page/r/..." disabled />
          </div>
          <Button disabled>Save link</Button>
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
          <div className="flex flex-wrap gap-2">
            {["Friendly", "Professional", "Premium", "Casual", "Direct", "Warm"].map((voice) => (
              <Button
                key={voice}
                variant={voice === "Friendly" ? "default" : "outline"}
                size="sm"
                disabled
              >
                {voice}
              </Button>
            ))}
          </div>
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
          <Button variant="outline" className="mt-4" disabled>
            Configure integration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
