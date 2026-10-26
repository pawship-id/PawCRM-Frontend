"use client";

import { useEffect, useRef, useState, type UIEvent } from "react";
import { Search, Plus, UserRound } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { HighlightText } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Can } from "@/features/permissions";
import { customerService } from "@/services/customer.service";
import { useDebouncedQuery } from "@/hooks/useDebouncedQuery";
import type { ApiWarning, Customer } from "@/types/api";

import { CustomerQuickAddDialog } from "./CustomerQuickAddDialog";

/**
 * How many customers one request brings back. The list SCROLLS (26 October
 * 2026): it used to stop at 8, which left somebody browsing without a search
 * term unable to see past the eighth name. The next page is asked for only
 * when the list is scrolled near its end, so the dialog never loads the whole
 * register up front.
 */
const PAGE_SIZE = 30;

/** How close to the bottom (px) the list may get before the next page is asked for. */
const LOAD_MORE_THRESHOLD = 160;

/**
 * Finds an existing customer, or registers one on the spot.
 *
 * BUILT FOR THE POS (FR-2), where selecting a customer is optional for cash and
 * required for piutang. It is exported for any screen that needs to attach a
 * customer to something without leaving it.
 *
 * SEARCH IS SERVER-SIDE, and that is the difference from every picker written so
 * far in this codebase. `PetOwnerField` and the business-line pickers load a
 * page of options and search inside it, which silently cannot find anyone past
 * the page cap. A till cannot work that way: the shop with four hundred
 * pelanggan is exactly the shop that needs this. `?search=` already matches
 * name, email and phone, so the query goes to the server and the list shows what
 * came back.
 *
 * THE QUICK-ADD IS PART OF THIS DIALOG, not a sibling of it, because the moment
 * somebody discovers a customer does not exist is the moment they need to create
 * one. Sending them to another screen to come back and search again is the flow
 * the PRD's "tanpa keluar dari layar kasir" rules out. The empty state is where
 * it lives, and the search term is carried into it: a cashier who typed a phone
 * number has already entered the field.
 */
