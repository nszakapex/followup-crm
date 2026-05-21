"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAutomationTemplate } from "@/app/actions/automations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";

export function EditTemplateDialog({
  automationId,
  automationName,
  currentTemplate,
}: {
  automationId: string;
  automationName: string;
  currentTemplate: string;
}) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState(currentTemplate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateAutomationTemplate(automationId, template);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setTemplate(currentTemplate);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Pencil className="h-3 w-3 mr-1" />
        Edit message
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit message template</DialogTitle>
          <DialogDescription>{automationName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={5}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Available placeholders:{" "}
              <code className="bg-muted px-1 rounded">{"{{first_name}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{last_name}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{business_name}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{google_review_link}}"}</code>
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isPending ? "Saving..." : "Save template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
