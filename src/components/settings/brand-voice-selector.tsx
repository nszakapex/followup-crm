"use client";

import { useTransition } from "react";
import { updateBrandVoice } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import type { BrandVoice } from "@/types/database";

const voices: { label: string; value: BrandVoice }[] = [
  { label: "Friendly", value: "friendly" },
  { label: "Professional", value: "professional" },
  { label: "Premium", value: "premium" },
  { label: "Casual", value: "casual" },
  { label: "Direct", value: "direct" },
  { label: "Warm", value: "warm" },
];

export function BrandVoiceSelector({ currentVoice }: { currentVoice: BrandVoice }) {
  const [isPending, startTransition] = useTransition();

  function handleSelect(voice: BrandVoice) {
    startTransition(async () => {
      await updateBrandVoice(voice);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {voices.map((voice) => (
        <Button
          key={voice.value}
          variant={currentVoice === voice.value ? "default" : "outline"}
          size="sm"
          disabled={isPending}
          onClick={() => handleSelect(voice.value)}
        >
          {voice.label}
        </Button>
      ))}
    </div>
  );
}
