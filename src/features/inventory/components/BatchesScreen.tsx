"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/utils/date";
import { formatMoney, formatQty, multiplyDecimals, sumDecimals, toMinor } from "@/utils/decimal";

import { useInventoryDemo } from "../hooks/useInventoryDemo";
import { ExpiryBadge } from "./ExpiryBadge";

type Horizon = "7" | "30" | "90" | "all";

const HORIZONS: Array<{ value: Horizon; label: string }> = [
  { value: "7", label: "Kritis — 7 hari" },
  { value: "30", label: "Perhatian — 30 hari" },
  { value: "90", label: "3 bulan" },
  { value: "all", label: "Semua lot" },
];

/**
 * Every lot across the catalogue, ordered by how soon it expires.
 *
 * WHY THIS IS A SCREEN AND NOT A TAB. The batch tab on the stock card answers
 * "which lots does THIS product have" — a question you ask while looking at one
 * item. This screen answers the opposite one: "what in the whole shop is about
 * to go bad", which is a question you ask on a Monday morning with no particular
 * product in mind, and which nobody would find by clicking through products one
 * at a time.
 *
 * ALREADY-EXPIRED LOTS SORT FIRST and are counted separately. Stock that expired
 * last week and is still sellable on the shelf is the most urgent thing this
 * module can report; folding it into "expiring soon" would bury the one row that
 * needs acting on today under thirty that can wait a month.
 *
 * Exhausted lots are hidden by default but not deleted — a lot that has sold out
 * is history, and the toggle brings it back for anyone auditing what happened to
 * a specific batch code.
 */
export function BatchesScreen() {
  const { products, warehouses, batches } = useInventoryDemo();

  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [horizon, setHorizon] = useState<Horizon>("30");
  const [showSpent, setShowSpent] = useState(false);

  const rows = useMemo(() => {
    return batches
      .filter((batch) => warehouseId === "all" || batch.warehouseId === warehouseId)
      .filter((batch) => showSpent || (toMinor(batch.qtyRemaining) ?? 0n) > 0n)
      .filter((batch) => {
        if (horizon === "all") return true;
        if (!batch.expiryDate) return false;
        return daysUntil(batch.expiryDate) <= Number(horizon);
      })
      .sort((a, b) => {
        // Lots with no expiry sink to the bottom of a report about expiry.
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      });
  }, [batches, warehouseId, horizon, showSpent]);

  const live = batches.filter((batch) => (toMinor(batch.qtyRemaining) ?? 0n) > 0n);
  const expired = live.filter(
    (batch) => batch.expiryDate && daysUntil(batch.expiryDate) < 0,
  );
  const critical = live.filter(
    (batch) =>
      batch.expiryDate && daysUntil(batch.expiryDate) >= 0 && daysUntil(batch.expiryDate) < 7,
  );
  const soon = live.filter(
    (batch) =>
      batch.expiryDate && daysUntil(batch.expiryDate) >= 7 && daysUntil(batch.expiryDate) <= 30,
  );

  const atRiskValue = sumDecimals(
    [...expired, ...critical, ...soon].map((batch) =>
      multiplyDecimals(batch.qtyRemaining, batch.costPerUnit),
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Sudah lewat tanggal"
          value={String(expired.length)}
          note="masih ada sisa stok"
          tone={expired.length > 0 ? "danger" : "default"}
        />
        <Stat
          label="Kritis — kurang 7 hari"
          value={String(critical.length)}
          note="lot perlu tindakan minggu ini"
          tone={critical.length > 0 ? "danger" : "default"}
        />
        <Stat
          label="Perhatian — 30 hari"
          value={String(soon.length)}
          note="masih bisa dijual normal"
          tone={soon.length > 0 ? "warning" : "default"}
        />
        <Stat
          label="Nilai berisiko"
          value={formatMoney(atRiskValue)}
          note="sisa qty × harga beli lot"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="w-56" aria-label="Gudang">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua gudang</SelectItem>
            {warehouses.map((warehouse) => (
              <SelectItem key={warehouse._id} value={warehouse._id}>
                {warehouse.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={horizon} onValueChange={(value) => setHorizon(value as Horizon)}>
          <SelectTrigger className="w-48" aria-label="Rentang kedaluwarsa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HORIZONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showSpent}
            onChange={(event) => setShowSpent(event.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Tampilkan lot yang sudah habis
        </label>

        <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
          {rows.length} lot
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Kode batch</th>
              <th className="px-4 py-2.5 text-left font-medium">Produk</th>
              <th className="px-4 py-2.5 text-left font-medium">Gudang</th>
              <th className="px-4 py-2.5 text-left font-medium">Kedaluwarsa</th>
              <th className="px-4 py-2.5 text-right font-medium">Sisa / awal</th>
              <th className="px-4 py-2.5 text-right font-medium">Harga beli lot</th>
              <th className="px-4 py-2.5 text-right font-medium">Nilai sisa</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Tidak ada lot di rentang ini
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Longgarkan rentangnya, atau pilih gudang lain.
                  </p>
                </td>
              </tr>
            )}

            {rows.map((batch) => {
              const product = products.find((p) => p._id === batch.productId);
              const warehouse = warehouses.find((w) => w._id === batch.warehouseId);
              const remaining = toMinor(batch.qtyRemaining) ?? 0n;
              const spent = remaining <= 0n;

              return (
                <tr
                  key={batch._id}
                  className={cn("border-b border-border/60 last:border-0", spent && "opacity-55")}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs">{batch.batchCode}</span>
                    {batch.isConsignment && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-transparent bg-secondary/25 text-secondary-foreground"
                      >
                        konsinyasi
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium">{product?.name ?? "—"}</p>
                    <p className="font-mono text-xs text-muted">{product?.sku}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">{warehouse?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {batch.expiryDate ? (
                      <ExpiryBadge date={batch.expiryDate} />
                    ) : (
                      <span className="text-xs text-muted">tanpa expiry</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono text-sm tabular-nums",
                      remaining < 0n && "font-semibold text-danger",
                    )}
                  >
                    {formatQty(batch.qtyRemaining)}
                    <span className="text-xs text-muted">
                      {" "}
                      / {formatQty(batch.initialQty)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
                    {formatMoney(batch.costPerUnit)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {spent
                      ? "—"
                      : formatMoney(
                          multiplyDecimals(batch.qtyRemaining, batch.costPerUnit),
                        )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          Lot dibuat otomatis saat barang masuk untuk produk yang punya masa
          kedaluwarsa, atau yang datang sebagai konsinyasi. Urutannya sekaligus
          urutan pengambilan: <b>yang paling dekat kedaluwarsa keluar duluan</b>.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        tone === "danger" && "border-danger/40 bg-danger/5",
        tone === "warning" && "border-secondary/50 bg-secondary/10",
        tone === "default" && "border-border",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono text-xl font-semibold tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}
