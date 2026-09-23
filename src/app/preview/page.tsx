import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  MessageSquare,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "FollowUp CRM — Product preview",
  description:
    "Portfolio preview of FollowUp CRM: compliant SMS follow-ups, lead capture, and review requests for local service businesses.",
  robots: { index: false, follow: false },
};

const SEQUENCE = [
  {
    when: "T+0",
    title: "First touch",
    body: "Hi Alex, this is Peak Detail Co — got your request about full detail. Want me to send a quote or grab you a time? Reply here or call (303) 555-0142. Reply STOP to opt out.",
    tone: "outbound" as const,
  },
  {
    when: "Day 1",
    title: "Still helping",
    body: "Peak Detail Co here — still happy to help with full detail. Any questions I can answer, or a day that works best?",
    tone: "outbound" as const,
  },
  {
    when: "Day 3",
    title: "Easy out",
    body: 'Hi Alex, Peak Detail Co checking in one more time about full detail. If now\'s not the right time, no problem — just say "later" and I\'ll close this out.',
    tone: "outbound" as const,
  },
  {
    when: "Reply",
    title: "Lead responds",
    body: "Saturday morning works — can you send a quote?",
    tone: "inbound" as const,
  },
];

const DECISIONS = [
  {
    icon: ShieldCheck,
    title: "Compliance before carriers",
    copy: "Live SMS stays dark until A2P approval, provider config, and an explicit compliance flag all line up. Wrong config fails closed — never quietly sends.",
  },
  {
    icon: Clock3,
    title: "Quiet hours in business time",
    copy: "The 8:00–19:59 send window evaluates in America/Denver (or the business timezone), not Vercel UTC — so evening Mountain Time never slips through on a UTC hour check.",
  },
  {
    icon: MessageSquare,
    title: "Registered copy is frozen",
    copy: "Templates match the approved Twilio A2P samples character-for-character, including STOP language on first touch and the em-dashes the campaign registered.",
  },
];

export default function PortfolioPreviewPage() {
  return (
    <div className="preview-page min-h-screen bg-[var(--shell-bg,#0B0F14)] text-[var(--shell-text,#E2E8F0)]">
      <style>{`
        @keyframes preview-rise {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes preview-glow {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.55; }
        }
        @keyframes preview-thread {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .preview-rise { animation: preview-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .preview-rise-delay-1 { animation-delay: 120ms; }
        .preview-rise-delay-2 { animation-delay: 240ms; }
        .preview-rise-delay-3 { animation-delay: 360ms; }
        .preview-glow {
          animation: preview-glow 6s ease-in-out infinite;
        }
        .preview-thread > li {
          animation: preview-thread 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .preview-thread > li:nth-child(1) { animation-delay: 280ms; }
        .preview-thread > li:nth-child(2) { animation-delay: 420ms; }
        .preview-thread > li:nth-child(3) { animation-delay: 560ms; }
        .preview-thread > li:nth-child(4) { animation-delay: 700ms; }
        @media (prefers-reduced-motion: reduce) {
          .preview-rise,
          .preview-glow,
          .preview-thread > li {
            animation: none !important;
          }
        }
      `}</style>

      <div
        aria-hidden
        className="preview-glow pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.28),transparent_58%)]"
      />

      <header className="relative z-10 border-b border-white/8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">FollowUp</span>
          </Link>
          <p className="hidden text-xs tracking-wide text-slate-400 sm:block">
            Portfolio product preview · read-only demo UI
          </p>
          <Link
            href="/"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className:
                "border-white/15 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white",
            })}
          >
            Back to site
          </Link>
        </div>
      </header>

      {/* Hero: one composition — brand, headline, line, CTA, product plane */}
      <section className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 pb-8 pt-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-end lg:gap-10 lg:pb-16 lg:pt-20">
        <div className="preview-rise max-w-xl">
          <p className="text-sm font-medium tracking-[0.14em] text-sky-300/90 uppercase">
            FollowUp CRM
          </p>
          <h1 className="preview-rise preview-rise-delay-1 mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.08]">
            Compliant SMS follow-ups that local operators can actually run.
          </h1>
          <p className="preview-rise preview-rise-delay-2 mt-5 max-w-md text-base leading-relaxed text-slate-300 sm:text-lg">
            A Next.js + Supabase CRM with an A2P-gated Twilio loop: capture the
            lead, send the registered first touch, follow up on a short cadence,
            then stop.
          </p>
          <div className="preview-rise preview-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#product-mock"
              className={buttonVariants({
                size: "lg",
                className: "bg-primary text-primary-foreground hover:bg-primary/90",
              })}
            >
              See the product surface
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
            <Link
              href="/signup"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className:
                  "border-white/15 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white",
              })}
            >
              Try the live app
            </Link>
          </div>
        </div>

        <div id="product-mock" className="preview-rise preview-rise-delay-2">
          <ProductMock />
        </div>
      </section>

      {/* Sequence — one job */}
      <section className="relative z-10 border-t border-white/8 bg-[#0A0E13]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Four touches. Then stop.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            Evidence-backed cadence: instant first response, a short no-reply
            tail, hard caps, and stop conditions on reply, booking, opt-out, or
            sequence exhaustion.
          </p>
          <ol className="preview-thread mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SEQUENCE.map((step) => (
              <li
                key={step.when}
                className={cn(
                  "rounded-xl border p-4",
                  step.tone === "inbound"
                    ? "border-emerald-400/25 bg-emerald-400/5"
                    : "border-white/10 bg-white/[0.03]"
                )}
              >
                <p className="text-xs font-medium tracking-wide text-sky-300/90 uppercase">
                  {step.when}
                </p>
                <p className="mt-2 text-sm font-medium text-white">{step.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Engineering decisions — one job */}
      <section className="relative z-10 border-t border-white/8">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Built for hiring-manager scrutiny
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            The interesting work is not another CRM shell — it is the delivery
            gates, timezone correctness, and copy discipline carriers actually
            enforce.
          </p>
          <ul className="mt-10 grid gap-8 lg:grid-cols-3">
            {DECISIONS.map((item) => (
              <li key={item.title} className="max-w-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-sky-300">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.copy}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Stack strip */}
      <section className="relative z-10 border-t border-white/8 bg-[#0A0E13]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium tracking-wide text-slate-300 uppercase">
              Stack
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Next.js App Router · Supabase Auth/Postgres/RLS · Twilio A2P ·
              Resend · Vercel
            </p>
          </div>
          <Link
            href="/login"
            className={buttonVariants({
              variant: "outline",
              className:
                "border-white/15 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white",
            })}
          >
            Open signed-in product
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            FollowUp CRM · portfolio preview for hiring managers
          </p>
          <p className="text-xs text-slate-600">
            Demo UI only — no live SMS from this page
          </p>
        </div>
      </footer>
    </div>
  );
}

