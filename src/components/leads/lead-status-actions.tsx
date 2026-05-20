"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLeadStatus } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Mail,
  CheckCircle,
  Star,
  XCircle,
  Phone,
  Loader2,
} from "lucide-react";
import type { LeadStatus } from "@/types/database";

export function LeadStatusActions({ leadId, currentStatus }: { leadId: string; currentStatus: LeadStatus }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleStatusChange(status: LeadStatus) {
    startTransition(async () => {
      const result = await updateLeadStatus(leadId, status);
      if (!result?.error) {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button className="w-full justify-start" variant="outline" disabled>
        <MessageSquare className="h-4 w-4 mr-2" />
        Send SMS
      </Button>
      <Button className="w-full justify-start" variant="outline" disabled>
        <Mail className="h-4 w-4 mr-2" />
        Send Email
      </Button>
      <Separator className="my-3" />
      {currentStatus !== "contacted" && (
        <Button
          className="w-full justify-start"
          variant="outline"
          disabled={isPending}
          onClick={() => handleStatusChange("contacted")}
        >
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
          Mark Contacted
        </Button>
      )}
      {currentStatus !== "booked" && (
        <Button
          className="w-full justify-start"
          variant="outline"
          disabled={isPending}
          onClick={() => handleStatusChange("booked")}
        >
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Mark Booked
        </Button>
      )}
      {currentStatus !== "completed" && (
        <Button
          className="w-full justify-start"
          variant="outline"
          disabled={isPending}
          onClick={() => handleStatusChange("completed")}
        >
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Mark Completed
        </Button>
      )}
      {currentStatus !== "review_requested" && currentStatus === "completed" && (
        <Button
          className="w-full justify-start"
          variant="outline"
          disabled={isPending}
          onClick={() => handleStatusChange("review_requested")}
        >
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Star className="h-4 w-4 mr-2" />}
          Send Review Request
        </Button>
      )}
      {currentStatus !== "lost" && (
        <Button
          className="w-full justify-start text-destructive"
          variant="outline"
          disabled={isPending}
          onClick={() => handleStatusChange("lost")}
        >
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
          Mark Lost
        </Button>
      )}
    </div>
  );
}
