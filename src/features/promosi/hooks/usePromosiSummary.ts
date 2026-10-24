"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import type {
  MembershipAttention,
  MembershipReport,
  MembershipSummary,
} from "@/types/membership";
import { isoDate } from "@/utils/date";

/** Ringkasan's three windows (BO prototype `tabRingkasan`). */
export type SummaryPeriod = "thisMonth" | "lastMonth" | "last30";

export const SUMMARY_PERIODS: { value: SummaryPeriod; label: string }[] = [
  { value: "thisMonth", label: "Bulan ini" },
  { value: "lastMonth", label: "Bulan lalu" },
  { value: "last30", label: "30 hari terakhir" },
];

/**
 * The `YYYY-MM-DD` bounds of a window, by the browser's calendar — the same
 * calendar days the API reads in the tenant's timezone.
 */
export function periodRange(
  period: SummaryPeriod,
  now: Date = new Date(),
): { dateFrom: string; dateTo: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (period === "lastMonth") {
    return { dateFrom: isoDate(new Date(y, m - 1, 1)), dateTo: isoDate(new Date(y, m, 0)) };
  }
  if (period === "last30") {
    return { dateFrom: isoDate(new Date(y, m, d - 29)), dateTo: isoDate(now) };
  }
  return { dateFrom: isoDate(new Date(y, m, 1)), dateTo: isoDate(now) };
}

interface Part<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const idle = <T,>(): Part<T> => ({ data: null, loading: false, error: null });
const failed = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.fullMessage : fallback;

/**
 * Promosi › Ringkasan's three reads, each on its own so one failing (or one the
 * role may not read) leaves the other two on screen:
 *
 *   summary   — GET /pet-memberships/summary    (cabang + periode)
 *   attention — GET /pet-memberships/attention  (cabang; always the next 14 days)
 *   report    — GET /reports/membership         (periode only — it has no cabang)
 */
export function usePromosiSummary({
  branchId,
  period,
  canCards,
  canReport,
}: {
  branchId: string;
  period: SummaryPeriod;
  canCards: boolean;
  canReport: boolean;
}) {
  const [summary, setSummary] = useState<Part<MembershipSummary>>(idle);
  const [attention, setAttention] = useState<Part<MembershipAttention>>(idle);
  const [report, setReport] = useState<Part<MembershipReport>>(idle);

  useEffect(() => {
    if (!canCards) return;
    let live = true;
    const range = periodRange(period);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSummary((current) => ({ ...current, loading: true, error: null }));
    membershipService
      .summary({ ...range, branchId: branchId || undefined })
      .then((data) => live && setSummary({ data, loading: false, error: null }))
      .catch(
        (err) =>
          live &&
          setSummary({ data: null, loading: false, error: failed(err, "Gagal memuat ringkasan.") }),
      );

    return () => {
      live = false;
    };
  }, [branchId, period, canCards]);

  useEffect(() => {
    if (!canCards) return;
    let live = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttention((current) => ({ ...current, loading: true, error: null }));
    membershipService
      .attention({ branchId: branchId || undefined, withinDays: 14 })
      .then((data) => live && setAttention({ data, loading: false, error: null }))
      .catch(
        (err) =>
          live &&
          setAttention({
            data: null,
            loading: false,
            error: failed(err, "Gagal memuat daftar perlu tindakan."),
          }),
      );

    return () => {
      live = false;
    };
  }, [branchId, canCards]);

  useEffect(() => {
    if (!canReport) return;
    let live = true;
    const range = periodRange(period);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport((current) => ({ ...current, loading: true, error: null }));
    membershipService
      .report(range)
      .then((data) => live && setReport({ data, loading: false, error: null }))
      .catch(
        (err) =>
          live &&
          setReport({ data: null, loading: false, error: failed(err, "Gagal memuat kinerja paket.") }),
      );

    return () => {
      live = false;
    };
  }, [period, canReport]);

  return { summary, attention, report };
}
