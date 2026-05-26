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

type ForgotPasswordPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    message?: string | string[];
  }>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getErrorMessage(error: string | string[] | undefined) {
  const code = getSingleParam(error);

  if (code === "missing") return "Enter the email address for your account.";
  if (code === "failed") return "Password reset could not be started. Try again.";

  return null;
}

function getSuccessMessage(message: string | string[] | undefined) {
  const code = getSingleParam(message);

  if (code === "sent") {
    return "If that email has an account, a password reset link has been sent.";
  }

  return null;
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const error = getErrorMessage(params?.error);
  const message = getSuccessMessage(params?.message);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-semibold">Reset password</CardTitle>
        <CardDescription>
          Enter your account email and we&apos;ll send a secure reset link.
        </CardDescription>
      </CardHeader>
      <form action="/api/auth/request-password-reset" method="post">
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-md bg-primary/10 px-4 py-3 text-sm text-primary">
              {message}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <button
            type="submit"
            className={buttonVariants({ className: "w-full" })}
          >
            Send reset link
          </button>
          <Link
            href="/login"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
