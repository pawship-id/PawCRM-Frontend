import type { ReactNode } from "react";

import { Breadcrumb, type Crumb } from "@/components";

/**
 * The heading every purchasing page shares: the trail down to it, a title, and
 * a sentence explaining what the screen is for.
 *
 * Extracted because eight pages repeated it, and a set of screens whose headers
 * drift apart stops reading as one module.
 *
 * `crumbs` IS REQUIRED, not optional. This used to take a single `backHref`,
 * which could only ever name one step up — a page three levels deep (edit a
 * supplier) had no way to say where it sat, and somebody arriving from a
 * bookmark had to read the URL. Making the trail mandatory is what keeps a new
 * page from shipping without one; the ancestors come ready-made from
 * features/purchasing/crumbs.ts, so there is nothing to get wrong.
 */
export function PageHeading({
  crumbs,
  title,
  aside,
  children,
}: {
  /** Ancestors first, the current page last and WITHOUT an href. */
  crumbs: Crumb[];
  title: string;
  /**
   * Something that belongs ON the title line — a document's status beside its
   * number. Rendered next to the `h1`, not inside it, so the heading's name stays
   * the title a screen reader and a test both look for.
   */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <Breadcrumb items={crumbs} />
      {aside ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
          {aside}
        </div>
      ) : (
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">{title}</h1>
      )}
      {children && (
        <p className="mt-1 max-w-2xl text-sm text-muted">{children}</p>
      )}
    </div>
  );
}
