"use client";

import { useTransition, useState } from "react";
import { updateGoogleReviewLink } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export function ReviewLinkForm({ currentLink }: { currentLink: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateGoogleReviewLink(formData);
      if (result?.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "success", text: "Review link saved." });
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
        <Label htmlFor="google_review_link">Review link URL</Label>
        <Input
          id="google_review_link"
          name="google_review_link"
          defaultValue={currentLink || ""}
          placeholder="https://g.page/r/..."
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {isPending ? "Saving..." : "Save link"}
      </Button>
    </form>
  );
}
