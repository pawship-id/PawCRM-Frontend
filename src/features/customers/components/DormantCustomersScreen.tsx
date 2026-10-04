"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterSelect,
  Pagination,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { whatsAppLink } from "@/utils/phone";

import {
  useDormantCustomers,
  type DormantCustomersQuery,
} from "../hooks/useDormantCustomers";
import { day, DORMANT_DAYS } from "../labels";

/** Pelanggan, Terakhir datang, Bergabung, Aksi. */
const COLUMN_COUNT = 4;

/** This screen's own URL, carrying the window that is currently applied. */
function dormantCustomersPath(days: number): string {
  return `/dashboard/master/customers/dormant?days=${days}`;
}

/**
 * Every live customer whose last settled sale — or, lacking one, whose
 * registration — is older than the chosen window, longest-absent first.
 *
 * THE RINGKASAN PANEL SHOWS TEN; THIS SHOWS ALL OF THEM. The card on the
 * Ringkasan tab answers "is there anyone to ring today" — this answers
 * "everyone, in order" — the same split `NegativeStockScreen` draws against
 * its own hub card.
 *
 * ONE FILTER, ON THE BAR — the dormancy window itself, applying on click like
 * `NegativeStockScreen`'s Gudang: a single field behind a `Filter (1)` button
 * is a button that hides one thing (ui-rules §8).
 *
 * NO SORT CONTROL. The order is fixed at longest-absent-first, which is the
 * one order this worklist is read in — a shop clears it top to bottom.
 *
 * CHANGING THE WINDOW ONLY EVER WRITES THE URL — it does NOT also call
 * `setQuery` here (2 October 2026, fixing a bug report). It used to do both:
 * `setQuery` updated this instance's state immediately, `router.replace`
 * updated the address bar on its own schedule, and the two were two
 * independent, unsynchronised paths — the table would show the new window's
 * rows while the URL still read the old one, or the other way around,
 * whichever path happened to finish first. `router.replace` is now the ONLY
 * path: `dormant/page.tsx` keys `<DormantCustomersScreen>` on the resolved
 * query, so a changed `?days=` throws this whole screen away and mounts a
 * fresh one — `useDormantCustomers` initialises `loading: true` on mount,
 * so the table and the URL can only ever change TOGETHER, never one before
 * the other.
 *
 * `isPending` COVERS THE GAP BEFORE THAT REMOUNT HAPPENS. Between the click
 * and the new page actually arriving, THIS instance (old data, old URL) is
 * still what's on screen — `useTransition` is the documented Next.js way to
 * know a navigation is in flight, so the filter can show it is working
 * rather than sitting there looking like the click did nothing.
 *
 * `useRouter()` ONLY, NO `useSearchParams()` — this screen only ever WRITES
 * the URL, the initial value always arrives as a prop from the server page,
 * so no Suspense boundary is needed either.
 */
export function DormantCustomersScreen({
  initialQuery,
}: {
  initialQuery?: Partial<DormantCustomersQuery>;
} = {}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { items, pagination, query, loading, error, setQuery, refetch } =
    useDormantCustomers(initialQuery);

  function changeDays(days: number) {
    startTransition(() => {
      router.replace(dormantCustomersPath(days), { scroll: false });
    });
  }

  /*
    ONE FLAG FOR "NOT SETTLED YET", covering both halves of a window change:
    `isPending` while the navigation itself is in flight (THIS instance, old
    rows still in the DOM), `loading` once the fresh instance has mounted and
    is fetching. Read together so the spinner never drops out between the two.
  */
  const busy = loading || isPending;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="error">
          <span className="flex flex-wrap items-center gap-3">
            {error}
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RotateCcw className="size-4" />
              Coba lagi
            </Button>
          </span>
        </Alert>
      )}

      <FilterBar>
        <FilterSelect
          label="Batas tidak aktif"
          ariaLabel="Batas tidak aktif"
          value={query.days}
          options={DORMANT_DAYS}
          onChange={changeDays}
          // Disabled rather than silently ignored while a window change is
          // already in flight — a second click mid-transition would otherwise
          // queue a navigation this one's remount is about to throw away.
          disabled={isPending}
        />
      </FilterBar>

      {!busy && pagination.total > 0 && (
        <p className="text-sm text-foreground">
          <strong className="tabular-nums">{pagination.total}</strong>{" "}
          pelanggan tidak aktif ≥ {query.days} hari.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Terakhir datang</TableHead>
              <TableHead>Bergabung</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {busy && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT}>
                  <span className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                    <Spinner /> Memuat…
                  </span>
                </TableCell>
              </TableRow>
            )}

            {!busy && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT}>
                  <div className="flex flex-col items-center gap-1 py-10 text-center">
                    <p className="font-medium text-foreground">
                      Tidak ada pelanggan yang tertinggal ≥ {query.days} hari
                    </p>
                    <p className="max-w-md text-sm text-muted">
                      Tidak ada yang perlu dihubungi dari jendela ini.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!busy &&
              items.map((row) => {
                const chat = whatsAppLink(row.phone);

                return (
                  <TableRow key={row._id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/master/customers/${row._id}`}
                        className="font-medium text-foreground hover:text-primary-hover"
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-muted">{row.phone ?? "—"}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.lastVisitAt ? (
                        <>
                          <p className="text-foreground">
                            {day(row.lastVisitAt)}
                          </p>
                          <p className="tabular-nums text-xs text-muted">
                            {row.daysSinceLastVisit} hari lalu
                          </p>
                        </>
                      ) : (
                        <p className="text-muted">Belum pernah belanja</p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted">
                      {day(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {chat ? (
                        <Button variant="secondary" size="sm" asChild>
                          <a href={chat} target="_blank" rel="noreferrer">
                            Hubungi
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          unit="pelanggan"
          unitPlural="pelanggan"
          onPageChange={(page) => setQuery({ page })}
        />
      )}
    </div>
  );
}
