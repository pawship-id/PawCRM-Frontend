"use client";

import { Button } from "./Button";

/**
 * Numbered pager for master-data list screens. Shows the page numbers
 * (1 2 3 …) with a windowed range and ellipses so it stays compact even with
 * many pages, flanked by Sebelumnya / Berikutnya. Renders nothing when there is
 * at most one page. Driven by the list hook: `onPageChange` sets the query's
 * page.
 *
 * `unit` labels the total count so each screen reads naturally — "12 pengguna",
 * "3 cabang".
 *
 * `unitPlural` IS VESTIGIAL AND DEFAULTS TO `unit`. It was written when this
 * component spoke English, where the plural is irregular enough to be worth a
 * prop. Indonesian does not inflect for number — "3 produk", not "3 produks" —
 * so passing it is almost always the same word twice. It stays because 27 call
 * sites pass it and removing it is churn for nothing; what changed is the
 * DEFAULT, which used to be `${unit}s` and quietly appended an English plural to
 * an Indonesian noun for anyone who omitted it.
 */

/** Marks a gap in the numbered range where pages are collapsed. */
const ELLIPSIS = "ellipsis";
type PageItem = number | typeof ELLIPSIS;

/**
 * The pages to render: always the first and last, plus the current page and one
 * neighbour on each side, with an ellipsis bridging any gap wider than one. When
 * the gap is exactly one page, that single page is shown instead of an ellipsis
 * — hiding one number behind "…" saves nothing and just costs a click.
 */
export function getPageItems(current: number, total: number): PageItem[] {
  const SIBLINGS = 1;

  // With two boundaries, the current page + one sibling each side, and two
  // ellipses, the collapsed form is at most 7 slots. At or below that, every
  // page fits without collapsing — an ellipsis would hide nothing, so show all.
  const MAX_UNCOLLAPSED = 2 + (2 * SIBLINGS + 1) + 2;
  if (total <= MAX_UNCOLLAPSED) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const kept: number[] = [];

  for (let page = 1; page <= total; page += 1) {
    const isEdge = page === 1 || page === total;
    const isNearCurrent =
      page >= current - SIBLINGS && page <= current + SIBLINGS;
    if (isEdge || isNearCurrent) kept.push(page);
  }

  const items: PageItem[] = [];
  let previous: number | undefined;
  for (const page of kept) {
    if (previous !== undefined) {
      if (page - previous === 2) items.push(previous + 1);
      else if (page - previous > 2) items.push(ELLIPSIS);
    }
    items.push(page);
    previous = page;
  }

  return items;
}

export function Pagination({
  page,
  totalPages,
  total,
  unit = "item",
  /*
    DEFAULTS TO `unit`, not `${unit}s`. Indonesian does not inflect for number,
    and the old default silently produced "produks" for every caller that
    omitted this — see the header.
  */
  unitPlural = unit,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  /** Noun for the count, e.g. "produk", "cabang". */
  unit?: string;
  /** Vestigial — defaults to `unit`. See the header. */
  unitPlural?: string;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const items = getPageItems(page, totalPages);

  return (
    <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted">
        Halaman {page} dari {totalPages} · {total}{" "}
        {total === 1 ? unit : unitPlural}
      </p>

      <nav
        className="flex flex-wrap items-center gap-1.5"
        aria-label="Paginasi"
      >
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Sebelumnya
        </Button>

        {items.map((item, index) =>
          item === ELLIPSIS ? (
            <span
              key={`ellipsis-${index}`}
              className="px-1.5 text-sm text-muted select-none"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? "primary" : "secondary"}
              className="min-w-9 px-0"
              aria-label={`Halaman ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}

        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Berikutnya
        </Button>
      </nav>
    </div>
  );
}
