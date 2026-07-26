"use client";

import { Button } from "@/components";

/**
 * Prev/next pager for the users list. Kept minimal — a numbered pager is not
 * warranted for staff-user volumes. Renders nothing when there is at most one
 * page. Driven by useUsers: `onPageChange` sets the query's page.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 pt-1">
      <p className="text-sm text-muted">
        Page {page} of {totalPages} · {total} user{total === 1 ? "" : "s"}
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
