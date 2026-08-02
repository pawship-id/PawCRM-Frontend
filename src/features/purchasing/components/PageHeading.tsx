import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The heading every purchasing page shares: an optional back link, a title, and
 * a sentence explaining what the screen is for.
 *
 * Extracted because eight pages repeated it, and a set of screens whose headers
 * drift apart stops reading as one module.
 */
export function PageHeading({
  backHref,
  backLabel,
  title,
  children,
}: {
  backHref?: string;
  backLabel?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div>
      {backHref && (
        <Link
          href={backHref}
          className="text-xs text-muted hover:text-foreground"
        >
          ← {backLabel}
        </Link>
      )}
      <h1 className="mt-1 text-2xl font-semibold text-foreground">{title}</h1>
      {children && (
        <p className="mt-1 max-w-2xl text-sm text-muted">{children}</p>
      )}
    </div>
  );
}
