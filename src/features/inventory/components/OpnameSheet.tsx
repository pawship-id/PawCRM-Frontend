"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty, toDecimalString, toMinor } from "@/utils/decimal";

import * as demo from "../data/demoStore";
import { useInventoryDemo } from "../hooks/useInventoryDemo";
import { JournalPreview } from "./JournalPreview";

/**
 * The count sheet: system quantity on one side, what the counter found on the
 * other, and the variance between them.
 *
 * THREE STATES PER LINE, and keeping them distinct is the whole point:
 *   blank    — not counted yet. Writes NOTHING on submit.
 *   equal    — counted, and it matched. Also writes nothing: a movement of zero
 *              is a row with no meaning that every report then has to skip.
 *   differs  — counted, and it did not. Writes one `opname_diff` movement.
 *
 * Treating blank as zero would write off every product the counter never
 * reached, which is how a stock count destroys more data than it corrects. The
 * counter is shown explicitly so nobody submits a half-finished sheet believing
 * it was complete.
 *
 * The variance is valued at the HPP SNAPSHOTTED when the sheet opened, not
 * today's — otherwise a goods receipt arriving mid-count would silently restate
 * the value of a discrepancy that was measured before it.
 */
export function OpnameSheet({ opnameId }: { opnameId: string }) {
  const router = useRouter();
  const { opnames, opnameItems, products, warehouses, sync } = useInventoryDemo();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opname = opnames.find((o) => o._id === opnameId);
  if (!opname) {
    return (
      <Alert variant="error">
        Opname tidak ditemukan. Mungkin data prototype sudah di-reset.
      </Alert>
    );
  }

  const items = opnameItems.filter((item) => item.opnameId === opnameId);
  const counted = items.filter((item) => item.physicalQty !== null);
  const differing = counted.filter((item) => {
    const diff = demo.opnameDiff(item);
    return diff !== null && diff.qty !== 0n;
  });

  const total = opname.status === "submitted" ? opname.totalDiffValue : demo.opnameTotal(opnameId);
  const totalMinor = toMinor(total) ?? 0n;
  const done = opname.status === "submitted";

  // Shrinkage is an expense; a surplus is other income. Both post against
  // inventory, which is the account that actually moved.
  const journal =
    totalMinor === 0n
      ? []
      : totalMinor < 0n
        ? [
            {
              accountCode: "5201",
              accountName: "Kerugian Persediaan",
              debit: toDecimalString(-totalMinor),
              credit: null,
            },
            {
              accountCode: "1201",
              accountName: "Persediaan Barang Dagangan",
              debit: null,
              credit: toDecimalString(-totalMinor),
            },
          ]
        : [
            {
              accountCode: "1201",
              accountName: "Persediaan Barang Dagangan",
              debit: total,
              credit: null,
            },
            {
              accountCode: "4901",
              accountName: "Pendapatan Lain-lain",
              debit: null,
              credit: total,
            },
          ];

  function handleCount(itemId: string, raw: string) {
    demo.setOpnameCount(itemId, raw.trim() === "" ? null : raw);
    sync();
  }

  function handleSubmit() {
    if (counted.length === 0) {
      setError("Isi minimal satu jumlah fisik sebelum menyelesaikan opname.");
      return;
    }

    setSubmitting(true);
    try {
      const written = demo.submitOpname(opnameId);
      sync();
      swalToast(
        written.length === 0
          ? "Opname final — tidak ada selisih, jadi tidak ada pergerakan stok."
          : `Opname final — ${written.length} penyesuaian ditulis ke kartu stok.`,
      );
      router.push("/dashboard/inventory/opname");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-surface p-4">
        <Field label="Nomor" value={opname.opnameNumber} mono />
        <Field
          label="Gudang"
          value={warehouses.find((w) => w._id === opname.warehouseId)?.name ?? "—"}
        />
        <Field
          label="Terisi"
          value={`${counted.length} / ${items.length} produk`}
        />
        <Field label="Baris berselisih" value={String(differing.length)} />
        <div className="ml-auto">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Status
          </p>
          <div className="mt-1">
            {done ? (
              <Badge variant="outline" className="border-transparent bg-success/12 text-success">
                final · {opname.submittedBy}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-transparent bg-secondary/25 text-secondary-foreground"
              >
                draft — tersimpan otomatis
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Produk</th>
              <th className="px-4 py-2.5 text-right font-medium">Qty sistem</th>
              <th className="px-4 py-2.5 text-right font-medium">Qty fisik</th>
              <th className="px-4 py-2.5 text-right font-medium">Selisih</th>
              <th className="px-4 py-2.5 text-right font-medium">HPP snapshot</th>
              <th className="px-4 py-2.5 text-right font-medium">Nilai selisih</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const product = products.find((p) => p._id === item.productId);
              const diff = demo.opnameDiff(item);

              return (
                <tr key={item._id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium">{product?.name ?? "—"}</p>
                    <p className="font-mono text-xs text-muted">{product?.sku}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
                    {formatQty(item.systemQty)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {done ? (
                      <span className="font-mono text-sm tabular-nums">
                        {item.physicalQty === null ? "—" : formatQty(item.physicalQty)}
                      </span>
                    ) : (
                      <Input
                        aria-label={`Qty fisik ${product?.name ?? ""}`}
                        inputMode="decimal"
                        placeholder="—"
                        value={item.physicalQty ?? ""}
                        onChange={(event) => handleCount(item._id, event.target.value)}
                        className="ml-auto max-w-24 text-right font-mono"
                      />
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums",
                      diff === null && "text-muted",
                      diff && diff.qty < 0n && "text-danger",
                      diff && diff.qty > 0n && "text-success",
                    )}
                  >
                    {diff === null
                      ? "—"
                      : `${diff.qty > 0n ? "+" : ""}${formatQty(toDecimalString(diff.qty))}`}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
                    {formatMoney(item.hppAtOpname)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {diff === null ? "—" : formatMoney(toDecimalString(diff.value))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          Baris yang <b>dikosongkan</b> tidak dianggap nol — ia dianggap belum
          dihitung, dan tidak menulis apa pun. Baris yang cocok dengan sistem juga
          tidak menulis apa pun. Hanya yang berselisih yang menghasilkan
          pergerakan stok.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary-hover">
            Total selisih
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-2xl font-semibold tabular-nums",
              totalMinor < 0n ? "text-danger" : totalMinor > 0n ? "text-success" : "text-muted",
            )}
          >
            {formatMoney(total)}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            Σ (qty fisik − qty sistem) × HPP snapshot · opname mengubah
            kuantitas, bukan HPP
          </p>
        </div>

        <JournalPreview
          lines={journal}
          emptyReason="Belum ada selisih — tidak ada jurnal yang perlu dibuat."
        />
      </div>

      {!done && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Menyelesaikan…" : "Selesaikan opname"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/inventory/opname")}
          >
            Simpan draft &amp; kembali
          </Button>
          <p className="w-full text-xs text-muted">
            Setelah final, lembar ini tidak bisa diubah. Koreksi berikutnya
            dilakukan lewat opname baru — kartu stok bersifat append-only.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-semibold", mono && "font-mono")}>{value}</p>
    </div>
  );
}
