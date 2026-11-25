"use client";

import { ShoppingCart } from "lucide-react";

import { Card } from "@/components";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
import type { HotelStayBooking } from "@/types/api";
import { formatMoney, toMinor } from "@/utils/decimal";

import { shortDate } from "../stay";

/** Where "Bayar di kasir" goes: the till pulls the stay's unbilled part itself. */
export function stayKasirPath(booking: HotelStayBooking): string {
  return `/dashboard/pos?stay=${booking._id}&customer=${booking.customerId}`;
}

/**
 * The stay's bill, at the side of its page (21 November 2026, PLAN-Hotel-V1.md
 * §4.3). Line by line from the booking, then each sale that billed part of it,
 * the goods rung up with it, and what is left for the till.
 *
 * ONE BUTTON, THREE WORDS: nothing billed yet → "Bayar di kasir"; part billed
 * → "Tagih sisanya di kasir"; already in a basket → no pull (the till would
 * refuse a second claim) — the basket is reopened from Keranjang tersimpan.
 */
export function StayKasirCard({
  booking,
  onOpenKasir,
}: {
  booking: HotelStayBooking;
  onOpenKasir?: (path: string) => void;
}) {
  const { can } = usePermissions();
  const lines = [
    {
      key: "stay",
      label: `${booking.service.name} · ${booking.stayFacts.nights} malam`,
      price: booking.service.price,
      off: booking.service.discountAmount ?? null,
    },
    ...booking.service.addons.map((addon) => ({
      key: addon.itemId,
      label: addon.name,
      price: addon.price,
      off: addon.discountAmount ?? null,
    })),
  ];
  const billed = booking.stay.billedAmount ?? "0";
  const left = booking.stayFacts.unbilledAmount;
  const leftMinor = toMinor(left) ?? 0n;
  const bills = booking.stay.bills ?? [];
  const purchases = booking.stay.purchases ?? [];
  const cancelled = booking.status === "cancelled";
  const mayKasir = can("posTransactions", "create");

  return (
    <Card title="Tagihan">
      <div className="flex flex-col gap-2 text-sm">
        {lines.map((line) => (
          <div key={line.key} className="flex justify-between gap-3">
            <span>
              {line.label}
              {line.off && (toMinor(line.off) ?? 0n) > 0n && (
                <span className="block text-xs text-muted">
                  diskon −{formatMoney(line.off)}
                </span>
              )}
            </span>
            <span className="tabular-nums">{formatMoney(line.price)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-border pt-2 font-bold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(booking.netAmount)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">Sudah ditagih</span>
          <span className="tabular-nums">{formatMoney(billed)}</span>
        </div>
        <div className="flex justify-between gap-3 text-base font-bold">
          <span>Belum ditagih</span>
          <span className="tabular-nums">{formatMoney(left)}</span>
        </div>

        {!cancelled && booking.stayFacts.inCart && (
          <p className="rounded-md bg-tint-info px-3 py-2 text-sm">
            Tagihan ini sedang terbuka di keranjang kasir. Lanjutkan dari{" "}
            <b>Keranjang tersimpan</b> di kasir.
          </p>
        )}
        {!cancelled &&
          !booking.stayFacts.inCart &&
          leftMinor > 0n &&
          mayKasir && (
            <Button
              type="button"
              className="mt-2"
              onClick={() => onOpenKasir?.(stayKasirPath(booking))}
            >
              <ShoppingCart className="size-4" />
              {toMinor(billed) ? "Tagih sisanya di kasir" : "Bayar di kasir"}
            </Button>
          )}
        {!cancelled && !booking.stayFacts.inCart && leftMinor > 0n && (
          <p className="text-xs text-muted">
            Barang yang dibeli selama menginap ditambahkan di keranjang yang
            sama, lalu dibayar sekaligus — atau disimpan sebagai tagihan
            terbuka.
          </p>
        )}

        {bills.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
            <h4 className="text-sm font-bold">Struk & pembayaran</h4>
            {bills.map((bill) => (
              <div
                key={bill.posTransactionId}
                className="flex justify-between gap-3"
              >
                <span>
                  <span className="tabular-nums">
                    {bill.transactionNumber ?? "Struk kasir"}
                  </span>
                  <span className="block text-xs text-muted tabular-nums">
                    {shortDate(bill.at.slice(0, 10))}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(bill.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {purchases.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
            <h4 className="text-sm font-bold">Barang selama menginap</h4>
            {purchases.map((row, index) => (
              <div
                key={`${row.posTransactionId}-${index}`}
                className="flex justify-between gap-3"
              >
                <span>
                  {row.name}
                  <span className="ml-1 text-xs text-muted tabular-nums">
                    × {Number(row.qty)}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
