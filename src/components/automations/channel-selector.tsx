"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAutomationChannel } from "@/app/actions/automations";
import { Button } from "@/components/ui/button";
import type { MessageChannel } from "@/types/database";

export function ChannelSelector({
  automationId,
  currentChannel,
}: {
  automationId: string;
  currentChannel: MessageChannel;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(channel: MessageChannel) {
    if (channel === currentChannel) return;
    startTransition(async () => {
      await updateAutomationChannel(automationId, channel);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-1">
      <Button
        size="xs"
        variant={currentChannel === "sms" ? "default" : "outline"}
        onClick={() => handleChange("sms")}
        disabled={isPending}
      >
        SMS
      </Button>
      <Button
        size="xs"
        variant={currentChannel === "email" ? "default" : "outline"}
        onClick={() => handleChange("email")}
        disabled={isPending}
      >
        Email
      </Button>
    </div>
  );
}
