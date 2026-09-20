"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { FilterSelect, type FilterOption } from "./filters";
import { getPageItems } from "./Pagination";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

/**
 * THE FOOT OF A LIST THAT LETS SOMEBODY CHOOSE HOW MANY ROWS A PAGE HOLDS —
 * "Menampilkan 1–10 dari 14 transaksi · Tampilkan 10 / halaman" on the left, the
 * numbered pager on the right.
 *
 * ONE SHAPE FOR BOTH SCREENS THAT HAVE ONE. Decided 20 September 2026 on
 * request, from a mockup. Transaksi and Faktur Penjualan are the only two lists
 * in the app offering a page size, and they had drifted into two footers that
 * agreed on nothing — different labels ("Tampilkan" vs "Per halaman"), different
 * option text ("25 / halaman" vs "25"), the control on opposite sides, and
 * different defaults. They are read by the same person in the same sitting, so
 * they get one component (§14: promoted the moment a second feature needs it).
 *
 * NOT THE SHARED `Pagination`, which has no page size and states the position as
 * "Halaman 2 dari 5". A list somebody sets to 100 rows a page is a list being
 * read as one long page, and "1–87 dari 87" is the sentence that answers whether
 * everything is on screen. The numbered-window logic IS shared (`getPageItems`),
 * so every pager in the app collapses its page list the same way.
 *
 * THE PAGER HIDES AT ONE PAGE and the left-hand side never does: buttons that
 * can only be pressed to no effect are noise, but "Menampilkan 1–14 dari 14" and
 * the size control are the two things still worth saying when everything fits.
 */
export function ListFooter({
  page,
  pageSize,
  pageSizes,
  total,
  totalPages,
  unit = "entri",
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageSize: number;
  /** The sizes offered. `pageSize` is folded in when missing — see below. */
  pageSizes: readonly number[];
  total: number;
  totalPages: number;
  /**
   * The noun counted — "faktur", "transaksi". Indonesian does not inflect for
   * number, so there is no plural to pass.
   */
  unit?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  /*
    THE CURRENT SIZE IS FOLDED IN even when the caller's list omits it, so the
    trigger can never read a number the popover cannot offer back — which would
    make picking anything a one-way door out of the size the list started in.
    Transaksi shipped that way for months, opening on 20 rows with 10/25/50/100
    on the menu. Its default is 25 now, so this guards the remaining routes to a
    size nobody chose from the menu: a stored query, or a deep link.
  */
  const sizes = pageSizes.includes(pageSize)
    ? [...pageSizes]
    : [...pageSizes, pageSize].sort((a, b) => a - b);

  const sizeOptions: FilterOption<string>[] = sizes.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span className="tabular-nums">
          Menampilkan {start}–{end} dari {total} {unit}
        </span>
        <span aria-hidden className="select-none">
          ·
        </span>
        {/*
          "Tampilkan" and "/ halaman" ARE THE CALLER'S WORDS, not the control's:
          `layout="bar"` draws the value alone so a caption can sit either side
          of it, which is the one arrangement that reads as a sentence rather
          than as a filter somebody applied.

          `active={false}` because a page size is a CHOICE, not a filter — left
          to derive it, the trigger would go navy the moment it differs from the
          first option and announce a filter nobody set.
        */}
        <span className="flex items-center gap-2">
          <span>Tampilkan</span>
          {/*
            The trigger is a BUTTON, not an `<input>`, so a `<label htmlFor>`
            would name nothing. `label` is what `FilterTrigger` puts on
            `aria-label`, and "Baris per halaman" is the whole sentence a screen
            reader needs — the two captions around it are decoration to it.
          */}
          <FilterSelect
            layout="bar"
            label="Baris per halaman"
            value={String(pageSize)}
            options={sizeOptions}
            active={false}
            onChange={(value) => onPageSizeChange(Number(value))}
          />
          <span>/ halaman</span>
        </span>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Paginasi" className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
            Sebelumnya
          </Button>

          {getPageItems(page, totalPages).map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                aria-hidden
                className="px-1 text-sm text-muted select-none"
              >
                …
              </span>
            ) : (
              <Button
                key={item}
                variant={item === page ? "default" : "secondary"}
                className="min-w-9 px-0 tabular-nums"
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
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      )}
    </div>
  );
}
