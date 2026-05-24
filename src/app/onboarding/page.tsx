"use client";

import { useState, useTransition } from "react";
import { completeOnboarding } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle, ArrowRight, ArrowLeft, Building2, Zap, Star, Plug, Loader2 } from "lucide-react";

const stepsMeta = [
  { title: "Business Info", icon: Building2 },
  { title: "Follow-Ups", icon: Zap },
  { title: "Reviews", icon: Star },
  { title: "CRM Mode", icon: Plug },
  { title: "Ready", icon: CheckCircle },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Step 1
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");

  // Step 2
  const [instantReply, setInstantReply] = useState(true);
  const [twentyFourHour, setTwentyFourHour] = useState(true);
  const [threeDay, setThreeDay] = useState(false);
  const [preferredChannel, setPreferredChannel] = useState<"sms" | "email">("sms");

  // Step 3
  const [googleReviewLink, setGoogleReviewLink] = useState("");
  const [reviewRequestsEnabled, setReviewRequestsEnabled] = useState(true);

  // Step 4
  const [crmMode, setCrmMode] = useState<"standalone" | "connected">("standalone");

  function handleNext() {
    if (currentStep === 0 && !businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    setError(null);
    setCurrentStep((s) => s + 1);
  }

  function handleFinish() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding({
        businessName,
        industry,
        website,
        ownerName,
        ownerPhone,
        instantReply,
        twentyFourHourFollowup: twentyFourHour,
        threeDayFollowup: threeDay,
        preferredChannel,
        googleReviewLink,
        reviewRequestsEnabled,
        crmMode,
      });
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center px-4 py-12">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {stepsMeta.map((step, i) => (
          <div key={step.title} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                i <= currentStep
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentStep ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < stepsMeta.length - 1 && (
              <div
                className={`h-px w-8 transition-colors ${
                  i < currentStep ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <Card className="w-full max-w-lg">
        {error && (
          <div className="mx-6 mt-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Step 1: Business Info */}
        {currentStep === 0 && (
          <>
            <CardHeader>
              <CardTitle>Tell us about your business</CardTitle>
              <CardDescription>
                We&apos;ll use this to personalize your follow-ups and review requests.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Business name *</Label>
                <Input
                  placeholder="Acme Plumbing"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input
                  placeholder="e.g. Plumbing, Restaurant, Auto detailing"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  placeholder="https://yourbusiness.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Your name</Label>
                  <Input
                    placeholder="Jane Smith"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    placeholder="(555) 123-4567"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 2: Follow-up Setup */}
        {currentStep === 1 && (
          <>
            <CardHeader>
              <CardTitle>Set up follow-up actions</CardTitle>
              <CardDescription>
                Turn these on to create reviewable follow-up actions. You can change these anytime.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Instant reply to new leads</p>
                  <p className="text-xs text-muted-foreground">
                    Queue a same-day response for manual approval
                  </p>
                </div>
                <Switch checked={instantReply} onCheckedChange={setInstantReply} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">24-hour follow-up</p>
                  <p className="text-xs text-muted-foreground">If they haven&apos;t replied yet</p>
                </div>
                <Switch checked={twentyFourHour} onCheckedChange={setTwentyFourHour} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">3-day follow-up</p>
                  <p className="text-xs text-muted-foreground">Final check-in before marking inactive</p>
                </div>
                <Switch checked={threeDay} onCheckedChange={setThreeDay} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Preferred channel</p>
                  <p className="text-xs text-muted-foreground">
                    How follow-ups are suggested before manual sending
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={preferredChannel === "sms" ? "default" : "outline"}
                    onClick={() => setPreferredChannel("sms")}
                  >
                    SMS
                  </Button>
                  <Button
                    size="sm"
                    variant={preferredChannel === "email" ? "default" : "outline"}
                    onClick={() => setPreferredChannel("email")}
                  >
                    Email
                  </Button>
                </div>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 3: Google Review */}
        {currentStep === 2 && (
          <>
            <CardHeader>
              <CardTitle>Google review requests</CardTitle>
              <CardDescription>
                Send real customers a simple request to leave an honest Google review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Google review link</Label>
                <Input
                  placeholder="https://g.page/r/..."
                  value={googleReviewLink}
                  onChange={(e) => setGoogleReviewLink(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Find this in your Google Business Profile under &quot;Ask for reviews&quot;.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Enable review requests</p>
                  <p className="text-xs text-muted-foreground">
                    Queue review requests after a job is marked completed
                  </p>
                </div>
                <Switch checked={reviewRequestsEnabled} onCheckedChange={setReviewRequestsEnabled} />
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong>Preview:</strong> &quot;Hi [Name], thank you for choosing {businessName || "[Your Business]"}.
                  If you had a good experience, would you mind leaving us an honest Google review?
                  Here&apos;s the link: {googleReviewLink || "[link]"}&quot;
                </p>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 4: CRM Mode */}
        {currentStep === 3 && (
          <>
            <CardHeader>
              <CardTitle>How do you want to use this?</CardTitle>
              <CardDescription>
                Choose what works best for your business right now.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                onClick={() => setCrmMode("standalone")}
                className={`w-full text-left rounded-lg border p-4 transition-colors ${
                  crmMode === "standalone"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary hover:bg-primary/5"
                }`}
              >
                <p className="font-medium text-sm">Use this as my simple CRM</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Store leads, track statuses, and manage everything here.
                </p>
              </button>
              <button
                onClick={() => setCrmMode("connected")}
                className={`w-full text-left rounded-lg border p-4 transition-colors ${
                  crmMode === "connected"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary hover:bg-primary/5"
                }`}
              >
                <p className="font-medium text-sm">Connect to my existing CRM</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This system handles follow-ups and reviews. Your main CRM stays in charge.
                </p>
              </button>
              {crmMode === "connected" && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                  You can configure your CRM connection (Zapier, Make, HubSpot, etc.) in Settings
                  after setup is complete.
                </p>
              )}
            </CardContent>
          </>
        )}

        {/* Step 5: Done */}
        {currentStep === 4 && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Your follow-up and review system is ready.</CardTitle>
              <CardDescription>
                Leads can be captured, follow-up actions can be queued, and customers can be
                sent honest review requests after manual approval.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={handleFinish} disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isPending ? "Setting up..." : "Go to Dashboard"}
                {!isPending && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
            </CardContent>
          </>
        )}

        {/* Navigation buttons */}
        {currentStep < 4 && (
          <div className="flex justify-between px-6 pb-6">
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setCurrentStep(Math.max(0, currentStep - 1));
              }}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button onClick={handleNext}>
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
