"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Pagination, Spinner } from "@/components";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { formatMoney } from "@/utils/decimal";

import { PURCHASING_CRUMBS } from "../crumbs";
import { useGoodsReceipts } from "../hooks/useGoodsReceipts";
import { PageHeading } from "./PageHeading";
import { ReceiptsTable } from "./ReceiptsTable";
import { ReceiptsToolbar } from "./ReceiptsToolbar";

/**
 * The Purchasing → Penerimaan Barang list.
 *
 * Owns the list query (useGoodsReceipts) and wires the toolbar, table and pager
 * together. Mirrors SuppliersScreen — with no `onChanged` plumbing, because no
 * row here can be mutated: a posted receipt has no edit and no delete.
 *
 * THE HEADER FIGURE IS THE WHOLE BOOK, not this page, and it is summed
 * server-side by `/goods-receipts/summary`. A total that grew as the user paged
 * would be worse than no total, because it looks authoritative. It is also
 * UNFILTERED on purpose: it answers "what have we bought, ever", which is a
 * different question from the one the filters below are asking, and quietly
 * re-scoping it to the current filter would make the same number mean two things.
 */
export function ReceiptsScreen() {
  const { receipts, pagination, query, loading, error, setQuery } =
    useGoodsReceipts();

  const [totalPurchased, setTotalPurchased] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    goodsReceiptService
      .summary()
      .then((result) => {
        if (active) setTotalPurchased(result.totalPurchased);
      })
      // The list is the screen; a missing headline figure is not worth an error
      // banner over data that loaded fine.
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          crumbs={[PURCHASING_CRUMBS.hub, { label: "Penerimaan Barang" }]}
          title="Penerimaan Barang"
        >
          Setiap penerimaan menaikkan stok dan menghitung ulang HPP rata-rata.
          Beli putus langsung mencatat utang ke supplier; konsinyasi tidak.
        </PageHeading>

        {/* Wide: a right-aligned figure beside the heading. Phone: the two have
            wrapped onto separate lines, and a shrink-to-fit box sitting at the
            left edge of an empty row reads as a stray caption — so it takes the
            whole width and puts the label and the number at opposite ends of
            one line, which is how a total is read everywhere else. The
            qualifier stays under both, where it belongs to the pair. */}
        <div className="max-sm:w-full sm:text-right">
          <div className="flex items-baseline gap-3 max-sm:justify-between sm:block">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Total nilai pembelian
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {totalPurchased === null ? "—" : formatMoney(totalPurchased)}
            </p>
          </div>
          <p className="text-xs text-muted">sebelum PPN, seluruh periode</p>
        </div>
      </div>

      <ReceiptsToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && receipts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat data penerimaan…
        </div>
      ) : (
        <>
          <ReceiptsTable
            receipts={receipts}
            loading={loading}
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="penerimaan"
            unitPlural="penerimaan"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}

      <p className="text-xs text-muted">
        Penerimaan tidak bisa diedit atau dihapus. Koreksi dilakukan lewat{" "}
        <Link
          href="/dashboard/purchasing/returns"
          className="text-primary-hover hover:underline"
        >
          retur ke supplier
        </Link>{" "}
        — yang membalik HPP di harga beli aslinya dan mengurangi utang.
      </p>
    </div>
  );
}
