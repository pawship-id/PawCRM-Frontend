"use client";

import { useEffect, useState } from "react";
import { Receipt, RotateCcw, Ban } from "lucide-react";

import { Alert, FilterPills, Pagination, Spinner } from "@/components";
import { useAuth } from "@/features/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Can } from "@/features/permissions";
import { posService } from "@/services/pos.service";
import { formatMoney } from "@/utils/decimal";
import type { PosTransaction } from "@/types/api";

import { listQueued, type QueuedSale } from "../offline/queue";

/** What an unsent sale is waiting for, in the cashier's words. */
const UNSENT_LABEL: Partial<Record<QueuedSale["status"], string>> = {
  pending: "Belum terkirim",
  waiting_cashier: "Menunggu kasir login",
  needs_review: "Perlu dicek admin",
  failed: "Ditolak server",
};

const PAGE_SIZE = 10;

/** Midnight today, as the API wants it. */
function startOfToday(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function paidAtLabel(paidAt: string | null): string {
  if (!paidAt) return "—";

  const at = new Date(paidAt);
  if (Number.isNaN(at.getTime())) return "—";

  return at.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Today's sales — where a void or a return starts (FR-11).
 *
 * TODAY, NOT EVERYTHING. A cashier reaching for this has just rung something up
 * wrong or has a customer at the counter with a bag; in both cases the sale is
 * minutes or hours old. A full history is a different screen for a different
 * question, and defaulting to it would make the common case a search.
 *
 * BOTH ACTIONS ON ONE ROW, gated separately. They are different privileges — a
 * shop may let a senior cashier accept goods back without letting them unwind a
 * sale outright — and showing a button that will refuse is worse than not
 * showing it.
 */
export function TodayTransactionsDialog({
  open,
  onVoid,
  onReturn,
  onReceipt,
  onOpenChange,
  reloadKey = 0,
  offline = false,
}: {
  /**
   * POS offline mode (19 October 2026): selling from the device. The server's
   * list is not asked for; the device's own unsent sales still are.
   */
  offline?: boolean;
  open: boolean;
  onVoid: (sale: PosTransaction) => void;
  onReturn: (sale: PosTransaction) => void;
  onReceipt: (sale: PosTransaction) => void;
  onOpenChange: (open: boolean) => void;
  /** Bumped by the caller after a void or return, to re-read the list. */
  reloadKey?: number;
}) {
  const { user } = useAuth();
  /*
    WHOSE SALES (19 October 2026). The list is every cashier's at this branch —
    a supervisor reprints and voids for others — and "Transaksi saya" narrows it
    to the ones this account rang up, which is what a cashier usually wants.
  */
  const [whose, setWhose] = useState<"all" | "mine">("all");
  const mine = whose === "mine" && user ? user._id : null;
  const [sales, setSales] = useState<PosTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    SALES RUNG UP ON THIS DEVICE THAT THE SERVER DOES NOT HAVE YET (offline
    mode) — today's, newest first, above the server's list. Once one syncs it
    leaves this list and appears in the other, so nothing is listed twice.
  */
  const [unsent, setUnsent] = useState<QueuedSale[]>([]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const since = startOfToday();
    void listQueued()
      .then((records) => {
        if (!active) return;
        setUnsent(
          records.filter(
            (record) =>
              record.status !== "synced" &&
              record.status !== "rejected" &&
              record.sale.paidAt >= since &&
              (!mine || record.sale.cashierUserId === mine),
          ),
        );
      })
      .catch(() => {
        if (active) setUnsent([]);
      });
    return () => {
      active = false;
    };
  }, [open, reloadKey, mine]);

  useEffect(() => {
    if (!open) return;

    if (offline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSales([]);
      setTotal(0);
      setTotalPages(1);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;

    setLoading(true);
    setError(null);

    posService
      .listTransactions({
        page,
        limit: PAGE_SIZE,
        // Voided sales are listed too: a cashier looking for one needs to see
        // that it is already cancelled rather than wonder where it went.
        status: ["paid", "void"],
        paidFrom: startOfToday(),
        ...(mine ? { createdBy: mine } : {}),
      })
      .then((result) => {
        if (!active) return;
        setSales(result.items);
        setTotalPages(result.pagination.totalPages);
        setTotal(result.pagination.total);
      })
      .catch(() => {
        if (active) setError("Daftar transaksi gagal dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, page, reloadKey, offline, mine]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transaksi hari ini</DialogTitle>
          <DialogDescription>
            Pilih transaksi untuk dibatalkan, diretur, atau dicetak ulang.
          </DialogDescription>
        </DialogHeader>

        <FilterPills
          ariaLabel="Transaksi siapa"
          options={[
            { value: "all", label: "Semua kasir" },
            { value: "mine", label: "Transaksi saya" },
          ]}
          value={whose}
          onChange={(value: "all" | "mine") => {
            setWhose(value);
            setPage(1);
          }}
        />

        {error && <Alert variant="error">{error}</Alert>}
        {offline && (
          <Alert variant="info">
            Mode offline: yang tampil hanya transaksi di perangkat ini yang
            belum terkirim. Batalkan dan retur bisa dilakukan setelah online.
          </Alert>
        )}

        {unsent.length > 0 && (
          <ul className="divide-y divide-border rounded-xl bg-surface-hover px-3">
            {unsent.map((record) => (
              <li
                key={record.clientTxnId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium tabular-nums text-foreground">
                      {record.sale.transactionNumber}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-transparent bg-tint-warning text-secondary-foreground"
                    >
                      {UNSENT_LABEL[record.status] ?? "Belum terkirim"}
                    </Badge>
                  </div>
                  <span className="block text-xs tabular-nums text-muted">
                    {paidAtLabel(record.sale.paidAt)} · {record.priced.items.length} item ·{" "}
                    {formatMoney(record.sale.totals.grandTotal)}
                    {record.sale.cashierName ? ` · ${record.sale.cashierName}` : ""}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onReceipt(record.priced)}
                >
                  <Receipt className="size-4" />
                  Struk
                </Button>
              </li>
            ))}
          </ul>
        )}

        {offline ? null : loading && sales.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat…
          </div>
        ) : sales.length === 0 ? (
          unsent.length > 0 ? null : (
            <p className="py-10 text-center text-sm text-muted">
              {mine ? "Belum ada transaksi kamu hari ini." : "Belum ada penjualan hari ini."}
            </p>
          )
        ) : (
          <>
            <ul className="divide-y divide-border">
              {sales.map((sale) => (
                <li
                  key={sale._id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium tabular-nums text-foreground">
                        {sale.transactionNumber}
                      </span>
                      {/* A word, not a colour alone — ui-rules §1.3. */}
                      {sale.status === "void" && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-tint-danger text-danger"
                        >
                          Dibatalkan
                        </Badge>
                      )}
                      {/* Rung up on a till with no connection, posted later. */}
                      {sale.source === "offline" && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-tint-neutral text-muted"
                        >
                          Offline
                        </Badge>
                      )}
                    </div>
                    <span className="block text-xs tabular-nums text-muted">
                      {paidAtLabel(sale.paidAt)} · {sale.items.length} item ·{" "}
                      {formatMoney(sale.totals?.grandTotal ?? "0")}
                      {sale.cashierName ? ` · ${sale.cashierName}` : ""}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onReceipt(sale)}
                    >
                      <Receipt className="size-4" />
                      Struk
                    </Button>

                    {sale.status === "paid" && (
                      <>
                        <Can feature="posTransactions" action="refund">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => onReturn(sale)}
                          >
                            <RotateCcw className="size-4" />
                            Retur
                          </Button>
                        </Can>

                        <Can feature="posTransactions" action="void">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => onVoid(sale)}
                          >
                            <Ban className="size-4" />
                            Batalkan
                          </Button>
                        </Can>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              unit="transaksi"
              unitPlural="transaksi"
              onPageChange={setPage}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
