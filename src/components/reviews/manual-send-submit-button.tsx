"use client";

import type { MouseEvent } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReviewSendMode } from "@/lib/reviews/provider-readiness";

export function ManualSendSubmitButton({
  mode,
  label,
  confirmationTitle,
  confirmationBody,
  disabled = false,
}: {
  mode: ReviewSendMode | null;
  label: string;
  confirmationTitle: string;
  confirmationBody: string;
  disabled?: boolean;
}) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (mode !== "live") return;

    const confirmed = window.confirm(`${confirmationTitle}\n\n${confirmationBody}`);

    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <Button type="submit" size="sm" disabled={disabled} onClick={handleClick}>
      <Send className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
