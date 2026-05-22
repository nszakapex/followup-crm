"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendManualReviewRequest } from "@/app/actions/reviews";
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
import { cn } from "@/lib/utils";
import { Loader2, Send } from "lucide-react";
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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  );

  const missingDestination =
    channel === "sms" ? !selectedLead?.phone : !selectedLead?.email;
  const smsBlocked = channel === "sms" && Boolean(selectedLead?.opted_out);
  const canSend =
    hasGoogleReviewLink &&
    Boolean(selectedLead) &&
    !missingDestination &&
    !smsBlocked &&
    !isPending;

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
              onChange={(event) => setSelectedLeadId(event.target.value)}
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
                onClick={() => setChannel("sms")}
              >
                SMS
              </Button>
              <Button
                type="button"
                variant={channel === "email" ? "default" : "outline"}
                onClick={() => setChannel("email")}
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSend}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isPending ? "Sending..." : "Send request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
