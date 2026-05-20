import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Zap, Star } from "lucide-react";

const stats = [
  { name: "New Leads", value: "—", icon: Users, description: "Waiting for first contact" },
  { name: "Needs Reply", value: "—", icon: MessageSquare, description: "Leads who responded" },
  { name: "Follow-Ups Sent", value: "—", icon: Zap, description: "This month" },
  { name: "Review Requests", value: "—", icon: Star, description: "Sent this month" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening with your leads today.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.name}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Needs Attention */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Needs Attention</h2>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-muted-foreground">No leads yet</h3>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
              When leads come in, you&apos;ll see who needs attention here with AI-powered
              summaries and suggested next actions.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
