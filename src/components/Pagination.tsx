"use client";

import { Button } from "./Button";

/**
 * Prev/next pager for master-data list screens. Kept minimal — a numbered pager
 * is not warranted for the volumes these screens hold. Renders nothing when there
 * is at most one page. Driven by the list hook: `onPageChange` sets the query's
 * page.
 *
 * `unit`/`unitPlural` label the total count so each screen reads naturally
 * ("12 users", "3 branches") — English pluralization is irregular, so the plural
 * is a prop rather than a naive `${unit}s`.
 */
export function Pagination({
  page,
  totalPages,
  total,
  unit = "item",
  unitPlural = `${unit}s`,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  /** Singular noun for the count, e.g. "user", "branch". */
  unit?: string;
  /** Plural noun for the count, e.g. "users", "branches". */
  unitPlural?: string;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 pt-1">
      <p className="text-sm text-muted">
        Page {page} of {totalPages} · {total} {total === 1 ? unit : unitPlural}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
