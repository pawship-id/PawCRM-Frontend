"use client";

import { useState } from "react";
import Link from "next/link";

import { Alert, ConfirmDialog, Pagination, Spinner } from "@/components";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { purchaseReturnService } from "@/services/purchaseReturn.service";
import type { PurchaseReturnListRow } from "@/types/api";

import { PURCHASING_CRUMBS } from "../crumbs";
import { usePurchaseReturns } from "../hooks/usePurchaseReturns";
import { PageHeading } from "./PageHeading";
import { PurchaseReturnsTable } from "./PurchaseReturnsTable";
import { PurchaseReturnsToolbar } from "./PurchaseReturnsToolbar";

/**
 * The Purchasing → Retur ke Supplier list.
 *
 * Owns the list query (usePurchaseReturns) and wires the toolbar, table, pager
 * and the discard confirmation together. Mirrors ReceiptsScreen, with the one
 * structural difference that a row here CAN be mutated: a draft may be discarded,
 * which is why this screen has `refetch` plumbing and that one does not.
 *
 * DISCARD IS A DRAFT-ONLY OPERATION AND IT COSTS NOTHING, which is the opposite
 * of how a destructive-looking button usually reads — so the dialog says so. A
 * draft never moved stock and never reserved anything: only SUBMITTED returns
 * consume a receipt line's returnable allowance, so throwing one away frees
 * nothing and blocks nothing. What is lost is the typing.
 *
 * THE SUBMITTED ONES CANNOT BE TOUCHED FROM HERE AT ALL, and the footnote
 * explains why rather than leaving a user hunting for a delete that is absent by
 * design: a submitted return already took the stock out and reduced the payable,
 * and undoing that would have to unwind both. A wrong return is corrected by
 * receiving the goods back in.
 */
export function PurchaseReturnsScreen() {
  const { returns, pagination, query, loading, error, setQuery, refetch } =
    usePurchaseReturns();

  const [pendingDiscard, setPendingDiscard] =
    useState<PurchaseReturnListRow | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  async function handleDiscard() {
    if (!pendingDiscard) return;

    setDiscarding(true);
    setDiscardError(null);

    try {
      await purchaseReturnService.remove(pendingDiscard._id);
      swalToast(`Draft ${pendingDiscard.returnNumber} dibuang.`);
      setPendingDiscard(null);
      refetch();
    } catch (caught) {
      // A 409 here means somebody submitted it while the dialog was open. The
      // message says so rather than retrying: the goods have left, and a silent
      // retry would report success for something that did not happen.
      setDiscardError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Draft gagal dibuang. Coba lagi.",
      );
    } finally {
      setDiscarding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        crumbs={[PURCHASING_CRUMBS.hub, { label: "Retur ke Supplier" }]}
        title="Retur ke Supplier"
      >
        Retur selalu ditarik dari penerimaan aslinya, sehingga harga beli asli
        ikut terbawa — itulah yang membuat perhitungan HPP tetap benar setelah
        barang dikembalikan.
      </PageHeading>

      <PurchaseReturnsToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && returns.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat data retur…
        </div>
      ) : (
        <>
          <PurchaseReturnsTable
            returns={returns}
            loading={loading}
            search={query.search}
            onDiscard={(row) => {
              setDiscardError(null);
              setPendingDiscard(row);
            }}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="retur"
            unitPlural="retur"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}

      <p className="text-xs text-muted">
        Retur yang sudah final tidak bisa diedit atau dihapus — stok sudah
        keluar, HPP sudah dibalik di harga beli asli, dan utang supplier sudah
        berkurang. Koreksinya adalah menerima kembali barangnya lewat{" "}
        <Link
          href="/dashboard/purchasing/receipts/new"
          className="text-primary-hover hover:underline"
        >
          penerimaan barang
        </Link>
        .
      </p>

      {pendingDiscard && (
        <ConfirmDialog
          title="Buang draft retur?"
          confirmLabel="Buang draft"
          destructive
          busy={discarding}
          error={discardError}
          onConfirm={handleDiscard}
          onCancel={() => setPendingDiscard(null)}
        >
          {/* Inline fragments, not <p>: DialogDescription is itself a <p>. */}
          <>
            Draft <b className="tabular-nums">{pendingDiscard.returnNumber}</b>{" "}
            beserta seluruh barisnya akan dibuang. Tidak ada stok yang berubah
            dan tidak ada utang yang bergerak — draft memang belum pernah
            menulis apa pun.
            <span className="mt-2 block">
              Jatah retur di penerimaan asalnya juga tidak terpengaruh: yang
              memotong jatah hanya retur yang sudah final, bukan draft.
            </span>
          </>
        </ConfirmDialog>
      )}
    </div>
  );
}
