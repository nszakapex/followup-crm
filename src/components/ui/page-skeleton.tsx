import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton({ variant = "default" }: { variant?: "default" | "chart" }) {
  return (
    <div className="space-y-8">
      <div className="border-b border-border/60 pb-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-10 w-64" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-5 p-5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-4 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={variant === "chart" ? "grid gap-6 lg:grid-cols-[1.35fr_0.65fr]" : "grid gap-6"}>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </CardHeader>
          <CardContent>
            <Skeleton className={variant === "chart" ? "h-72 w-full" : "h-48 w-full"} />
          </CardContent>
        </Card>
        {variant === "chart" && (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
