import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type UpdatePasswordPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getErrorMessage(error: string | string[] | undefined) {
  const code = getSingleParam(error);

  if (code === "missing") return "Enter and confirm your new password.";
  if (code === "mismatch") return "The two passwords do not match.";
  if (code === "password") return "Password must be at least 8 characters.";
  if (code === "session") return "Reset session expired. Request a new password reset link.";
  if (code === "failed") return "Password could not be updated. Request a new reset link.";

  return null;
}

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
  const params = await searchParams;
  const error = getErrorMessage(params?.error);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-semibold">Choose a new password</CardTitle>
        <CardDescription>
          Use the reset link from your email, then save a new password here.
        </CardDescription>
      </CardHeader>
      <form action="/api/auth/update-password" method="post">
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat the new password"
              required
              minLength={8}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <button
            type="submit"
            className={buttonVariants({ className: "w-full" })}
          >
            Update password
          </button>
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Request a new reset link
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
