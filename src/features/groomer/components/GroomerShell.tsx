"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Logo, Spinner } from "@/components";
import { useAuth } from "@/features/auth";

/**
 * The groomer's frame: one navy bar, one column, no sidebar.
 *
 * A sidebar is a desktop idea. This app is opened on a phone in a grooming room,
 * so the chrome is the name, the sign-out and nothing else; everything the
 * groomer does is in the page.
 *
 * Like DashboardShell it is the client half of the route guard: proxy.ts blocks
 * a hint-less request, and the /me verdict here is the authority.
 */
export function GroomerShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, user, signOut } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated" || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-primary">
        <Spinner size={28} />
      </div>
    );
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-primary px-4 text-primary-foreground">
        <Logo size={24} reversed />
        <div className="ml-auto flex items-center gap-1">
          <span className="max-w-[14ch] truncate text-sm font-medium text-primary-foreground/85">
            {user.fullName}
          </span>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            aria-label="Keluar"
            className="inline-flex size-11 items-center justify-center rounded-lg text-primary-foreground/85 transition-colors hover:bg-white/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
          >
            <LogOut className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
