import type { ReactNode } from "react";
import { Logo } from "@/components";

/**
 * Shell for the public auth screens (login, forgot, reset): a centered card on
 * the warm brand background, with the logo above it. Kept purely presentational
 * — each page supplies its own heading and form.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={48} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          © PawShip — pet care, organized.
        </p>
      </div>
    </main>
  );
}
