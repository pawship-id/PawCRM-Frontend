"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";
import { Can } from "@/features/permissions";
import { isSupplierActive } from "@/types/api";
import type { GoodsReceiptListRow } from "@/types/api";

import { useSupplier } from "../hooks/useSupplier";
import { useSupplierSummaries } from "../hooks/useSupplierSummaries";
import { ConsignmentProductsTable } from "./ConsignmentProductsTable";
import { SupplierStatusBadge } from "./SupplierStatusBadge";
import { SupplierTypeBadge } from "./SupplierTypeBadge";

/** How many recent deliveries the history panel shows before linking out. */
const RECENT_RECEIPTS = 10;

/**
 * One supplier: terms, purchase history, what is owed, and what of theirs is
 * still on the shelf.
 *
 * FOUR SOURCES, ONE SCREEN. The supplier record itself, the payables summary,
 * the purchase summary and the consignment summary each answer a different
 * question, and each is summed server-side across the whole book rather than
 * over a page — so the stats do not move as the history table pages.
 *
 * THE CONSIGNMENT PANEL is the part that does not exist for other suppliers and
 * matters most where it does. Consigned goods sit in the warehouse looking
 * exactly like owned stock, but they belong to the supplier until they sell — so
 * they are NOT in the "sisa utang" figure, and reading the two as one number
 * would either overstate the debt or hide the exposure.
 */
