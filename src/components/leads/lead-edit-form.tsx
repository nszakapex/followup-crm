"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { updateLead } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Lead } from "@/types/database";

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function LeadEditForm({ lead }: { lead: Lead }) {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateLead(lead.id, formData);
      if (result?.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      setMessage({ type: "success", text: "Lead saved." });
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {message && (
        <div
          className={
            message.type === "error"
              ? "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
          }
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit_first_name">First name</Label>
          <Input id="edit_first_name" name="first_name" defaultValue={lead.first_name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit_last_name">Last name</Label>
          <Input id="edit_last_name" name="last_name" defaultValue={lead.last_name ?? ""} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit_phone">Phone</Label>
          <Input id="edit_phone" name="phone" type="tel" defaultValue={lead.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit_email">Email</Label>
          <Input id="edit_email" name="email" type="email" defaultValue={lead.email ?? ""} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit_company">Company</Label>
          <Input id="edit_company" name="company" defaultValue={lead.company ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit_source">Source</Label>
          <Input id="edit_source" name="source" defaultValue={lead.source ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit_service_interest">Interest</Label>
        <Input
          id="edit_service_interest"
          name="service_interest"
          defaultValue={lead.service_interest ?? ""}
          placeholder="Service, package, or request"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit_next_followup_at">Next follow-up</Label>
        <Input
          id="edit_next_followup_at"
          name="next_followup_at"
          type="datetime-local"
          defaultValue={toDateTimeLocal(lead.next_followup_at)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit_notes">Notes</Label>
        <Textarea id="edit_notes" name="notes" defaultValue={lead.notes ?? ""} rows={4} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? "Saving..." : "Save lead"}
      </Button>
    </form>
  );
}
