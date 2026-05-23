"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getManualReviewRequestPreflight,
  sendManualReviewRequest,
} from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { ManualReviewSendPreflight } from "@/lib/reviews/send-preflight";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type ReviewLeadOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  opted_out: boolean;
};

export function SendReviewRequestDialog({
  leads,
  hasGoogleReviewLink,
}: {
  leads: ReviewLeadOption[];
  hasGoogleReviewLink: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id ?? "");
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<ManualReviewSendPreflight | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isChecking, startCheckTransition] = useTransition();
  const router = useRouter();

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  );

  const missingDestination =
    channel === "sms" ? !selectedLead?.phone : !selectedLead?.email;
  const smsBlocked = channel === "sms" && Boolean(selectedLead?.opted_out);
  const canSubmit =
    Boolean(selectedLead) &&
    !smsBlocked &&
    !isPending &&
    !isChecking &&
    Boolean(preflight) &&
    (preflight?.mode !== "live" || liveConfirmed);

  function refreshPreflight(leadId: string, nextChannel: "sms" | "email") {
    if (!leadId) return;

    const formData = new FormData();
    formData.set("lead_id", leadId);
    formData.set("channel", nextChannel);
    setPreflight(null);
    setPreflightError(null);
    setLiveConfirmed(false);

    startCheckTransition(async () => {
      const result = await getManualReviewRequestPreflight(formData);

      if (!result.success) {
        setPreflightError(result.error);
        return;
      }

      setPreflight(result.preflight);
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const result = await sendManualReviewRequest(formData);

      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(result.message ?? "Review request sent");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setSelectedLeadId(leads[0]?.id ?? "");
          setChannel("sms");
          setError(null);
          setPreflight(null);
          setPreflightError(null);
          setLiveConfirmed(false);
          refreshPreflight(leads[0]?.id ?? "", "sms");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button disabled={!hasGoogleReviewLink || leads.length === 0}>
            <Send className="h-4 w-4 mr-2" />
            Send Review Request
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send review request</DialogTitle>
          <DialogDescription>
            Send real customers a simple request to leave an honest Google review.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <input type="hidden" name="channel" value={channel} />

          <div className="space-y-2">
            <Label htmlFor="lead_id">Customer</Label>
            <select
              id="lead_id"
              name="lead_id"
              value={selectedLeadId}
              onChange={(event) => {
                const nextLeadId = event.target.value;
                setSelectedLeadId(nextLeadId);
                refreshPreflight(nextLeadId, channel);
              }}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              required
            >
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {[lead.first_name, lead.last_name].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Channel</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={channel === "sms" ? "default" : "outline"}
                onClick={() => {
                  setChannel("sms");
                  refreshPreflight(selectedLeadId, "sms");
                }}
              >
                SMS
              </Button>
              <Button
                type="button"
                variant={channel === "email" ? "default" : "outline"}
                onClick={() => {
                  setChannel("email");
                  refreshPreflight(selectedLeadId, "email");
                }}
              >
                Email
              </Button>
            </div>
          </div>

          {selectedLead && (
            <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              <div className="grid gap-1 sm:grid-cols-2">
                <span>Phone: {selectedLead.phone || "Not added"}</span>
                <span>Email: {selectedLead.email || "Not added"}</span>
              </div>
              {(missingDestination || smsBlocked) && (
                <p
                  className={cn(
                    "mt-2 text-sm",
                    smsBlocked ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {smsBlocked
                    ? "This customer has opted out of review requests."
                    : `Add a ${channel === "sms" ? "phone number" : "email address"} before sending by ${channel.toUpperCase()}.`}
                </p>
              )}
            </div>
          )}

          <div
            className={cn(
              "rounded-lg border p-3 text-sm",
              preflight?.mode === "live"
                ? "border-emerald-500/25 bg-emerald-500/5"
                : preflight?.mode === "blocked"
                  ? "border-amber-500/25 bg-amber-500/5"
                  : "border-border/70 bg-muted/30"
            )}
          >
            <div className="flex items-start gap-2">
              {preflight?.mode === "live" ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : preflight?.mode === "blocked" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {isChecking
                    ? "Checking send readiness..."
                    : preflight?.safeReason ??
                      preflightError ??
                      "Send readiness will appear here."}
                </p>
                {preflight && (
                  <>
                    <p className="mt-1 leading-6 text-muted-foreground">
                      {preflight.confirmationBody}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>Mode: {preflight.mode}</span>
                      <span>Provider: {preflight.providerLabel}</span>
                      <span>Destination: {preflight.destinationSummary}</span>
                      <span>Duplicate risk: {preflight.duplicateRisk}</span>
                    </div>
                    {preflight.blockingIssues.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
                        {preflight.blockingIssues.slice(0, 3).map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {preflight?.mode === "live" && (
            <label className="flex gap-2 rounded-lg border border-border/70 bg-background p-3 text-sm leading-6">
              <input
                type="checkbox"
                checked={liveConfirmed}
                onChange={(event) => setLiveConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span>
                I understand this will attempt a real {channel.toUpperCase()} review request
                to {preflight.destinationSummary} and record it in review history.
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isPending
                ? "Processing..."
                : preflight?.submitLabel ?? "Check readiness"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
