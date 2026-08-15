"use client";

import { X } from "lucide-react";

/**
 * What is currently narrowing the list, each removable.
 *
 * The point is legibility: a filter set across a bar and a popover is easy to
 * forget, and "why is this list empty" is nearly always an answer sitting in
 * one of these chips.
 *
 * Renders nothing when empty, and never carries a chip for a filter sitting at
 * its default — the caller decides what counts as applied.
 */
export interface AppliedFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface FilterChipsProps {
  items: AppliedFilter[];
  /** Rendered once two or more chips are showing. */
  onClearAll?: () => void;
}

export function FilterChips({ items, onClearAll }: FilterChipsProps) {
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <span
          key={item.key}
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-navy-100 pr-1.5 pl-3 text-xs font-semibold text-primary"
        >
          {item.label}
          <button
            type="button"
            onClick={item.onRemove}
            aria-label={`Hapus filter ${item.label}`}
            className="flex size-4 items-center justify-center rounded-full bg-primary/15 outline-none hover:bg-primary/25 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X className="size-2.5" strokeWidth={3} />
          </button>
        </span>
      ))}

      {onClearAll && items.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-sm text-xs font-semibold text-warning outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Hapus semua
        </button>
      )}
    </div>
  );
}
