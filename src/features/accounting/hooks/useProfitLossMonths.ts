"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import type { BusinessLine } from "@/services/businessLine.service";
import {
  journalEntryService,
  type ProfitLossResult,
} from "@/services/journalEntry.service";
import type { Branch } from "@/types/api";

import type { Period } from "../financeSummary";

/**
 * One laba rugi read per month, plus the two lookup lists the filters need.
 *
 * The Laba Rugi screen compares each month with the one before, so it needs
 * three statements side by side; the endpoint answers one period at a time and
 * three parallel reads are cheaper than a second endpoint that would have to
 * agree with it. `results` is in the same order as `months`.
 *
 * Lookups fail softly, as in `useFinanceReport`: `branches:read` and
 * `businessLines:read` are their own grants and a short filter beats an error
 * page.
 */
export function useProfitLossMonths(months: Period[], branchIds: string[]) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [results, setResults] = useState<ProfitLossResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      branchService.list({ limit: 100 }),
      businessLineService.list({ limit: 100 }),
    ]).then(([b, l]) => {
      if (!active) return;
      if (b.status === "fulfilled") setBranches(b.value.items);
      if (l.status === "fulfilled") setBusinessLines(l.value.items);
    });
    return () => {
      active = false;
    };
  }, []);

  const key = [
    ...months.map((m) => `${m.dateFrom}:${m.dateTo}`),
    branchIds.join(","),
  ].join("|");

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    Promise.all(
      months.map((m) =>
        journalEntryService.profitLoss({
          dateFrom: m.dateFrom,
          dateTo: m.dateTo,
          branchIds: branchIds.length ? branchIds : undefined,
        }),
      ),
    )
      .then((all) => {
        if (active) setResults(all);
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof ApiError
            ? cause.fullMessage
            : "Laporan gagal dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // `key` stands for `months`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { branches, businessLines, results, loading, error };
}
