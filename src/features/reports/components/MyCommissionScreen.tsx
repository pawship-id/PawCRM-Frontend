"use client";

import { useEffect, useState } from "react";

import { Alert, Card, Spinner, TextField } from "@/components";
import { ApiError } from "@/services/api-error";
import { reportService } from "@/services/report.service";
import { formatMoney } from "@/utils/decimal";
import type { MyCommission } from "@/types/api";

/** This month, as `<input type="month">` holds it — in the shop's own clock. */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
 * OUTSTANDING is everything closed and still unpaid, which may span several
 * months and is the number somebody actually wants when they ask "kapan saya
 * dibayar". Showing only the first would answer the question nobody asked.
 *
 * WORK THAT IS EARNED BUT NOT YET CLOSED IS IN NEITHER. It is in `earned` if it
 * falls in the month on screen, and not in `outstanding` until the month is
 * closed — because the shop has not yet accepted it as a debt. Said on screen
 * rather than left as a discrepancy somebody has to ask about.
 */
export function MyCommissionScreen() {
  const [period, setPeriod] = useState(thisMonth);
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
        <TextField
          label="Bulan"
          name="my-commission-period"
          type="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
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
          <Card title={`Bulan ini (${period})`}>
            {data?.earned ? (
              <>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {formatMoney(data.earned.amount)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  dari {data.earned.rows} layanan
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
                : `dari ${outstanding?.recordCount} layanan${
                    outstanding?.periods.length
                      ? ` · ${outstanding.periods.join(", ")}`
                      : ""
                  }`}
            </p>
          </Card>
        </div>
      )}

      {/*
        THE GAP BETWEEN THE TWO NUMBERS, EXPLAINED BEFORE IT IS NOTICED.

        Work finishes, and it earns immediately. It becomes a DEBT only when the
        month is closed — and somebody looking at "Bulan ini: Rp 300.000" beside
        "Belum dibayar: Rp 0" would otherwise reasonably conclude they had been
        paid. Saying it here costs nothing and prevents a conversation that
        starts badly.
      */}
      <Alert variant="info">
        Komisi dihitung saat booking <strong>selesai</strong>, bukan saat
        pelanggan membayar. Angka <strong>Belum dibayar</strong> baru terisi
        setelah pemilik menutup bulannya.
      </Alert>
    </div>
  );
}
