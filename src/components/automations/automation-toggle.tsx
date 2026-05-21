"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  function handleToggle(checked: boolean) {
    setOptimistic(checked);
    startTransition(async () => {
      const result = await toggleAutomation(automationId, checked);
      if (result?.error) {
        setOptimistic(!checked); // revert
        toast.error(result.error);
      } else {
        toast.success(checked ? "Automation turned on" : "Automation turned off");
      }
      router.refresh();
    });
  }

  return (
    <Switch
      checked={optimistic}
      onCheckedChange={handleToggle}
      disabled={isPending}
    />
  );
}
