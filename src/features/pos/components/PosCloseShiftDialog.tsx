"use client";

import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import { formatMoney } from "@/utils/decimal";
import type { PosShift, PosTransaction, PosXReport } from "@/types/api";

/** Digits only — "500.000" is five hundred thousand in Indonesian, not 500. */
const WHOLE_RUPIAH = /^\d+$/;

/** Banknotes and coins a till holds, largest first. */
const DENOMINATIONS = [
  100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100,
];

/** The drawer is one card whatever cash channels the shift used. */
const CASH = "cash";

/** One card in the list: a payment method, what it should hold, what was counted. */
interface Method {
  /** `"cash"` for the drawer, otherwise the channel's id. */
  key: string;
  name: string;
  expected: string;
  /** What the shift sold through it — and, for cash, the opening float apart. */
  sales: string;
  refunded: string;
}

const rupiah = (value: number | string) => formatMoney(String(value));

/**
 * Tutup Kasir — the Z-Report (FR-9), counting EVERY payment method.
 *
 * A DRAWER IS NOT THE ONLY THING TO RECONCILE. A shift that took QRIS and card
 * has an EDC batch and a QRIS dashboard to match, and a variance there is as
 * real as a short drawer. So each method used in the shift is a card — what the
 * books expect, what the cashier counted, the gap — and "Lihat detail" opens the
 * sales behind it and a box for the count (for cash, a pecahan calculator too).
 *
 * THE COUNT IS ENTERED IN THE DETAIL VIEW, and Tutup Kasir does not grey out
 * while one is missing: it says which methods are still uncounted when pressed,
 * the same way the till's other dialogs refuse.
 *
 * A LARGE VARIANCE DOES NOT BLOCK CLOSING. FR-9 is explicit and the reason is
 * practical: a shop cannot stop trading tomorrow because money went missing
 * today, and a system that refused would be worked around by counting the drawer
 * to match. It asks for a note instead, which is what an investigation needs.
 */
