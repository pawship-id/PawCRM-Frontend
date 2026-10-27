"use client";

import { useEffect, useState } from "react";

import { Alert, Card, FilterSelect, Spinner } from "@/components";
import { ApiError } from "@/services/api-error";
import { reportService } from "@/services/report.service";
import { formatMoney } from "@/utils/decimal";
import type { MyCommission } from "@/types/api";

/** This month as `YYYY-MM` — the period the API takes — in the shop's own clock. */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** "2026-10" → "Oktober 2026". Anything unreadable is returned as it came. */
export function monthName(period: string): string {
  const [year, month] = period.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return year && name ? `${name} ${year}` : period;
}

/**
 * THE MONTHS ON OFFER — this one and the 23 before it, newest first.
 *
 * A picker of our own words rather than `<input type="month">`, whose popup is
 * drawn by the browser in the browser's language ("October 2026") and cannot be
 * translated from here (27 October 2026). Two years back covers every payslip
 * question anybody has asked at the counter.
 */
const MONTHS_BACK = 24;

function monthOptions(current: string) {
  const [year, month] = current.split("-").map(Number);
  return Array.from({ length: MONTHS_BACK }, (_, back) => {
    const index = year * 12 + (month - 1) - back;
    const value = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
    return { value, label: monthName(value) };
  });
}

/**
 * KOMISI SAYA — a groomer's own pay, and nobody else's.
 *
 * ─── WHY IT IS A SCREEN OF ITS OWN ─────────────────────────────────────────
 *
 * Rekap Komisi is gated on `users:read`, and rightly: it names every groomer and
 * what they are owed, which is the whole shop's payroll. A groomer has no
 * business holding that grant — so until this existed, somebody could see
 * EVERYBODY's pay or nobody's, and the second is what actually happened.
 *
 * The person comes from the session on the server; there is no parameter here
 * and nothing on this screen can ask about anybody else.
 *
 * ─── TWO NUMBERS, AND THEY ANSWER DIFFERENT QUESTIONS ─────────────────────
 *
 * EARNED is one month's work — what a payslip for September is about.
 * OUTSTANDING is everything APPROVED and still unpaid, which may span several
 * months and is the number somebody actually wants when they ask "kapan saya
 * dibayar". Showing only the first would answer the question nobody asked.
 *
 * WORK THAT IS EARNED BUT NOT YET APPROVED IS IN `earned` ONLY (21 September
 * 2026 — the monthly close was replaced by approval). It is not in
 * `outstanding` until somebody approves it, because the shop has not yet
 * accepted it as owed. Said on screen rather than left as a discrepancy.
 */
export function MyCommissionScreen() {
  const [current] = useState(thisMonth);
  const [period, setPeriod] = useState(current);
  const [data, setData] = useState<MyCommission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // The sanctioned fetch-effect shape — see useCustomers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    reportService
      .myCommissions({ period })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (!active) return;
        setData(null);
        // Our own sentence, never the server's — the API answers in English.
        setError(
          err instanceof ApiError
            ? "Komisi tidak bisa dimuat. Coba lagi."
            : "Komisi tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [period]);

  const outstanding = data?.outstanding;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Periode">
        <FilterSelect
          label="Bulan"
          layout="field"
          active={false}
          value={period}
          options={monthOptions(current)}
          onChange={setPeriod}
          hint="Komisi dihitung per bulan."
        />
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Memuat komisi…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            title={
              period === current
                ? `Bulan ini (${monthName(period)})`
                : monthName(period)
            }
          >
            {data?.earned ? (
              <>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {formatMoney(data.earned.amount)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {/* One commission record is one SESSION (a turn of a
                      booking), not one booking — so the count says sesi. */}
                  dari {data.earned.rows} sesi
                  {data.earned.reversedRows > 0
                    ? ` · ${data.earned.reversedRows} dibatalkan`
                    : ""}
                </p>
              </>
            ) : (
              /*
                "Belum ada" — not "Rp 0". A month with no work yet and a month
                that genuinely earned nothing are different facts, and a zero
                says the second when the first is true.
              */
              <p className="text-sm text-muted">
                Belum ada komisi di bulan ini.
              </p>
            )}
          </Card>

          <Card title="Belum dibayar">
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {formatMoney(outstanding?.amount ?? "0")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {(outstanding?.recordCount ?? 0) === 0
                ? "Tidak ada yang menunggu dibayar."
                : `dari ${outstanding?.recordCount} sesi${
                    outstanding?.periods.length
                      ? ` · ${outstanding.periods.map(monthName).join(", ")}`
                      : ""
                  }`}
            </p>
          </Card>
        </div>
      )}

      {/*
        THE GAP BETWEEN THE TWO NUMBERS, EXPLAINED BEFORE IT IS NOTICED.

        Work that is done and billed earns immediately. It is OWED only once it
        is approved — and somebody looking at "Bulan ini: Rp 300.000" beside
        "Belum dibayar: Rp 0" would otherwise reasonably conclude they had been
        paid. Saying it here costs nothing and prevents a conversation that
        starts badly.
      */}
      <Alert variant="info">
        Komisi dihitung saat booking <strong>selesai</strong> dan fakturnya{" "}
        <strong>terbit</strong>. Angka <strong>Belum dibayar</strong> baru
        terisi setelah komisinya disetujui.
      </Alert>
    </div>
  );
}
