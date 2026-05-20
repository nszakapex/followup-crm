"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLeadNote } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";

export function AddNoteForm({ leadId }: { leadId: string }) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;

    startTransition(async () => {
      const result = await addLeadNote(leadId, note.trim());
      if (!result?.error) {
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Textarea
        placeholder="Add a note..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="flex-1"
      />
      <Button type="submit" size="icon" disabled={isPending || !note.trim()}>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </form>
  );
}
