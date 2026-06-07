import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getReviewProviderReadiness, type ReviewSendMode } from "@/lib/reviews/provider-readiness";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

function getBannerCopy(mode: ReviewSendMode) {
  if (mode === "live") {
    return {
      label: "Live mode active",
      description:
        "Manual sends can attempt real delivery only after operator confirmation. Cron still cannot send providers.",
      className: "border-amber-500/25 bg-amber-500/5",
      badgeClassName: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }

  if (mode === "test") {
    return {
      label: "Test mode active",
      description: "Review requests can be recorded for QA, but no live provider message will be sent.",
      className: "border-emerald-500/20 bg-emerald-500/5",
      badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  if (mode === "skip") {
    return {
      label: "Skip mode active",
      description: "Provider delivery is disabled. Manual actions can record skipped/test outcomes only.",
      className: "border-emerald-500/20 bg-emerald-500/5",
      badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  return {
    label: "Provider blocked",
    description: "Provider setup is incomplete. No live provider message can be sent.",
    className: "border-border/70 bg-muted/25",
    badgeClassName: "border-border/70 bg-background text-muted-foreground",
  };
}

function chooseMode(smsMode: ReviewSendMode, emailMode: ReviewSendMode): ReviewSendMode {
  if (smsMode === "live" || emailMode === "live") return "live";
  if (smsMode === "test" || emailMode === "test") return "test";
  if (smsMode === "skip" || emailMode === "skip") return "skip";
  return "blocked";
}

export async function SafetyModeBanner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.business_id) return null;

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, google_review_link, twilio_from_number, sms_compliance_status, resend_from_email")
    .eq("id", profile.business_id)
    .maybeSingle();

  if (businessError || !business) return null;

  const smsReadiness = getReviewProviderReadiness({
    business,
    channel: "sms",
    codePath: "direct_manual",
  });
  const emailReadiness = getReviewProviderReadiness({
    business,
    channel: "email",
    codePath: "direct_manual",
  });
  const mode = chooseMode(smsReadiness.mode, emailReadiness.mode);
  const copy = getBannerCopy(mode);

  return (
    <div className={cn("border-y", copy.className)}>
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={copy.badgeClassName}>
                {copy.label}
              </Badge>
              <p className="text-muted-foreground">{copy.description}</p>
            </div>
          </div>
        </div>
        <Link href="/setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Readiness
        </Link>
      </div>
    </div>
  );
}
