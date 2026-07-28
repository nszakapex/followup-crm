"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLead } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";

export function AddLeadDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createLead(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.id) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4 mr-2" />
        Add Lead
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Add a new lead</DialogTitle>
          <DialogDescription>
            Enter the lead&apos;s contact details. They&apos;ll appear in your leads list right away.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name *</Label>
              <Input id="first_name" name="first_name" placeholder="Sarah" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" placeholder="Miller" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="sarah@example.com" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" placeholder="Miller Homes" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_interest">Interest</Label>
              <Input id="service_interest" name="service_interest" placeholder="Estimate, booking, quote" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Input id="source" name="source" placeholder="e.g. Website, Referral, Google" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next_followup_at">Next follow-up</Label>
            <Input id="next_followup_at" name="next_followup_at" type="datetime-local" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" placeholder="What are they interested in?" rows={3} />
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border p-3">
            <input
              id="sms_consent"
              name="sms_consent"
              type="checkbox"
              value="granted"
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div className="space-y-1">
              <Label htmlFor="sms_consent">SMS consent obtained</Label>
              <p className="text-xs text-muted-foreground">
                Check only if this customer verbally agreed to receive texts about their
                request. This is recorded for SMS compliance.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isPending ? "Adding..." : "Add Lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
