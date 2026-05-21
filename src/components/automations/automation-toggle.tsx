"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAutomation } from "@/app/actions/automations";
import { Switch } from "@/components/ui/switch";

export function AutomationToggle({
  automationId,
  enabled,
}: {
  automationId: string;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      await toggleAutomation(automationId, checked);
      router.refresh();
    });
  }

  return (
    <Switch
      checked={enabled}
      onCheckedChange={handleToggle}
      disabled={isPending}
    />
  );
}
