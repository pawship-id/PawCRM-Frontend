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
 * list — the button belongs where the reading finishes. A form is a document,
 * and a document says what it is and what you can do with it at its head.
 *
 * IT DOES NOT STICK BY DEFAULT. The first three forms pinned it, and pinned is
 * the wrong default: a bar that follows the reader down two hundred rows of a
 * stock sheet competes with DashboardShell's own sticky header for the top of
 * the screen, and on a laptop the two of them eat a fifth of the viewport before
 * any content appears. `sticky` is left as an opt-in for a screen that earns it.
 *
 * When it IS set: `top-16`, NOT `top-0`. DashboardShell's header is
 * `sticky top-0 z-20` and 64px tall; a second bar at `top-0` sits underneath it
 * and disappears. `z-10` for the same reason — below the header, above the form.
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
  /**
   * Pin the bar under DashboardShell's header instead of letting it scroll away.
   *
   * OFF BY DEFAULT — see the note above. Turn it on only for a screen where
   * somebody genuinely saves from the bottom of a very long document, and check
   * what two stacked sticky bars leave of the viewport before you do.
   */
  sticky?: boolean;
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
  sticky = false,
  className,
}: FormActionBarProps) {
  const blocked = disabled && !submitting && Boolean(blockedReason);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        "rounded-xl border border-border px-4 py-3 shadow-sm sm:px-6",
        // Translucent only when it is going to have content sliding under it.
        // A solid surface is the honest one for a bar that stays put.
        sticky
          ? "sticky top-16 z-10 bg-surface/95 backdrop-blur"
          : "bg-surface",
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
