import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Send, ExternalLink } from "lucide-react";

export default function ReviewsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="text-muted-foreground mt-1">
          Send real customers a simple request to leave an honest Google review.
        </p>
      </div>

      {/* Review link status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Review Link</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <Badge variant="secondary">Not configured</Badge>
            <p className="text-sm text-muted-foreground mt-2">
              Add your Google review link in Settings to start sending review requests.
            </p>
          </div>
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4 mr-2" />
            Set up in Settings
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Requests Sent This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Links Clicked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Click Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">—</div>
          </CardContent>
        </Card>
      </div>

      {/* Manual send */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send Review Request</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Send a review request to a customer who completed their service. They&apos;ll receive
            a message with your Google review link.
          </p>
          <Button disabled>
            <Send className="h-4 w-4 mr-2" />
            Send Review Request
          </Button>
        </CardContent>
      </Card>

      {/* Recent requests */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Requests</h2>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Star className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-muted-foreground">No review requests sent yet</h3>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
              When you send review requests, they&apos;ll appear here so you can track who
              received one and whether they clicked the link.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