function ProductMock() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#11161D] shadow-[0_30px_80px_-40px_rgba(37,99,235,0.55)]"
      role="img"
      aria-label="Mock of the FollowUp messages console showing failed and delivered SMS follow-ups"
    >
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
        </div>
        <p className="text-xs text-slate-500">Messages · Peak Detail Co</p>
        <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
          1 T+0 failed
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-white/8 px-4 py-3 text-center">
        <Metric label="Total" value="48" />
        <Metric label="Outbound" value="31" />
        <Metric label="Send failed" value="1" emphasis />
      </div>

      <ul className="divide-y divide-white/6">
        <MockRow
          name="Alex Rivera"
          kind="T+0"
          status="Failed · quiet_hours"
          preview="Hi Alex, this is Peak Detail Co — got your request about full detail…"
          failed
        />
        <MockRow
          name="Jordan Lee"
          kind="Day 1"
          status="Sent"
          preview="Peak Detail Co here — still happy to help with ceramic coating…"
        />
        <MockRow
          name="Sam Okonkwo"
          kind="Inbound"
          status="Received"
          preview="Can you do Saturday morning?"
        />
      </ul>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-2 py-2",
        emphasis ? "bg-rose-500/10" : "bg-white/[0.03]"
      )}
    >
      <p className={cn("text-lg font-semibold", emphasis ? "text-rose-300" : "text-white")}>
        {value}
      </p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function MockRow({
  name,
  kind,
  status,
  preview,
  failed,
}: {
  name: string;
  kind: string;
  status: string;
  preview: string;
  failed?: boolean;
}) {
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-slate-100">{name}</p>
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
            SMS
          </span>
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
            {kind}
          </span>
          {failed && (
            <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">
              T+0 failed
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{preview}</p>
      </div>
      <p
        className={cn(
          "shrink-0 text-xs",
          failed ? "text-rose-300" : "text-slate-500"
        )}
      >
        {status}
      </p>
    </li>
  );
}
