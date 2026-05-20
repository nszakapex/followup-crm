import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export default function MessagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-muted-foreground mt-1">
          All SMS and email conversations with your leads.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="font-medium text-muted-foreground">No messages yet</h3>
          <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
            Messages will appear here as you send follow-ups and receive replies from
            leads. Both SMS and email conversations are tracked.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
