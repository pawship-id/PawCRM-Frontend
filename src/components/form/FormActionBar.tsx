"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "../Spinner";
import { Button } from "../ui/button";

/**
 * The bar that carries Batal and Simpan, pinned to the top of a form.
 *
 * WHY THE TOP, when the filter panel puts its Terapkan at the bottom: they are
 * different acts. A filter is one decision, made once, at the end of a short
 * list — the button belongs where the reading finishes. A form is filled in over
 * minutes, revisited, corrected, and saved when the person decides it is right;
 * hunting for the button means scrolling past everything they just typed. So it
 * stays visible, and the form is saveable from wherever they happen to be.
 *
 * `top-16`, NOT `top-0`. DashboardShell's header is `sticky top-0 z-20` and 64px
 * tall; a second bar at `top-0` sits underneath it and disappears. `z-10` for the
 * same reason — below the header, above the form.
 *
 * ORDER IS FIXED: Batal (secondary) left, Simpan (primary) right, always. Two
 * forms in this repo currently do it the other way round, and a save button that
 * moves between screens is a save button people mis-click.
 *
 * The LABEL IS SPECIFIC — `Simpan penyesuaian`, not `Simpan` and never `Submit`.
 * §12: the button says what happens.
 *
 * MOBILE IS DELIBERATELY UNSOLVED HERE. The guideline flags sticky-top-right as
 * something to revisit once this is tested on a real phone, where the top-right
 * is where a thumb reaches least well. Because every form reaches the bar through
 * this component, a bottom-fixed variant below 640px can be added later in this
 * one file without touching a single form. That is the whole point of it being
 * a component.
 */
export interface FormActionBarProps {
  /** The document being filled in: "Penyesuaian baru", "Produk baru". */
  title: string;
  /**
   * Small print beside the title — the document's number, a line count, a
   * running total. This is where read-only identity belongs: `No. [auto]` is not
   * a field somebody fills in, so it does not get a slot in the grid.
   */
  meta?: ReactNode;
  /** "Simpan penyesuaian". Never bare "Simpan". */
  submitLabel: string;
  /** Swaps the label for a spinner and blocks a second click. */
  submitting?: boolean;
  /** Required fields still empty. Grey it out; do not shout yet. */
  disabled?: boolean;
  /**
   * Why Simpan is off, in one phrase: "Gudang belum dipilih".
   *
   * Shown only when the button is actually disabled and nothing is in flight —
   * a greyed button with no explanation is the most common dead end in this app,
   * and an error banner before anybody has tried to save is the other extreme.
   */
  blockedReason?: string | null;
  /** Where Batal returns to. Use this, not `onCancel`, when it is a route. */
  cancelHref?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  /**
   * Extra buttons, placed LEFT of Batal — "Simpan sebagai draf", "Pratinjau".
   * The primary action never moves to make room for them.
   */
  extra?: ReactNode;
  className?: string;
}

export function FormActionBar({
  title,
  meta,
  submitLabel,
  submitting = false,
  disabled = false,
  blockedReason,
  cancelHref,
  onCancel,
  cancelLabel = "Batal",
  extra,
  className,
}: FormActionBarProps) {
  const blocked = disabled && !submitting && Boolean(blockedReason);

  return (
    <div
      className={cn(
        "sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3",
        "rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold">{title}</h2>
        {(meta || blocked) && (
          <p className="mt-0.5 truncate text-xs text-muted tabular-nums">
            {blocked ? (
              <>
                Belum bisa disimpan: <b className="font-semibold">{blockedReason}</b>
              </>
            ) : (
              meta
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {extra}

        {cancelHref ? (
          <Button asChild variant="secondary" size="lg">
            <Link href={cancelHref}>{cancelLabel}</Link>
          </Button>
        ) : onCancel ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onCancel}
            disabled={submitting}
          >
            {cancelLabel}
          </Button>
        ) : null}

        <Button type="submit" size="lg" disabled={disabled || submitting}>
          {submitting && <Spinner size={16} />}
          {submitting ? "Menyimpan…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
