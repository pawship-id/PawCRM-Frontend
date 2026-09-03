"use client";

import { useEffect, useState } from "react";

import { Alert, Card, ConfirmDialog, FilterSelect, Spinner, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { reportService } from "@/services/report.service";
import { swalToast } from "@/lib/swal";
import { formatMoney } from "@/utils/decimal";
import { csvToXlsx, saveBlob } from "@/utils/xlsx";
import type { CommissionCloseResult, CommissionRecap } from "@/types/api";

/** This month, as `<input type="month">` holds it — in the shop's own clock. */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Rekap Komisi — FR-6 / PCR-045.
 *
 * WHAT IT IS FOR: closing the month without copying a calendar into a
 * spreadsheet. Until this existed the only way to know what a groomer had earned
 * was to read the day sheet by hand.
 *
 * ONE FIGURE, SUMMED ONCE. The server totals from the same rows it returns —
 * kriteria 6.12 asks that the recap match the sum of its records to the last
 * rupiah, and the surest way to satisfy that is to have only one number.
 *
 * REVERSALS ARE SHOWN, NEVER FOLDED IN. A booking cancelled after it completed
 * un-earns its commission; a payroll figure that quietly included it is wrong in
 * the direction that costs money, and one that hid the reversal is wrong in the
 * direction nobody can audit. So the amount excludes them and the count says how
 * many there were.
 *
 * A MONTH, NOT A DATE RANGE. Payroll is monthly, and a range that crossed a
 * boundary would produce a figure nobody can pay against.
 */
export function CommissionRecapScreen() {
  const [period, setPeriod] = useState(thisMonth);
  const [data, setData] = useState<CommissionRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  /*
    THE BRANCH IS PICKED HERE, like every other posting in this app. A journal
    entry with no branch is invisible to every per-branch report while still
    counting in the total, so the parts stop summing to the whole — the server
    refuses one without it. `soleBranch` fills it in when there is only one.
  */
  const scope = useBranchScope();
  const [pickedBranch, setPickedBranch] = useState("");
  const branchId = pickedBranch || scope.soleBranch;

  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closed, setClosed] = useState<CommissionCloseResult | null>(null);

  /**
   * TUTUP BULAN — posts the accrual.
   *
   *   Dr 5302 Beban Komisi Groomer / Cr 2102 Utang Komisi
   *
   * ASKED FOR CONFIRMATION because it writes to the ledger: it changes the
   * month's reported profit and creates a liability on the balance sheet. That
   * is not something a mis-click should do.
   *
   * SAFE TO RUN TWICE, and the dialog says so. The server claims only the rows
   * no close has taken, so a second run picks up a booking completed late and
   * nothing twice — which is exactly why the button is not disabled after the
   * first close.
   */
  async function closeMonth() {
    if (closing || !branchId) return;

    setClosing(true);
    setCloseError(null);

    try {
      const result = await reportService.closeCommissions({
        period,
        branchId,
      });

      setClosed(result);
      setConfirming(false);

      /* Chrome must never be able to fail a post — see BookingForm. */
      try {
        swalToast(
          result.posted
            ? `Jurnal ${result.entryNumber} dibuat.`
            : "Tidak ada komisi baru untuk dibukukan.",
        );
      } catch {
        /* The panel below already says what happened. */
      }
    } catch (err) {
      setCloseError(
        err instanceof ApiError
          ? err.fullMessage
          : "Tidak bisa membukukan. Coba lagi.",
      );
    } finally {
      setClosing(false);
    }
  }

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    reportService
      .commissions({ period })
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "Akun Anda tidak punya izin membaca data staf, dan rekap komisi termasuk di dalamnya."
            : "Rekap komisi tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [period]);

  /**
   * The file payroll actually uses.
   *
   * BUILT FROM WHAT IS ON SCREEN, not from a second request. The recap is a
   * handful of rows — one per groomer — so streaming it separately would be a
   * second query whose only job is to disagree with the first.
   */
  const exportXlsx = async () => {
    if (!data) return;

    setExporting(true);

    try {
      const header = "Groomer,Jumlah layanan,Dibatalkan,Komisi\n";
      const body = data.rows
        .map(
          (row) =>
            `"${(row.groomerName ?? "—").replace(/"/g, '""')}",${row.rows},${row.reversedRows},${row.amount}`,
        )
        .join("\n");

      const workbook = await csvToXlsx(`${header}${body}`, {
        /* "number", not a money type — the workbook has none, and payroll
           formats the column itself. */
        types: {
          Komisi: "number",
          "Jumlah layanan": "number",
          Dibatalkan: "number",
        },
        sheetName: `Komisi ${period}`,
      });

      saveBlob(workbook, `komisi-${period}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Periode">
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Bulan"
            name="commission-period"
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            hint="Payroll dihitung per bulan."
          />
          {scope.branches.length > 1 && (
            <FilterSelect
              label="Cabang"
              ariaLabel="Cabang untuk pembukuan"
              value={pickedBranch}
              options={scope.branches.map((branch) => ({
                value: branch._id,
                label: branch.name,
              }))}
              placeholder="Pilih cabang"
              onChange={setPickedBranch}
            />
          )}

          <Button
            type="button"
            variant="secondary"
            disabled={exporting || !data || data.rows.length === 0}
            onClick={exportXlsx}
          >
            {exporting ? "Menyiapkan…" : "Unduh Excel"}
          </Button>

          {/*
            POSTING IS NOT READING. The recap rides on `users:read` — a payroll
            question. This writes a journal entry that changes the month's
            reported profit, so it takes the grant a manual entry takes.
          */}
          <Can feature="journalEntries" action="create">
            <Button
              type="button"
              disabled={closing || !branchId}
              onClick={() => setConfirming(true)}
            >
              Tutup bulan
            </Button>
          </Can>
        </div>

        {!branchId && scope.branches.length > 1 && (
          <p className="mt-2 text-xs text-muted">
            Pilih cabang dulu — jurnal komisi dibukukan per cabang.
          </p>
        )}
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {/*
        WHAT THE CLOSE DID, kept on screen rather than left to a toast. Somebody
        who posted a month's wages should be able to write the entry number down
        without repeating the action to see it again.
      */}
      {closed && (
        <Alert variant={closed.posted ? "success" : "info"}>
          {closed.posted ? (
            <>
              <span className="block font-semibold">
                Komisi {closed.period} dibukukan — jurnal {closed.entryNumber}.
              </span>
              <span className="block">
                {formatMoney(closed.amount ?? "0")} untuk {closed.groomerCount}{" "}
                groomer, dari {closed.recordCount} layanan.
              </span>
            </>
          ) : (
            <>Tidak ada komisi baru untuk dibukukan di {closed.period}.</>
          )}
        </Alert>
      )}

      {/*
        SAID OUT LOUD RATHER THAN HIDDEN. Commission is earned when the work is
        COMPLETED, not when the customer pays — a customer who settles a month
        later on an invoice does not postpone a groomer's claim on last month's
        work. The consequence is that work completed and never paid for still
        earns, and the owner should decide what to do about that rather than
        discover it.
      */}
      <Alert variant="info">
        Komisi dihitung saat booking <strong>selesai</strong>, bukan saat
        dibayar. Pekerjaan yang selesai tapi belum dibayar pelanggan tetap
        menghasilkan komisi.
      </Alert>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Memuat rekap…
        </div>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          Belum ada komisi di bulan ini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Groomer</TableHead>
                <TableHead className="text-right">Layanan</TableHead>
                <TableHead className="text-right">Dibatalkan</TableHead>
                <TableHead className="text-right">Komisi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows.map((row) => (
                <TableRow key={row.groomerUserId}>
                  <TableCell>{row.groomerName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.rows}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted">
                    {/*
                      COUNTED, NEVER SUBTRACTED SILENTLY. A reversal is somebody
                      being un-paid, and it belongs in front of whoever signs the
                      payroll.
                    */}
                    {row.reversedRows > 0 ? row.reversedRows : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatMoney(row.amount)}
                  </TableCell>
                </TableRow>
              ))}

              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right tabular-nums font-bold">
                  {formatMoney(data?.total ?? "0")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Tutup komisi ${period}?`}
          confirmLabel={closing ? "Membukukan…" : "Bukukan"}
          busy={closing}
          error={closeError}
          onConfirm={() => void closeMonth()}
          onCancel={() => setConfirming(false)}
        >
          {/*
            WHAT IT WILL DO, in the shop's words rather than the ledger's. "Dr
            5302 / Cr 2102" is correct and tells a shop owner nothing.
          */}
          <p>
            Komisi bulan ini akan dicatat sebagai <strong>beban bulan ini</strong>{" "}
            dan <strong>utang ke groomer</strong> — meskipun belum dibayar.
          </p>
          <p className="mt-2">
            Aman dijalankan lagi nanti: yang sudah dibukukan tidak akan terhitung
            dua kali, dan booking yang baru selesai belakangan akan ikut di
            pembukuan berikutnya.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
