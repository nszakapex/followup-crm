"use client";

import { useTransition, useState } from "react";
import { updateBusinessSettings } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBusinessVerticalOptions } from "@/lib/business-verticals/verticals";
import { Loader2 } from "lucide-react";
import type { Business } from "@/types/database";

const verticalOptions = getBusinessVerticalOptions();

export function BusinessSettingsForm({ business }: { business: Business }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateBusinessSettings(formData);
      if (result?.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Settings saved." });
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {message && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            message.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-50 text-green-700"
          }`}
        >
          {message.text}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" name="name" defaultValue={business.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="industry">Industry</Label>
        <Input
          id="industry"
          name="industry"
          defaultValue={business.industry || ""}
          list="business-vertical-options"
          placeholder="e.g. Restaurant, Contractor, Auto detailing"
        />
        <datalist id="business-vertical-options">
          {verticalOptions.map((vertical) => (
            <option key={vertical.id} value={vertical.id}>
              {vertical.label}
            </option>
          ))}
        </datalist>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="owner_name">Owner name</Label>
          <Input id="owner_name" name="owner_name" defaultValue={business.owner_name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="owner_email">Owner email</Label>
          <Input
            id="owner_email"
            name="owner_email"
            type="email"
            defaultValue={business.owner_email}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="owner_phone">Owner phone</Label>
          <Input
            id="owner_phone"
            name="owner_phone"
            defaultValue={business.owner_phone || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website_url">Website</Label>
          <Input
            id="website_url"
            name="website_url"
            defaultValue={business.website_url || ""}
            placeholder="https://yourbusiness.com"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input
          id="timezone"
          name="timezone"
          defaultValue={business.timezone || "America/Denver"}
          placeholder="America/Denver"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
