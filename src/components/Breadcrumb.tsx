import { Fragment } from "react";
import Link from "next/link";

export interface Crumb {
  label: string;
  /** Omit on the crumb for the page you are already on. */
  href?: string;
}

export interface BreadcrumbProps {
  items: Crumb[];
  className?: string;
}

/**
 * The trail above a page title.
 *
 * REPLACES A SINGLE "← back" LINK, which could only ever name one step. A page
 * two levels deep — Inventory → Produk & Varian → Produk baru — had no way to
 * say so, and a user who arrived from a search or a bookmark could not tell
 * where they were without reading the URL.
 *
 * The last crumb carries no `href` and is marked `aria-current="page"`: linking
 * a page to itself gives a screen reader a destination that goes nowhere, and
 * gives a mouse user a link that appears broken. It is styled in the foreground
 * colour rather than the muted one, so where you are reads differently from
 * where you can go — the trail has to be legible at a glance, not decoded.
 *
 * A trail whose last entry DOES carry an `href` still renders, as a link. That
 * is for a crumb that genuinely points elsewhere, not for the current page.
 *
 * The separators are `aria-hidden`: they are punctuation, and a reader that
 * announced "slash" between every level would make the trail slower to hear
 * than the page it introduces.
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <li aria-hidden="true" className="select-none text-muted/60">
                /
              </li>
            )}
            <li>
              {item.href ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
