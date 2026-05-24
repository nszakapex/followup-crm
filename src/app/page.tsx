import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Zap, MessageSquare, Star, ArrowRight, CheckCircle } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Manual Follow-Up Queue",
    description:
      "New leads can produce clear follow-up actions that operators review and approve one at a time.",
  },
  {
    icon: MessageSquare,
    title: "Simple Lead Tracking",
    description:
      "See every lead, what happened, and what to do next. No complicated dashboards or confusing pipelines.",
  },
  {
    icon: Star,
    title: "Google Review Requests",
    description:
      "When a job is done, send customers a simple request to leave an honest Google review. One tap.",
  },
];

const benefits = [
  "Capture leads from your website or forms",
  "Create manual follow-up actions for SMS or email",
  "See who needs attention with AI summaries",
  "Request Google reviews from real customers",
  "Works standalone or alongside your existing CRM",
  "Set up in under 5 minutes",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FollowUp</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
              Sign in
            </Link>
            <Link href="/signup" className={buttonVariants()}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl max-w-3xl mx-auto leading-tight">
          Capture leads, manage follow-ups, and earn more Google reviews
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          A simple CRM with reviewable follow-up workflows built in. No complicated
          software to learn. Just leads, follow-ups, and reviews in one place.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Start free trial
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
          <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No credit card required. Set up in under 5 minutes.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-4">
                <feature.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-2xl bg-muted/50 p-8 sm:p-12">
          <h2 className="text-2xl font-semibold text-center mb-8">
            Everything a local business needs
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 max-w-2xl mx-auto">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold">
          Stop losing leads to unclear follow-up
        </h2>
        <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
          Most leads go cold quickly. FollowUp shows who needs attention and what
          action to take next, so you can focus on doing great work.
        </p>
        <Link href="/signup" className={buttonVariants({ size: "lg", className: "mt-6" })}>
          Get started free
          <ArrowRight className="h-4 w-4 ml-2" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-8">
        <div className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            FollowUp CRM
          </p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
