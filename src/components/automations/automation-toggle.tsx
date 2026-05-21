"use client";

import { useState, useTransition } from "react";
import { toggleAutomation } from "@/app/actions/automations";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function AutomationToggle({
  automationId,
  enabled,
}: {
  automationId: string;
  enabled: boolean;
}) {
  const [optimistic, setOptimistic] = useState(enabled);
  const [isPending, startTransition] = useTransition();

  // Stable id so a new attempt replaces (not stacks) this toggle's toast,
  // and so we can clear any prior error state before each attempt.
  const toastId = `automation-toggle-${automationId}`;

  function handleToggle(checked: boolean) {
    if (isPending) return;

    toast.dismiss(toastId); // clear previous status before this attempt
    setOptimistic(checked); // optimistic: render immediately

    startTransition(async () => {
      const result = await toggleAutomation(automationId, checked);

      // Only a real failure (success === false) is an error. Never treat a
      // successful/undefined-error response as a failure.
      if (result?.success) {
        setOptimistic(result.enabled); // keep the persisted state
        toast.success(
          result.enabled ? "Automation turned on" : "Automation turned off",
          { id: toastId }
        );
        return;
      }

      setOptimistic(!checked); // revert only on a real error
      toast.error(result?.error ?? "Unknown error", { id: toastId });
    });
  }

  return (
    <Switch
      checked={optimistic}
      onCheckedChange={handleToggle}
      disabled={isPending}
      aria-busy={isPending}
      className="data-disabled:cursor-default"
    />
  );
}
