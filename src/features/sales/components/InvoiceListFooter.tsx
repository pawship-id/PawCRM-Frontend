"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { FilterSelect, type FilterOption } from "@/components";
import { getPageItems } from "@/components/Pagination";
import { Button } from "@/components/ui/button";

import { PAGE_SIZES } from "../hooks/useCustomerInvoices";

const SIZE_OPTIONS: FilterOption<string>[] = PAGE_SIZES.map((size) => ({
  value: String(size),
  label: String(size),
}));

/**
 * The foot of the invoice table: what range is on screen, how many rows a page,
 * and which page.
 *
 * NOT THE SHARED `Pagination`, which renders nothing at one page and has no page
 * size. This list is read a month at a time, often in one long page — "Menampilkan
 * 1–87 dari 87 faktur" with 100 per halaman is the ordinary case, and it still
 * needs saying. The numbered-window logic IS shared (`getPageItems`), so the two
 * pagers collapse their page lists the same way.
 */
export function InvoiceListFooter({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted tabular-nums">
        Menampilkan {start}–{end} dari {total} faktur
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Per halaman"
          ariaLabel="Faktur per halaman"
          value={String(pageSize)}
          options={SIZE_OPTIONS}
          // A page size is a choice, not a filter: never shown as "applied".
          active={false}
          onChange={(value) => onPageSizeChange(Number(value))}
        />

        {totalPages > 1 && (
          <nav aria-label="Paginasi" className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Halaman sebelumnya"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
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
                  size="icon"
                  className="tabular-nums"
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
              size="icon"
              aria-label="Halaman berikutnya"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
