"use client";

import { useEffect, useState } from "react";

import { Alert, SelectField, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { CASH_ACCOUNT_CATEGORY } from "@/features/accounting";
import { ApiError } from "@/services/api-error";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { reportService } from "@/services/report.service";
import type { ChartOfAccount } from "@/types/accounting";
import type { CommissionPayment, CommissionRow } from "@/types/api";
import { formatMoney, sumDecimals } from "@/utils/decimal";

/**
 * BAYAR KOMISI — the mockup's modal.
 *
 * ONE ACCOUNT FOR ALL OF THEM, ONE JOURNAL EACH. The Owner's rule (21 September
 * 2026): a commission is paid by its own cash transaction and its own journal
 * entry, so three rows here are three BKK/BBK documents — each in its own
 * branch, each naming its groomer — written together or not at all.
 *
 * THE AMOUNT IS NOT EDITABLE HERE. It is the row's commission, adjusted on the
 * row's own page when it needs to be; a figure typed at the moment of paying
 * would be a second place to change it with no reason recorded.
 *
 * A RAW `ui/dialog`, NOT `ConfirmDialog` (§9: "only when the body needs a
 * form"). `ConfirmDialog` puts its children inside `DialogDescription`, a <p>,
 * and this body is a table and a select — a <p> inside a <p> broke hydration
 * the first time somebody pressed Dibayar (21 September 2026).
 *
 * EVERY ACTIVE KAS & BANK ACCOUNT, in code order — the list Tambah transaksi
 * offers, and for the same reason: an account belongs to the company, not to a
 * branch.
 */
export function PayCommissionDialog({
  rows,
  skipped = 0,
  onCancel,
  onPaid,
}: {
  rows: CommissionRow[];
  /** Pending rows left out of the selection — said, not silently dropped. */
  skipped?: number;
  onCancel: () => void;
  onPaid: (payments: CommissionPayment[]) => void;
}) {
  const [accounts, setAccounts] = useState<ChartOfAccount[] | null>(null);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    chartOfAccountsService
      .list({ accountCategory: CASH_ACCOUNT_CATEGORY, limit: 100 })
      .then((result) => {
        if (!active) return;
        const usable = result.items
          .filter((account) => account.isActive)
          .sort((a, b) => a.code.localeCompare(b.code, "id"));
        setAccounts(usable);
        if (usable.length === 1) setAccountId(usable[0]._id);
      })
      .catch(() => {
        if (active) {
          setAccounts([]);
          setError("Daftar akun kas & bank tidak bisa dimuat.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const total = sumDecimals(rows.map((row) => row.amount));
  const bulk = rows.length > 1;

  async function pay() {
    if (busy) return;

    /*
      SAID IN THE DIALOG rather than disabling the button — a button that is
      simply grey does not say which field it is waiting for.
    */
    if (!accountId) {
      setError("Pilih akun kas atau bank dulu.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await reportService.payCommissions({
        rows: rows.map(({ bookingId, groomerUserId }) => ({
          bookingId,
          groomerUserId,
        })),
        accountId,
      });
      onPaid(result.payments);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Tidak bisa membayar. Coba lagi.",
      );
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Bayar komisi</DialogTitle>
          <DialogDescription>
            {bulk
              ? `${rows.length} komisi terpilih`
              : `${rows[0]?.groomerName ?? "Groomer"} · ${rows[0]?.bookingNumber ?? "booking"}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col">
          {bulk && (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-border">
              <Table>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="px-3 py-2 text-sm">
                        {row.groomerName ?? "—"}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm tabular-nums">
                        {row.bookingNumber ?? "—"}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-sm tabular-nums">
                        {formatMoney(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="mt-3 text-sm">
            Total nilai komisi{" "}
            <strong className="tabular-nums">{formatMoney(total)}</strong>
          </p>

          <div className="mt-3">
            {accounts === null ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Memuat akun kas & bank…
              </p>
            ) : (
              <SelectField
                label="Bayar dari akun"
                value={accountId}
                onChange={setAccountId}
                options={accounts.map((account) => ({
                  value: account._id,
                  label: `${account.code} · ${account.name}`,
                }))}
                placeholder="Pilih akun kas atau bank"
                disabled={busy}
                required
              />
            )}
          </div>

          {bulk && (
            <p className="mt-3 text-sm text-muted">
              Satu akun dipakai untuk semuanya — masing-masing tetap dicatat
              sebagai transaksi dan jurnal sendiri.
            </p>
          )}

          {skipped > 0 && (
            <p className="mt-2 text-sm text-muted">
              {skipped} komisi yang belum disetujui tidak ikut dibayar.
            </p>
          )}
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
          <Button onClick={() => void pay()} disabled={busy}>
            {busy && <Spinner size={16} />}
            {busy ? "Membayar…" : "Konfirmasi bayar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