export function PosCloseShiftDialog({
  shift,
  open,
  onClosed,
  onOpenChange,
}: {
  shift: PosShift;
  open: boolean;
  onClosed: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [report, setReport] = useState<PosXReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** What the cashier has counted, by method key. Absent = not counted yet. */
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;

    /* eslint-disable react-hooks/set-state-in-effect */
    setReport(null);
    setLoadError(null);
    setCounted({});
    setViewing(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    posService
      .xReport(shift._id)
      .then((result) => {
        if (active) setReport(result);
      })
      .catch(() => {
        if (active) setLoadError("Laporan shift gagal dimuat. Coba lagi.");
      });

    return () => {
      active = false;
    };
  }, [open, shift._id]);

  const methods = useMemo<Method[]>(() => {
    if (!report) return [];

    const cash: Method = {
      key: CASH,
      name: "Kas",
      expected: report.totals.expectedCash,
      sales: String(
        Number(report.totals.cashTakings) + Number(report.refunds.cashRefunds),
      ),
      refunded: report.refunds.cashRefunds,
    };

    const others = report.breakdown
      .filter((row) => row.channelType !== "cash")
      .map<Method>((row) => ({
        key: row.channelId,
        name: row.channelName,
        expected: row.netAfterRefunds ?? row.net,
        sales: row.net,
        refunded: row.refunded ?? "0",
      }));

    return [cash, ...others];
  }, [report]);

  const viewed = methods.find((method) => method.key === viewing) ?? null;

  const gapOf = (method: Method) =>
    Number(counted[method.key] ?? 0) - Number(method.expected);

  async function submit() {
    if (!report) return;

    const missing = methods.filter(
      (method) => counted[method.key] === undefined,
    );

    if (missing.length > 0) {
      setError(
        `Isi nilai dihitung untuk: ${missing.map((method) => method.name).join(", ")}. Buka "Lihat detail" lalu simpan.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await posService.closeShift(shift._id, {
        countedCash: counted[CASH],
        counts: methods
          .filter((method) => method.key !== CASH)
          .map((method) => ({
            channelId: method.key,
            counted: counted[method.key],
          })),
        closingNotes: notes.trim() || undefined,
      });
      onClosed();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? "Kasir gagal ditutup. Coba lagi.")
          : "Kasir gagal ditutup. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden overflow-y-auto p-4 sm:max-w-md sm:p-6">
        {viewed ? (
          <MethodDetail
            key={viewed.key}
            shift={shift}
            method={viewed}
            isCash={viewed.key === CASH}
            initial={counted[viewed.key] ?? ""}
            onBack={() => setViewing(null)}
            onSave={(value) => {
              setCounted((current) => ({ ...current, [viewed.key]: value }));
              setViewing(null);
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Tutup kasir</DialogTitle>
              <DialogDescription>
                Cocokkan tiap metode pembayaran, lalu tutup kasir.
              </DialogDescription>
            </DialogHeader>

            {loadError && <Alert variant="error">{loadError}</Alert>}

            {!report && !loadError ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                <Spinner /> Memuat…
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted">Kas pembukaan</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(shift.openingCash)}
                  </p>
                </div>

                {methods.map((method) => {
                  const gap = gapOf(method);

                  return (
                    <div
                      key={method.key}
                      className="rounded-lg border border-border"
                    >
                      <dl className="space-y-1 p-3 text-sm">
                        <p className="text-xs text-muted">Jenis pembayaran</p>
                        <p className="font-semibold">{method.name}</p>
                        <div className="flex justify-between pt-1">
                          <dt className="text-muted">Nilai seharusnya</dt>
                          <dd className="tabular-nums">
                            {formatMoney(method.expected)}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Nilai dihitung</dt>
                          <dd className="tabular-nums">
                            {rupiah(counted[method.key] ?? "0")}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Perbedaan</dt>
                          <dd
                            className={
                              gap === 0
                                ? "tabular-nums text-success"
                                : "tabular-nums text-danger"
                            }
                          >
                            {gap < 0 ? "−" : ""}
                            {rupiah(Math.abs(gap))}
                          </dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between border-t border-border px-3 py-2.5 text-sm font-semibold text-primary"
                        onClick={() => setViewing(method.key)}
                      >
                        Lihat detail
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  );
                })}

                <div className="space-y-2">
                  <Label htmlFor="closing-notes">Catatan</Label>
                  <Input
                    id="closing-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Kalau ada selisih, tulis alasannya di sini"
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {error && <Alert variant="error">{error}</Alert>}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || !report}
              >
                {submitting && <Spinner />}
                Tutup kasir
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One method's detail: what the shift sold through it, and the box for the count.
 * Cash adds the opening float to the header and a pecahan calculator.
 */
function MethodDetail({
  shift,
  method,
  isCash,
  initial,
  onBack,
  onSave,
}: {
  shift: PosShift;
  method: Method;
  isCash: boolean;
  initial: string;
  onBack: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [denominations, setDenominations] = useState<Record<number, number>>(
    {},
  );
  const [showDenominations, setShowDenominations] = useState(false);
  const [sales, setSales] = useState<PosTransaction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The shift's paid sales, whole pages until none are left (a shift is
  // hundreds of lines at most, and the list endpoint caps a page at 100).
  useEffect(() => {
    let active = true;

    (async () => {
      const all: PosTransaction[] = [];
      for (let page = 1; page <= 10; page += 1) {
        const result = await posService.listTransactions({
          shiftId: shift._id,
          status: "paid",
          page,
          limit: 100,
        });
        all.push(...result.items);
        if (page >= result.pagination.totalPages) break;
      }
      if (active) setSales(all);
    })().catch(() => {
      if (active) setLoadError("Daftar transaksi gagal dimuat.");
    });

    return () => {
      active = false;
    };
  }, [shift._id]);

  /** What THIS method took on each sale — change given is not takings. */
  const rows = useMemo(() => {
    if (!sales) return [];

    return sales
      .map((sale) => {
        const taken = sale.payments
          .filter((payment) =>
            isCash
              ? payment.channelType === "cash"
              : payment.channelId === method.key,
          )
          .reduce(
            (sum, payment) =>
              sum + Number(payment.amount) - Number(payment.change ?? 0),
            0,
          );

        return { id: sale._id, number: sale.transactionNumber, taken };
      })
      .filter((row) => row.taken > 0);
  }, [sales, isCash, method.key]);

  const trimmed = value.trim();
  const valid = WHOLE_RUPIAH.test(trimmed);

  const pecahanTotal = DENOMINATIONS.reduce(
    (sum, face) => sum + face * (denominations[face] ?? 0),
    0,
  );

  function setFace(face: number, count: number) {
    const next = { ...denominations, [face]: Math.max(count, 0) };
    setDenominations(next);
    // The calculator is the way to type the count — the box follows it.
    setValue(
      String(DENOMINATIONS.reduce((sum, f) => sum + f * (next[f] ?? 0), 0)),
    );
  }

  function save() {
    if (!valid) {
      setError("Isi angka rupiah tanpa titik, misalnya 500000.");
      return;
    }
    onSave(String(Number(trimmed)));
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 size-8"
            aria-label="Kembali"
            onClick={onBack}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <DialogTitle>{method.name}</DialogTitle>
        </div>
        <DialogDescription className="sr-only">
          Detail transaksi dan penghitungan {method.name}.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex justify-between gap-2 rounded-lg bg-secondary p-3 text-center text-sm">
          {isCash && (
            <div>
              <p className="text-xs text-muted">Kas awal</p>
              <p className="font-semibold tabular-nums">
                {formatMoney(shift.openingCash)}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted">Hasil penjualan</p>
            <p className="font-semibold tabular-nums">
              {formatMoney(method.sales)}
            </p>
          </div>
          <div>
            <p className="text-xs text-danger">Retur</p>
            <p className="font-semibold tabular-nums text-danger">
              {formatMoney(method.refunded)}
            </p>
          </div>
        </div>

        <div>
          <div className="flex justify-between rounded-lg bg-secondary px-3 py-2 text-xs font-semibold uppercase text-foreground">
            <span>No transaksi</span>
            <span>Total transaksi</span>
          </div>
          {loadError && <p className="py-3 text-sm text-danger">{loadError}</p>}
          {!sales && !loadError ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
              <Spinner /> Memuat…
            </div>
          ) : (
            <ul className="max-h-40 divide-y divide-border overflow-y-auto">
              {rows.length === 0 && !loadError && (
                <li className="py-3 text-center text-sm text-muted">
                  Belum ada transaksi.
                </li>
              )}
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="truncate">{row.number ?? "—"}</span>
                  <span className="shrink-0 tabular-nums">
                    {rupiah(row.taken)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Total</dt>
            <dd className="font-semibold tabular-nums">
              {formatMoney(method.expected)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Total uang dikasir</dt>
            <dd className="font-semibold tabular-nums">
              {rupiah(valid ? Number(trimmed) : 0)}
            </dd>
          </div>
        </dl>

        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
            Rp
          </span>
          <Input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            inputMode="numeric"
            placeholder="0"
            aria-label={`Jumlah ${method.name} dihitung`}
            className="h-11 pl-9 tabular-nums"
          />
        </div>

        {isCash && (
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setShowDenominations((current) => !current)}
            >
              Masukkan pecahan uang tunai
            </Button>

            {showDenominations && (
              <ul className="space-y-1.5">
                {DENOMINATIONS.map((face) => (
                  <li key={face} className="flex items-center gap-2 text-sm">
                    <span className="w-20 tabular-nums">{rupiah(face)}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-7"
                      aria-label={`Kurangi ${face}`}
                      disabled={(denominations[face] ?? 0) <= 0}
                      onClick={() =>
                        setFace(face, (denominations[face] ?? 0) - 1)
                      }
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <Input
                      inputMode="numeric"
                      aria-label={`Jumlah lembar ${face}`}
                      className="h-8 w-14 px-1 text-center tabular-nums"
                      value={
                        (denominations[face] ?? 0) === 0
                          ? ""
                          : String(denominations[face])
                      }
                      placeholder="0"
                      onChange={(event) =>
                        setFace(
                          face,
                          Number(event.target.value.replace(/\D/g, "") || 0),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-7"
                      aria-label={`Tambah ${face}`}
                      onClick={() =>
                        setFace(face, (denominations[face] ?? 0) + 1)
                      }
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    <span className="ml-auto tabular-nums text-muted">
                      {rupiah(face * (denominations[face] ?? 0))}
                    </span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span>Total pecahan</span>
                  <span className="tabular-nums">{rupiah(pecahanTotal)}</span>
                </li>
              </ul>
            )}
          </>
        )}

        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <DialogFooter>
        <Button type="button" className="w-full" onClick={save}>
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}
