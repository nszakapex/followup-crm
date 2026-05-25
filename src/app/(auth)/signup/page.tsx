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

type SignupPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    message?: string | string[];
  }>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getErrorMessage(error: string | string[] | undefined) {
  const errorCode = getSingleParam(error);

  if (errorCode === "missing") {
    return "All fields are required.";
  }

  if (errorCode === "password") {
    return "Password must be at least 8 characters.";
  }

  if (errorCode === "rate_limit") {
    return "Supabase is rate limiting signup emails. For local smoke testing, disable email confirmation in Supabase Auth settings, then try again.";
  }

  if (errorCode === "invalid_email") {
    return "Supabase rejected that email address. Use a real test email address instead of an example.com placeholder.";
  }

  if (errorCode === "already_registered") {
    return "That email is already registered. Try signing in or use a different test email.";
  }

  if (errorCode === "server_setup") {
    return "Account authentication succeeded, but server-side Supabase setup is missing. Check SUPABASE_SERVICE_ROLE_KEY in .env.local.";
  }

  if (errorCode === "business_setup") {
    return "Account authentication succeeded, but business setup failed. Check the server console for the Supabase database error.";
  }

  if (errorCode === "profile_setup") {
    return "Account authentication succeeded, but user profile setup failed. Check the server console for the Supabase database error.";
  }

  if (errorCode === "signup_failed") {
    return "Signup failed. Check the server console for the Supabase auth error.";
  }

  if (errorCode === "stale_action") {
    return "The signup page refreshed after a local app update. Try creating the account again.";
  }

  return null;
}

function getSuccessMessage(message: string | string[] | undefined) {
  const messageCode = getSingleParam(message);

  if (messageCode === "confirm") {
    return "Account created. Confirm your email, then sign in to continue onboarding.";
  }

  return null;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const error = getErrorMessage(params?.error);
  const message = getSuccessMessage(params?.message);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-semibold">Get started</CardTitle>
        <CardDescription>
          Create your account and set up automated follow-ups in minutes
        </CardDescription>
      </CardHeader>
      <form action="/api/auth/signup" method="post">
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
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Jane Smith"
              required
            />
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <button
            type="submit"
            className={buttonVariants({ className: "w-full" })}
          >
            Create account
          </button>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
