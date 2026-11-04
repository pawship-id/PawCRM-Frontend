"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Spinner } from "@/components";
import { Input } from "@/components/ui/input";

import { prepareIndex, searchHelp, type PreparedEntry } from "../search";
import type { HelpSearchEntry } from "../types";

/**
 * The guide's search box, with its results directly beneath it.
 *
 * THE INDEX LOADS ON FIRST INTEREST, not with the page: it is every article's
 * text (~330 KB), and most visits to a help page go straight to a card or a
 * link. Focusing the box is the signal — by the time the first word is typed
 * it is usually there.
 */
let indexPromise: Promise<PreparedEntry[]> | null = null;

function loadIndex(): Promise<PreparedEntry[]> {
  indexPromise ??= import("@/content/help/search.json")
    .then((mod) => prepareIndex(mod.default as HelpSearchEntry[]))
    .catch((error: unknown) => {
      // Let the next focus try again rather than caching a failure for the session.
      indexPromise = null;
      throw error;
    });
  return indexPromise;
}

const KIND_LABEL: Record<HelpSearchEntry["kind"], string> = {
  article: "Panduan",
  faq: "Tanya jawab",
};

export function HelpSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const inputId = useId();
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<PreparedEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  function ensureIndex() {
    if (index) return;
    loadIndex()
      .then((loaded) => {
        setIndex(loaded);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    if (autoFocus) ensureIndex();
    // Only on mount: ensureIndex is safe to call again and needs no re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = query.trim();
  const results = useMemo(
    () => (index && trimmed ? searchHelp(index, trimmed) : []),
    [index, trimmed],
  );

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={inputId} className="sr-only">
        Cari panduan
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          type="search"
          value={query}
          autoFocus={autoFocus}
          onFocus={ensureIndex}
          onChange={(event) => {
            setQuery(event.target.value);
            ensureIndex();
          }}
          placeholder="Cari cara melakukan sesuatu, misalnya: tutup kasir, retur, stok minus"
          className="h-12 bg-surface pl-11 text-[15px]"
          aria-controls={trimmed ? resultsId : undefined}
          autoComplete="off"
        />
      </div>

      {trimmed && (
        <div id={resultsId} aria-live="polite">
          {failed ? (
            <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
              Pencarian belum bisa dimuat. Periksa koneksi, lalu klik kotak cari lagi.
            </p>
          ) : !index ? (
            <p className="flex items-center gap-2 px-1 text-sm text-muted">
              <Spinner size={16} /> Menyiapkan pencarian…
            </p>
          ) : results.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
              Belum ada panduan untuk &ldquo;{trimmed}&rdquo;. Coba kata lain, misalnya nama menu yang
              Anda buka.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {results.map((entry) => (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="rounded-full bg-tint-neutral px-2 py-0.5 font-medium text-foreground">
                        {KIND_LABEL[entry.kind]}
                      </span>
                      {entry.moduleTitle}
                    </span>
                    <span className="text-[15px] font-semibold text-foreground">{entry.title}</span>
                    {entry.summary && (
                      <span className="line-clamp-2 text-sm text-muted">{entry.summary}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
