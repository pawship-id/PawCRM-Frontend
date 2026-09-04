"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/services/api-error";
import { businessLineService } from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import type { BusinessLine } from "@/services/businessLine.service";
import type {
  ChartOfAccount,
  ChartOfAccountNode,
  JournalEntry,
} from "@/types/accounting";

export interface UseJournalEntryResult {
  entry: JournalEntry | null;
  /** account id → account, for naming and classifying each line. */
  accountsById: Map<string, ChartOfAccount>;
  /** business line id → name, for the per-line attribution column. */
  businessLineNames: Map<string, string>;
  /**
   * Entry id → its human-facing number, for the two reversal banners.
   *
   * Holds at most two ids — the entry this one reversed, and the one that
   * reversed it. Empty when neither exists, or when the counterpart could not be
   * read; the banner then links by id, which is a worse label than "JE-2026-08-
   * 0007" and a better one than a link with no text.
   */
  relatedNumbers: Map<string, string>;
  loading: boolean;
  /** The API answered 404 — a different state from a request that failed. */
  notFound: boolean;
  /** Set only when the ENTRY failed. A missing lookup degrades silently. */
  error: string | null;
  refetch: () => void;
}

/**
 * One ledger entry and everything needed to read it, from
 * GET /journal-entries/:id plus two lookups.
 *
 * THE LINES CARRY IDS, NOT NAMES, and that is the API's contract rather than an
 * omission (types/accounting.ts): the chart of accounts and the business lines
 * are short, cacheable lists this client already holds to render its own filters,
 * and resolving them here is what keeps a renamed account renamed everywhere at
 * once. So the entry alone is not a readable page — it is the entry plus those
 * two lists.
 *
 * THE LOOKUPS FAIL QUIETLY, the entry does not. A user may hold
 * `journalEntries:read` without `chartOfAccounts:read`, and a detail page that
 * refused to render because it could not name an account would hide the amounts,
 * the balance check and the reversal banner — all of which are readable without
 * it. Unnamed lines fall back to their ids.
 *
 * NOT-FOUND IS ITS OWN STATE. A 404 means the entry does not exist in this
 * tenant; anything else means the request failed and is worth retrying. Folding
 * them together would offer "Coba lagi" on a URL that will never resolve.
 */
export function useJournalEntry(entryId: string): UseJournalEntryResult {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [relatedNumbers, setRelatedNumbers] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  /* --------------------------------------------- the two lookups, fetched once */
  useEffect(() => {
    let active = true;

    Promise.allSettled([
      chartOfAccountsService.tree(),
      businessLineService.list({ limit: 100 }),
    ]).then(([accountResult, lineResult]) => {
      if (!active) return;
      if (accountResult.status === "fulfilled") {
        setAccounts(flattenAccounts(accountResult.value));
      }
      if (lineResult.status === "fulfilled") {
        setBusinessLines(lineResult.value.items);
      }
      // No setError on either. See the header.
    });

    return () => {
      active = false;
    };
  }, [nonce]);

  /* ------------------------------------------------------ the entry, and its pair */
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setNotFound(false);

    journalEntryService
      .getById(entryId)
      .then(async (result) => {
        if (!active) return;
        setEntry(result);

        // The correction's other half, fetched only to render its NUMBER on the
        // banner. Two requests at most, and both are allowed to fail: a banner
        // that says "sudah dibalik" is the important part, and it is already
        // rendered from a field on the entry itself.
        const relatedIds = [
          result.reversedByEntryId,
          result.reversesEntryId,
        ].filter((id): id is string => Boolean(id));

        if (relatedIds.length === 0) {
          setRelatedNumbers(new Map());
          return;
        }

        const related = await Promise.allSettled(
          relatedIds.map((id) => journalEntryService.getById(id)),
        );
        if (!active) return;

        setRelatedNumbers(
          new Map(
            related
              .filter(
                (item): item is PromiseFulfilledResult<JournalEntry> =>
                  item.status === "fulfilled",
              )
              .map((item) => [item.value._id, item.value.entryNumber]),
          ),
        );
      })
      .catch((err) => {
        if (!active) return;
        setEntry(null);
        setRelatedNumbers(new Map());

        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }

        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat entri jurnal. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [entryId, nonce]);

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account._id, account])),
    [accounts],
  );

  const businessLineNames = useMemo(
    () => new Map(businessLines.map((line) => [line._id, line.name])),
    [businessLines],
  );

  return {
    entry,
    accountsById,
    businessLineNames,
    relatedNumbers,
    loading,
    notFound,
    error,
    refetch,
  };
}

/**
 * The COA tree flattened depth-first — the same walk `useChartOfAccounts` does.
 *
 * Only a lookup map is wanted here, so the order is incidental; the flatten is
 * shared in shape rather than in code because that hook also returns the ordered
 * array its screen renders from, and exporting a helper that serves one caller's
 * incidental need is how two screens end up disagreeing about a tree.
 */
function flattenAccounts(nodes: ChartOfAccountNode[]): ChartOfAccount[] {
  const flat: ChartOfAccount[] = [];

  const walk = (level: ChartOfAccountNode[]) => {
    for (const { children, ...account } of level) {
      flat.push(account);
      if (children?.length) walk(children);
    }
  };
  walk(nodes);

  return flat;
}
