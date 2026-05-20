import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Mail,
  CheckCircle,
  Star,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lead Details</h1>
          <p className="text-muted-foreground mt-1">Lead ID: {id}</p>
        </div>
        <Badge variant="secondary">New</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Connect your Supabase database to see lead details and AI-generated summaries
                here.
              </p>
            </CardContent>
          </Card>

          {/* Message History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No messages yet. Messages will appear here as they are sent and received.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" variant="outline">
                <MessageSquare className="h-4 w-4 mr-2" />
                Send SMS
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
              <Separator className="my-3" />
              <Button className="w-full justify-start" variant="outline">
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Booked
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Completed
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Star className="h-4 w-4 mr-2" />
                Send Review Request
              </Button>
              <Button className="w-full justify-start text-destructive" variant="outline">
                <XCircle className="h-4 w-4 mr-2" />
                Mark Lost
              </Button>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Info</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Contact details will appear here once a lead is loaded.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
