import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus } from "lucide-react";

const filters = ["All", "New", "Needs Reply", "Booked", "Completed", "Review Requested", "Lost"];

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1">
            All your potential customers in one place.
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Lead
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Badge
            key={filter}
            variant={filter === "All" ? "default" : "secondary"}
            className="cursor-pointer px-3 py-1 text-sm"
          >
            {filter}
          </Badge>
        ))}
      </div>

      {/* Empty state */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="font-medium text-muted-foreground">No leads yet</h3>
          <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
            Leads will appear here as they come in from your website, forms, or webhook
            connections. You can also add them manually.
          </p>
          <Button variant="outline" className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Add your first lead
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
