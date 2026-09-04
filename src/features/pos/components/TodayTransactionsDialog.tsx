"use client";

import { useEffect, useState } from "react";
import { Receipt, RotateCcw, Ban } from "lucide-react";

import { Alert, Pagination, Spinner } from "@/components";
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
}: {
  open: boolean;
  onVoid: (sale: PosTransaction) => void;
  onReturn: (sale: PosTransaction) => void;
  onReceipt: (sale: PosTransaction) => void;
  onOpenChange: (open: boolean) => void;
  /** Bumped by the caller after a void or return, to re-read the list. */
  reloadKey?: number;
}) {
  const [sales, setSales] = useState<PosTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  }, [open, page, reloadKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transaksi hari ini</DialogTitle>
          <DialogDescription>
            Pilih transaksi untuk dibatalkan, diretur, atau dicetak ulang.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {loading && sales.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat…
          </div>
        ) : sales.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Belum ada penjualan hari ini.
          </p>
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
                    </div>
                    <span className="block text-xs tabular-nums text-muted">
                      {paidAtLabel(sale.paidAt)} · {sale.items.length} item ·{" "}
                      {formatMoney(sale.totals?.grandTotal ?? "0")}
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