export function SupplierDetail({ supplierId }: { supplierId: string }) {
  const { supplier, loading, error, notFound } = useSupplier(supplierId);
  const summaries = useSupplierSummaries({ supplierId });

  const owed = summaries.outstanding.get(supplierId);
  const bought = summaries.purchases.get(supplierId);
  const consigned = summaries.consignment.get(supplierId);

  const owedMinor = toMinor(owed?.outstanding ?? "0") ?? 0n;
  const overdueMinor = toMinor(owed?.overdueOutstanding ?? "0") ?? 0n;
  const dueSoonMinor = toMinor(owed?.dueSoonOutstanding ?? "0") ?? 0n;
  const consignedMinor = toMinor(consigned?.value ?? "0") ?? 0n;

  if (notFound) {
    return (
      <Alert variant="error">
        Supplier tidak ditemukan. Mungkin sudah dihapus.
      </Alert>
    );
  }

  if (error) return <Alert variant="error">{error}</Alert>;

  if (loading || !supplier) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat data supplier…
      </div>
    );
  }

  const active = isSupplierActive(supplier);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{supplier.name}</h2>
            <SupplierTypeBadge type={supplier.type} />
            <SupplierStatusBadge supplier={supplier} />
          </div>
          <p className="mt-1 text-sm text-muted">{supplier.address ?? "—"}</p>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <Can feature="suppliers" action="update">
            <Button variant="outline" asChild>
              <Link
                href={`/dashboard/purchasing/suppliers/${supplier._id}/edit`}
              >
                Ubah supplier
              </Link>
            </Button>
          </Can>
          {/* Hidden rather than disabled when the vendor is deactivated: the
              server refuses such a receipt, so offering the button would only
              lead to a 400 the user cannot act on from that screen. */}
          {active && supplier.deletedAt === null && (
            <Can feature="goodsReceipts" action="create">
              <Button asChild>
                <Link
                  href={`/dashboard/purchasing/receipts/new?supplier=${supplier._id}`}
                >
                  Terima barang
                </Link>
              </Button>
            </Can>
          )}
        </div>
      </div>

      {!active && supplier.deletedAt === null && (
        <Alert variant="info">
          Supplier ini nonaktif — tidak muncul saat membuat penerimaan barang,
          dan penerimaan baru atas namanya akan ditolak. Riwayat di bawah tetap
          utuh.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total pembelian"
          value={formatMoney(bought?.purchased ?? "0")}
          hint="Belum termasuk PPN"
        />
        {/* The hint carries WHEN the debt comes due, not only how many bills it
            is spread over: a million already a month late and a million due in
            June are the same figure above and different decisions. Both splits
            are subsets the server cut from that figure at one instant — nothing
            here subtracts anything — and each line appears only if it is not
            zero, so a vendor with nothing late says nothing about lateness. */}
        <Stat
          label="Sisa utang"
          value={owedMinor > 0n ? formatMoney(owed!.outstanding) : "—"}
          tone={owedMinor > 0n ? "danger" : "default"}
          hint={
            owed ? (
              <>
                {owed.invoiceCount} faktur belum lunas
                {overdueMinor > 0n && (
                  <span className="block text-danger">
                    {formatMoney(owed.overdueOutstanding)} lewat jatuh tempo
                  </span>
                )}
                {dueSoonMinor > 0n && (
                  <span className="block">
                    {formatMoney(owed.dueSoonOutstanding)} jatuh tempo
                    {summaries.horizonDays === null
                      ? " sebentar lagi"
                      : ` dalam ${summaries.horizonDays} hari`}
                  </span>
                )}
              </>
            ) : (
              "Tidak ada utang"
            )
          }
        />
        <Stat
          label="Penerimaan"
          value={String(bought?.receiptCount ?? 0)}
          hint={
            bought?.lastReceiptDate
              ? `Terakhir ${formatDate(bought.lastReceiptDate)}`
              : "Belum pernah kirim"
          }
        />
        <Stat label="Termin" value={`${supplier.paymentTermDays} hari`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card title="Kontak & administrasi">
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-muted">PIC</dt>
              <dd className="font-medium">{supplier.pic ?? "—"}</dd>
              <dt className="text-muted">Telepon</dt>
              <dd className="font-medium">{supplier.phone ?? "—"}</dd>
              <dt className="text-muted">Email</dt>
              <dd className="truncate font-medium">{supplier.email ?? "—"}</dd>
              <dt className="text-muted">NPWP</dt>
              <dd className="font-mono text-xs">{supplier.npwp ?? "—"}</dd>
              <dt className="text-muted">Catatan</dt>
              <dd className="text-xs">{supplier.notes ?? "—"}</dd>
            </dl>
          </Card>

          {consigned && consignedMinor > 0n && (
            <Card title="Titipan yang masih ada">
              <p className="text-xs text-muted">
                Barang milik supplier ini yang masih di gudang. Belum jadi utang
                — utang baru muncul saat barangnya laku.
              </p>
              <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
                <dt className="text-muted">Nilai</dt>
                <dd className="font-mono font-semibold tabular-nums">
                  {formatMoney(consigned.value)}
                </dd>
                <dt className="text-muted">Kuantitas</dt>
                <dd className="font-mono tabular-nums">
                  {formatQty(consigned.qtyRemaining)}
                </dd>
                <dt className="text-muted">Batch</dt>
                <dd className="font-mono tabular-nums">{consigned.lotCount}</dd>
                <dt className="text-muted">Produk</dt>
                <dd className="font-mono tabular-nums">
                  {consigned.productCount}
                </dd>
              </dl>

              {/*
                THE COUNT ABOVE WAS THE WHOLE ANSWER UNTIL NOW, and it is not one
                a vendor can act on: "3 produk" does not tell them which of their
                goods to collect, restock or write off. The list is what the
                phone call is actually about.
              */}
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-foreground">
                  Produk yang dititipkan
                </p>
                <ConsignmentProductsTable supplierId={supplierId} />
              </div>
            </Card>
          )}
        </div>

        <SupplierReceiptHistory supplierId={supplierId} />
      </div>
    </div>
  );
}

/**
 * The recent deliveries from this supplier.
 *
 * Its own fetch rather than a prop, because it is the only part of this screen
 * that is a LIST — it has its own failure mode (and its own permission:
 * `goodsReceipts:read`, which a role may lack while still seeing the supplier).
 * A tenant that cannot read receipts still gets the whole rest of the page.
 */
function SupplierReceiptHistory({ supplierId }: { supplierId: string }) {
  const [receipts, setReceipts] = useState<GoodsReceiptListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    goodsReceiptService
      .list({ supplierId, limit: RECENT_RECEIPTS, page: 1 })
      .then((result) => {
        if (!active) return;
        setReceipts(result.items);
      })
      .catch((err) => {
        if (!active) return;
        setReceipts([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat riwayat penerimaan.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [supplierId]);

  return (
    <Card title="Riwayat penerimaan">
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
          <Spinner /> Memuat riwayat…
        </div>
      ) : receipts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Belum ada penerimaan dari supplier ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                <th className="py-2 pr-4 text-left font-medium">Nomor</th>
                <th className="py-2 pr-4 text-left font-medium">Tanggal</th>
                <th className="py-2 pr-4 text-left font-medium">Gudang</th>
                <th className="py-2 pr-4 text-right font-medium">Item</th>
                <th className="py-2 text-right font-medium">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr
                  key={receipt._id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/dashboard/purchasing/receipts/${receipt._id}`}
                      className="font-mono text-xs hover:text-primary-hover hover:underline"
                    >
                      {receipt.receiptNumber}
                    </Link>
                    {receipt.purchaseType === "konsinyasi" && (
                      <span className="ml-2 text-[10px] text-muted uppercase">
                        titipan
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {formatDate(receipt.receiptDate)}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {receipt.warehouseName ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums">
                    {receipt.itemCount}
                  </td>
                  <td className="py-2 text-right font-mono text-xs tabular-nums">
                    {formatMoney(receipt.grandTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {receipts.length === RECENT_RECEIPTS && (
            <p className="mt-3 text-xs text-muted">
              Menampilkan {RECENT_RECEIPTS} penerimaan terakhir.{" "}
              <Link
                href={`/dashboard/purchasing/receipts?supplier=${supplierId}`}
                className="hover:text-primary-hover hover:underline"
              >
                Lihat semua
              </Link>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Locale-formatted date; the API sends ISO strings. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  /** A node, not a string: the payables stat breaks its hint over three lines. */
  hint?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[10px] font-medium tracking-widest text-muted uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
