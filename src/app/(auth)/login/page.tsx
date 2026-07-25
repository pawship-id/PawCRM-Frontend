import type { Metadata } from "next";
import { LoginForm } from "@/features/auth";

export const metadata: Metadata = { title: "Sign in · PawShip" };

/**
 * Only in-dashboard destinations are honored, so a crafted `?next=` cannot turn
 * login into an open redirect to another site.
 */
function safeNext(next: string | string[] | undefined): string | undefined {
  const value = Array.isArray(next) ? next[0] : next;
  return value && value.startsWith("/dashboard") ? value : undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          Sign in to your PawShip account.
        </p>
      </div>
      <LoginForm redirectTo={safeNext(next)} />
    </div>
  );
}