export function CustomerSearchDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Handed the chosen customer. `warnings` is non-empty only when the customer
   * was just created and something is worth saying about it — the caller decides
   * whether to surface it.
   */
  onSelect: (customer: Customer, warnings?: ApiWarning[]) => void;
}) {
  /*
    HELD AS `{ search }` RATHER THAN A BARE STRING, because that is the shape
    `useDebouncedQuery` takes — it debounces the search field and lets every
    other key apply on the tick it changed. A one-field object looks like
    ceremony and is what keeps this picker on the same debounce as every list
    screen instead of inventing a second one.
  */
  const [query, setQuery] = useState({ search: "" });
  const [results, setResults] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  /*
    BUMPED ON EVERY NEW SEARCH, so a "next page" still in flight for the old
    term cannot append its rows under the new one.
  */
  const searchRun = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  const term = query.search;
  const settled = useDebouncedQuery(query);

  function fetchPage(nextPage: number) {
    return customerService.list({
      page: nextPage,
      limit: PAGE_SIZE,
      search: settled.search.trim() || undefined,
      // A–Z, so a scrolled list reads like a register. Indexed on the server.
      sort: "nameAsc",
      // A picker never offers a customer somebody switched off (2 October
      // 2026) — see `isCustomerActive` in `CustomerStatusBadge.tsx`.
      isActive: true,
    });
  }

  useEffect(() => {
    if (!open) return;

    const run = ++searchRun.current;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    listRef.current?.scrollTo?.({ top: 0 });

    fetchPage(1)
      .then((result) => {
        if (run !== searchRun.current) return;
        setResults(result.items);
        setPage(1);
        setHasMore(1 < (result.pagination?.totalPages ?? 1));
      })
      .catch(() => {
        if (run !== searchRun.current) return;
        setResults([]);
        setHasMore(false);
        // Our own sentence, never the server's — the API answers in English.
        setError("Pencarian pelanggan gagal. Coba lagi.");
      })
      .finally(() => {
        if (run === searchRun.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, open]);

  function loadMore() {
    if (loading || loadingMore || !hasMore) return;

    const run = searchRun.current;
    const nextPage = page + 1;
    setLoadingMore(true);

    fetchPage(nextPage)
      .then((result) => {
        if (run !== searchRun.current) return;
        setResults((current) => {
          // A customer registered between pages shifts the order by one; never
          // show the same row twice.
          const seen = new Set(current.map((one) => one._id));
          return [...current, ...result.items.filter((one) => !seen.has(one._id))];
        });
        setPage(nextPage);
        setHasMore(nextPage < (result.pagination?.totalPages ?? nextPage));
      })
      .catch(() => {
        if (run !== searchRun.current) return;
        setError("Gagal memuat pelanggan berikutnya. Gulir lagi untuk mencoba.");
      })
      .finally(() => {
        if (run === searchRun.current) setLoadingMore(false);
      });
  }

  function handleScroll(event: UIEvent<HTMLUListElement>) {
    const list = event.currentTarget;
    if (list.scrollHeight - list.scrollTop - list.clientHeight < LOAD_MORE_THRESHOLD) {
      loadMore();
    }
  }

  function choose(customer: Customer, warnings?: ApiWarning[]) {
    onSelect(customer, warnings);
    setQuery({ search: "" });
    onOpenChange(false);
  }

  /** A typed term that is all digits and punctuation is a phone number. */
  const termLooksLikePhone = /^[0-9+()\-.\s]+$/.test(term.trim());

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pilih pelanggan</DialogTitle>
            <DialogDescription>
              Cari dari nama atau nomor HP. Kalau belum terdaftar, bisa langsung
              ditambahkan dari sini.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={term}
              onChange={(event) => setQuery({ search: event.target.value })}
              placeholder="Cari nama atau no. HP"
              aria-label="Cari pelanggan"
              className="pl-9"
              autoFocus
            />
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          {loading && results.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted">
              <Spinner /> Mencari…
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-start gap-3 py-8">
              <p className="text-sm text-muted">
                {term.trim()
                  ? `Tidak ada pelanggan yang cocok dengan "${term.trim()}".`
                  : "Ketik nama atau nomor HP untuk mencari."}
              </p>
              {term.trim() && (
                <Can feature="customers" action="create">
                  <Button type="button" onClick={() => setAdding(true)}>
                    <Plus className="size-4" />
                    Daftarkan pelanggan baru
                  </Button>
                </Can>
              )}
            </div>
          ) : (
            <ul
              ref={listRef}
              onScroll={handleScroll}
              aria-label="Daftar pelanggan"
              className={`-mx-2 max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain px-2${loading ? " opacity-60" : ""}`}
            >
              {results.map((customer) => (
                <li key={customer._id}>
                  <button
                    type="button"
                    onClick={() => choose(customer)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface-hover focus-visible:bg-surface-hover"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-primary">
                      <UserRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      {/*
                        HIGHLIGHTED WITH THE SETTLED TERM, not what is being
                        typed. The list is debounced, so marking up the results
                        on screen against a newer term would highlight rows that
                        were never matched on it — the marks would blink off and
                        land somewhere else a moment later.

                        BOTH FIELDS, because the search looks at both: somebody
                        who typed a number needs to see WHICH row's number
                        matched, and a name-only highlight would leave a phone
                        search looking like it returned rows at random.
                      */}
                      <span className="block truncate font-medium text-foreground">
                        <HighlightText text={customer.name} query={settled.search} />
                      </span>
                      {/* tabular-nums so a column of numbers does not jitter. */}
                      <span className="block truncate text-xs tabular-nums text-muted">
                        {customer.phone ? (
                          <HighlightText
                            text={customer.phone}
                            query={settled.search}
                          />
                        ) : (
                          "Tanpa no. HP"
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {loadingMore && (
                <li className="flex items-center gap-2 px-2 py-3 text-sm text-muted">
                  <Spinner /> Memuat…
                </li>
              )}
            </ul>
          )}

          {results.length > 0 && (
            <Can feature="customers" action="create">
              <div className="border-t border-border pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAdding(true)}
                >
                  <Plus className="size-4" />
                  Daftarkan pelanggan baru
                </Button>
              </div>
            </Can>
          )}
        </DialogContent>
      </Dialog>

      {/*
        MOUNTED ONLY WHILE OPEN, and that is what makes `initialPhone` work at
        all. The form holds the phone in `useState(initialPhone)`, which reads
        the prop ONCE — so a permanently mounted dialog captured the empty string
        at first render and never saw the term typed afterwards. The prefill
        silently did nothing until the dialog had been opened and closed once.

        Mounting on demand also means every open starts from a clean form, which
        is what somebody registering a second customer expects.
      */}
      {adding && (
        <CustomerQuickAddDialog
          open
          onOpenChange={setAdding}
          // A term that reads as a phone number is carried into the form:
          // somebody who typed one has already entered that field once.
          initialPhone={termLooksLikePhone ? term.trim() : ""}
          onCreated={(customer, warnings) => {
            setAdding(false);
            choose(customer, warnings);
          }}
        />
      )}
    </>
  );
}
