"use client";

import { useEffect, useState } from "react";

import { Alert, Card, Spinner } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/services/api-error";
import { productBatchService } from "@/services/productBatch.service";
import { formatQty } from "@/utils/decimal";
import type { ProductBatch } from "@/types/inventory";

import { ExpiryBadge } from "./ExpiryBadge";

/**
 * One product's lots, on its detail page — PCR-013's "tab Batch + hari ke
 * expired".
 *
 * A PANEL RATHER THAN A TAB, and the difference is worth stating. The rest of
 * this screen is a column of cards read top to bottom; a tab strip for a single
 * extra view would hide it behind a click and make the page two shapes. What the
 * AC is actually asking for is that a person looking at a product can see its
 * lots without going somewhere else, and a card does that.
 *
 * ONLY FOR PRODUCTS THAT EXPIRE. A product with `hasExpiry: false` still has one
 * internal lot per receipt — the API creates a default so quantities have
 * somewhere to live — and listing those would be showing plumbing to somebody
 * who never asked about batches.
 *
 * FETCHES ITS OWN ROWS rather than taking them from the detail response: the
 * product read does not carry lots, and folding them in would make every
 * catalogue read pay for a list most screens never show.
 */
export function ProductBatchPanel({ productId }: { productId: string }) {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    productBatchService
      .list({
        productId,
        /**
         * Lots that still hold something. An exhausted lot is history the stock
         * card already tells better — with the movement that emptied it — while
         * this card answers "what is on the shelf, and when does it turn".
         */
        hasRemaining: true,
        limit: 50,
      })
      .then((result) => {
        if (!active) return;
        setBatches(result.items);
        setTotal(result.pagination.total);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Daftar batch gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId]);

  return (
    <Card
      title="Batch & kedaluwarsa"
      description="Batch yang masih ada isinya, paling dekat kedaluwarsa di atas — urutan yang sama dengan yang dipakai FEFO saat barang keluar."
    >
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Spinner /> Memuat batch…
        </div>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : batches.length === 0 ? (
        <p className="py-6 text-sm text-muted">
          Belum ada batch dengan sisa stok untuk produk ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode batch</TableHead>
                <TableHead>Gudang</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch._id}>
                  <TableCell className="tabular-nums text-xs">
                    {batch.batchCode ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted">
                    {batch.warehouseName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(batch.qtyRemaining)}
                  </TableCell>
                  <TableCell>
                    {/*
                      The badge carries the "hari ke expired" the AC asks for and
                      the colour band with it — red under 7 days, amber under 30.
                      A lot with no expiry shows nothing rather than a zero, which
                      would read as "expires today".
                    */}
                    {batch.expiryDate ? (
                      <ExpiryBadge date={batch.expiryDate} />
                    ) : (
                      <span className="text-xs text-muted">
                        Tidak kedaluwarsa
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {total > batches.length && (
            <p className="mt-3 text-xs text-muted">
              Menampilkan {batches.length} dari {total} batch. Selengkapnya di
              Inventory → Batch &amp; Expired.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
