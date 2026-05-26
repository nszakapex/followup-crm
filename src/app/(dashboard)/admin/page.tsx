import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Building2, Lock, Users, Zap } from "lucide-react";
import { requireAdmin } from "@/lib/admin/require-admin";

export default async function AdminPage() {
  const admin = await requireAdmin();

  if (!admin.authorized) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Portal</h1>
          <p className="text-muted-foreground mt-1">
            Internal tools are restricted to admin users.
          </p>
        </div>

        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Lock className="mb-3 h-10 w-10 text-amber-600/70" />
            <h3 className="font-medium text-foreground">Admin access required</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              This workspace account is not authorized to view internal diagnostics
              or cross-business administration. No internal data was loaded.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Portal</h1>
        <p className="text-muted-foreground mt-1">
          Manage all businesses, leads, and system health.
        </p>
      </div>

      <Tabs defaultValue="businesses">
        <TabsList>
          <TabsTrigger value="businesses">Businesses</TabsTrigger>
          <TabsTrigger value="leads">All Leads</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="businesses" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-muted-foreground">No businesses yet</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Businesses will appear here as users sign up.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-muted-foreground">No leads across all businesses</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                All leads across all businesses will be visible here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automations" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Zap className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-muted-foreground">Automation status</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                View and manage automations across all businesses.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-medium text-muted-foreground">No errors</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Failed automations, messages, and webhook errors will appear here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
