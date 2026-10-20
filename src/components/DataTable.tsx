"use client";

import { Fragment, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { Spinner } from "./Spinner";

/**
 * THE list table — one component for every list screen, so a fix to how a
 * header sorts, how a row opens or how an empty list reads lands everywhere at
 * once (BO, 19 October 2026). Built on `ui/table`; a screen describes its
 * columns and hands over its rows, and never writes `<th>` or `<tr>` itself.
 *
 * SORTING IS THE SERVER'S. A sortable header does not reorder anything in the
 * browser: it calls `sort.onChange` with the NAME of an ordering the API knows
 * (`nameAsc`, `newest`, …) and the screen re-fetches. A list is paged, and a
 * client that re-sorted would only reorder the twenty rows it holds while the
 * pager claimed to walk them all. Which column maps to which name is the
 * screen's `sort.options`; a column with no entry there is a plain header.
 *
 * The first click takes the column's natural direction (`first`, default
 * `asc`) — newest date and largest amount first, A first for a name — and the
 * next click flips it. The arrow sits on every sortable header, greyed while
 * that column is not the active one, so the row says which columns can be
 * clicked and not only which one is on (docs/ui-rules.md §8).
 */

export type SortDirection = "asc" | "desc";

/** One sortable column: the API's ordering for each direction. */
export interface SortOption<S extends string> {
  asc: S;
  desc: S;
  /** Which direction the first click takes. Defaults to `asc`. */
  first?: SortDirection;
}

/** Column id → its orderings. Only the columns listed here sort. */
export type SortOptions<S extends string> = Record<string, SortOption<S>>;

export interface DataTableSort<S extends string> {
  /** The ordering the list is in now. */
  value: S;
  options: SortOptions<S>;
  onChange: (next: S) => void;
}

export interface DataTableColumn<Row> {
  /** Stable key; also the key into `sort.options` for a sortable column. */
  id: string;
  /** What the header says. Empty for a column of row actions. */
  header: ReactNode;
  /** Numeric columns are right-aligned (ui-rules §10). */
  align?: "left" | "right";
  headClassName?: string;
  cellClassName?: string | ((row: Row) => string | undefined);
  cell: (row: Row, index: number) => ReactNode;
}

export interface DataTableProps<Row, S extends string> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  sort?: DataTableSort<S>;
  /**
   * While true the rows on screen stay and dim, so a re-sort or a page change
   * does not flash an empty table. With no rows yet, a spinner row stands in.
   */
  loading?: boolean;
  loadingLabel?: string;
  /** Rendered across the whole row when there is nothing to show. */
  empty?: ReactNode;
  rowClassName?: (row: Row, index: number) => string | false | undefined;
  /** Makes each row open something — clickable and keyboard-reachable. */
  onRowClick?: (row: Row) => void;
  /** Extra rows under a row — an expanded family's variants, for one. */
  renderAfterRow?: (row: Row, index: number) => ReactNode;
  /** A `<tfoot>` row or rows. */
  footer?: ReactNode;
  /** Below the table, inside the same frame — a note about the list. */
  note?: ReactNode;
  /** Minimum width before the frame scrolls sideways, e.g. `min-w-[64rem]`. */
  tableClassName?: string;
  /** Drops the bordered frame, for a table already inside a Card. */
  bare?: boolean;
}

/** Which way `value` orders `option`'s column, or null when it is not that column. */
export function sortDirectionOf<S extends string>(
  option: SortOption<S>,
  value: S,
): SortDirection | null {
  if (value === option.asc) return "asc";
  if (value === option.desc) return "desc";
  return null;
}

/** The ordering a click on `option`'s header asks for, given the current one. */
export function nextSortOf<S extends string>(
  option: SortOption<S>,
  value: S,
): S {
  const current = sortDirectionOf(option, value);
  const first = option.first ?? "asc";
  if (current === null) return option[first];
  return current === "asc" ? option.desc : option.asc;
}

export function DataTable<Row, S extends string = string>({
  columns,
  rows,
  rowKey,
  sort,
  loading = false,
  loadingLabel = "Memuat…",
  empty,
  rowClassName,
  onRowClick,
  renderAfterRow,
  footer,
  note,
  tableClassName,
  bare = false,
}: DataTableProps<Row, S>) {
  const span = columns.length;

  return (
    <div
      className={cn(
        "overflow-x-auto",
        !bare && "rounded-xl border border-border bg-surface",
      )}
    >
      <Table className={tableClassName}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => {
              const option = sort?.options[column.id];
              return option && sort ? (
                <SortableTableHead
                  key={column.id}
                  label={column.header}
                  align={column.align}
                  className={column.headClassName}
                  direction={sortDirectionOf(option, sort.value)}
                  onClick={() => sort.onChange(nextSortOf(option, sort.value))}
                />
              ) : (
                <TableHead
                  key={column.id}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.headClassName,
                  )}
                >
                  {column.header}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody className={cn(loading && rows.length > 0 && "opacity-60")}>
          {loading && rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={span}>
                <span className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                  <Spinner /> {loadingLabel}
                </span>
              </TableCell>
            </TableRow>
          )}

          {!loading && rows.length === 0 && empty && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={span} className="whitespace-normal">
                {empty}
              </TableCell>
            </TableRow>
          )}

          {rows.map((row, index) => (
            <Fragment key={rowKey(row)}>
              <TableRow
                className={cn(
                  rowClassName?.(row, index),
                  onRowClick &&
                    "cursor-pointer focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset",
                )}
                {...(onRowClick
                  ? {
                      tabIndex: 0,
                      onClick: () => onRowClick(row),
                      onKeyDown: (event: KeyboardEvent) => {
                        // Only the row's own keys: Enter on a link inside it is the link's.
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      },
                    }
                  : {})}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      column.align === "right" && "text-right tabular-nums",
                      typeof column.cellClassName === "function"
                        ? column.cellClassName(row)
                        : column.cellClassName,
                    )}
                  >
                    {column.cell(row, index)}
                  </TableCell>
                ))}
              </TableRow>
              {renderAfterRow?.(row, index)}
            </Fragment>
          ))}
        </TableBody>

        {footer && <TableFooter>{footer}</TableFooter>}
      </Table>

      {note && (
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted">
          {note}
        </div>
      )}
    </div>
  );
}

/**
 * A header that sorts. A real `<button>` inside the `<th>`, with `aria-sort`
 * on the header, so a screen reader hears both that it can be pressed and
 * which way the column is ordered now.
 */
export function SortableTableHead({
  label,
  direction,
  onClick,
  align = "left",
  className,
}: {
  label: ReactNode;
  direction: SortDirection | null;
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  const Icon =
    direction === "asc"
      ? ArrowUp
      : direction === "desc"
        ? ArrowDown
        : ChevronsUpDown;

  return (
    <TableHead
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 rounded-md hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          direction && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon
          aria-hidden
          className={cn(
            "size-3.5",
            direction ? "text-primary" : "text-muted/60",
          )}
        />
      </button>
    </TableHead>
  );
}
