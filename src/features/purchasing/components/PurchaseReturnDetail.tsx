"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Card, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { purchaseReturnService } from "@/services/purchaseReturn.service";
import { formatMoney, formatQty } from "@/utils/decimal";
import type { PurchaseReturnItemInput } from "@/types/api";

import { useGoodsReceipt } from "../hooks/useGoodsReceipt";
import { usePurchaseReturn } from "../hooks/usePurchaseReturn";
import { useReturnPreview } from "../hooks/useReturnPreview";
import { PurchaseReturnStatusBadge } from "./PurchaseReturnStatusBadge";
import { ReturnPreviewPanel } from "./ReturnPreviewPanel";
import {
  ReturnLinesEditor,
  chosenLines,
  exceedsRemaining,
  type ReturnLineDrafts,
} from "./ReturnLinesEditor";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * One purchase return: what is going back, what it is worth, and — while it is
 * still a draft — the controls that change or complete it.
 *
 * TWO SCREENS IN ONE, SPLIT BY STATUS, and the split is not cosmetic:
 *
 *   draft     — editable. The lines can be changed, the date corrected, the
 *               whole thing previewed, submitted or discarded. Nothing has moved.
 *   submitted — read-only, permanently. The stock has left, the weighted average
 *               has been reversed at the original purchase price, and the
 *               supplier's payable has been reduced. There is no un-submit, and
 *               offering an edit control here would be offering to unwind a
 *               posting that cannot be unwound.
 *
 * A WRONG SUBMITTED RETURN IS CORRECTED BY RECEIVING THE GOODS BACK IN, which is
 * the same shape of answer a wrong receipt gets (raise a return) — every
 * correction in this module is a new document, never an edit of an old one.
 *
 * THE PREVIEW IS BEHIND `purchaseReturns:submit`, NOT `read`. A storekeeper
 * holding create/read/update can build the draft and cannot ask what it does to
 * HPP — the API says so, and this screen renders that as a panel they do not get
 * rather than as an error across a page that is otherwise working.
 */
export function PurchaseReturnDetail({ returnId }: { returnId: string }) {
  const router = useRouter();
  const { can } = usePermissions();

  const { purchaseReturn, loading, error, notFound, replace } =
    usePurchaseReturn(returnId);
  const preview = useReturnPreview(returnId);

  const isDraft = purchaseReturn?.status === "draft";

  // The receipt is read for the line ceiling and the purchase type. Only a draft
  // needs it: a submitted return can never change, so its own stored lines are
  // the whole truth and there is nothing to check them against.
  const { receipt } = useGoodsReceipt(
    isDraft ? (purchaseReturn?.originalReceiptId ?? "") : "",
  );

  const [drafts, setDrafts] = useState<ReturnLineDrafts>({});
  const [returnDate, setReturnDate] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<"submit" | "discard" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  /**
   * Seeds the editor from the stored document whenever it (re)loads.
   *
   * KEYED ON THE DOCUMENT OBJECT, which only changes identity when the hook
   * fetches or a write replaces it — never on a keystroke, because typing updates
   * `drafts` and leaves `purchaseReturn` alone. Half-typed input is therefore
   * safe from a re-render, while a save DOES re-seed from what came back: the
   * server recomputes every line against the live receipt, so the values it
   * returns can differ from the ones that were sent.
   *
   * Closing the editor here is deliberate rather than incidental — a successful
   * save has nothing left to edit, and leaving the fields open invites a second
   * submit of the same change.
   */
  useEffect(() => {
    if (!purchaseReturn) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(
      Object.fromEntries(
        purchaseReturn.items.map((item) => [
          item.originalReceiptItemId,
          { qty: item.qty, reason: item.reason },
        ]),
      ),
    );
    setReturnDate(purchaseReturn.returnDate.slice(0, 10));
    setEditing(false);
  }, [purchaseReturn]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat detail retur…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Retur ini tidak ditemukan.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Mungkin sudah dibuang, atau tautannya salah.
        </p>
        <Button variant="secondary" className="mt-4" asChild>
          <Link href="/dashboard/purchasing/returns">Kembali ke daftar</Link>
        </Button>
      </div>
    );
  }

  if (error || !purchaseReturn) {
    return <Alert variant="error">{error ?? "Gagal memuat retur."}</Alert>;
  }

  const receiptItems = receipt?._id === purchaseReturn.originalReceiptId
    ? receipt.items
    : [];
  const chosen = chosenLines(receiptItems, drafts);
  const invalidLines = chosen.filter(
    (item) =>
      drafts[item.itemId].reason.trim() === "" ||
      exceedsRemaining(drafts[item.itemId].qty, item.remainingQty),
  );
  const canSave = chosen.length > 0 && invalidLines.length === 0 && !saving;

  function setDraft(
    itemId: string,
    patch: Partial<{ qty: string; reason: string }>,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: {
        qty: prev[itemId]?.qty ?? "",
        reason: prev[itemId]?.reason ?? "",
        ...patch,
      },
    }));
  }

  async function handleSave() {
    setActionError(null);

    if (chosen.length === 0) {
      setActionError(
        "Retur harus mengembalikan minimal satu barang. Kalau memang tidak jadi, buang drafnya.",
      );
      return;
    }

    if (invalidLines.length > 0) {
      setActionError(
        "Ada baris yang qty-nya melebihi sisa atau belum diisi alasannya.",
      );
      return;
    }

    const items: PurchaseReturnItemInput[] = chosen.map((item) => ({
      originalReceiptItemId: item.itemId,
      qty: drafts[item.itemId].qty.trim(),
      reason: drafts[item.itemId].reason.trim(),
    }));

    setSaving(true);
    try {
      // `items` replaces the stored array wholesale, so the whole list goes up.
      // The date rides along; omitting it would leave the stored one alone.
      const updated = await purchaseReturnService.update(returnId, {
        returnDate,
        items,
      });
      replace(updated);
      // Any preview taken before this edit describes a different document.
      preview.clear();
      swalToast(`Draft ${updated.returnNumber} disimpan.`);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Draft gagal disimpan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenSubmit() {
    setActionError(null);
    // Preview first, and only open the confirmation if it succeeded: the preview
    // refuses exactly what the submit refuses, so this turns a post-commit
    // failure into a pre-commit one.
    const result = await preview.run();
    if (result) setConfirming("submit");
  }

  async function handleSubmit() {
    setBusy(true);
    setDialogError(null);

    try {
      const submitted = await purchaseReturnService.submit(returnId);
      replace(submitted);
      setConfirming(null);
      swalToast(
        `Retur ${submitted.returnNumber} final — stok keluar, HPP & utang diperbarui.`,
      );
    } catch (caught) {
      setDialogError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Retur gagal disubmit. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    setBusy(true);
    setDialogError(null);

    try {
      await purchaseReturnService.remove(returnId);
      swalToast(`Draft ${purchaseReturn!.returnNumber} dibuang.`);
      router.push("/dashboard/purchasing/returns");
    } catch (caught) {
      setDialogError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Draft gagal dibuang. Coba lagi.",
      );
      setBusy(false);
    }
  }

  const consignment = receipt?.purchaseType === "konsinyasi";

  return (
    <div className="flex flex-col gap-6">
      {actionError && <Alert variant="error">{actionError}</Alert>}

      {/* ------------------------------------------------------------ header */}
      <Card title="Retur">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nomor retur">
            <span className="font-mono">{purchaseReturn.returnNumber}</span>
          </Field>

          <Field label="Status">
            <PurchaseReturnStatusBadge status={purchaseReturn.status} />
          </Field>

          <Field label="Supplier">{purchaseReturn.supplierName ?? "—"}</Field>

          <Field label="Gudang">{purchaseReturn.warehouseName ?? "—"}</Field>

          <Field label="Penerimaan asal">
            <Link
              href={`/dashboard/purchasing/receipts/${purchaseReturn.originalReceiptId}`}
              className="font-mono text-primary-hover hover:underline"
            >
              {purchaseReturn.originalReceiptNumber ?? "Lihat penerimaan"}
            </Link>
          </Field>

          <Field label="Tanggal retur">
            {isDraft && editing ? (
              <Input
                type="date"
                aria-label="Tanggal retur"
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
                disabled={saving}
                className="w-40"
              />
            ) : (
              formatDate(purchaseReturn.returnDate)
            )}
          </Field>

          <Field label="Dibuat oleh">
            {purchaseReturn.createdByName ?? "—"}
          </Field>

          <Field label="Nilai retur">
            <span className="font-mono text-base font-semibold text-danger">
              {formatMoney(purchaseReturn.totalAmount)}
            </span>
          </Field>
        </div>

        {purchaseReturn.journalEntryId && (
          <p className="mt-4 text-xs text-muted">
            Jurnal yang diposting:{" "}
            <Link
              href={`/dashboard/keuangan/journal-entries/${purchaseReturn.journalEntryId}`}
              className="font-mono text-primary-hover hover:underline"
            >
              lihat entri jurnal
            </Link>
          </p>
        )}

        {/* A null journalEntryId means three different things and a screen that
            collapsed them would mislead. Only the submitted case is worth
            explaining here; a draft has simply not posted yet. */}
        {!purchaseReturn.journalEntryId && !isDraft && (
          <p className="mt-4 text-xs text-muted">
            Tidak ada jurnal untuk retur ini — barangnya konsinyasi (belum pernah
            dibeli, jadi tidak ada utang yang dikurangi) atau nilainya nol. Stok
            tetap keluar dan HPP tetap dibalik.
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------- lines */}
      <Card title="Barang yang dikembalikan">
        {isDraft && editing ? (
          receiptItems.length > 0 ? (
            <ReturnLinesEditor
              items={receiptItems}
              drafts={drafts}
              onChange={setDraft}
              disabled={saving}
            />
          ) : (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
              <Spinner /> Memuat baris penerimaan…
            </div>
          )
        ) : (
          <StoredLines items={purchaseReturn.items} />
        )}
      </Card>

      {/* ----------------------------------------------------------- preview */}
      {isDraft && can("purchaseReturns", "submit") && (
        <>
          {preview.error && <Alert variant="error">{preview.error}</Alert>}
          {preview.preview && (
            <ReturnPreviewPanel
              preview={preview.preview}
              consignment={consignment}
            />
          )}
        </>
      )}

      {isDraft && preview.forbidden && (
        <Alert variant="info">
          Anda bisa menyusun draft retur, tapi perkiraan HPP dan penyelesaian
          retur dilakukan oleh peran lain.
        </Alert>
      )}

      {/* ----------------------------------------------------------- actions */}
      {isDraft && (
        <div className="flex flex-wrap items-center gap-2">
          {can("purchaseReturns", "update") &&
            (editing ? (
              <>
                <Button onClick={handleSave} disabled={!canSave}>
                  {saving ? "Menyimpan…" : "Simpan perubahan"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    // Re-seed from the stored document, discarding the edit.
                    setDrafts(
                      Object.fromEntries(
                        purchaseReturn.items.map((item) => [
                          item.originalReceiptItemId,
                          { qty: item.qty, reason: item.reason },
                        ]),
                      ),
                    );
                    setReturnDate(purchaseReturn.returnDate.slice(0, 10));
                    setActionError(null);
                    setEditing(false);
                  }}
                >
                  Batal edit
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Ubah baris
              </Button>
            ))}

          {can("purchaseReturns", "submit") && !editing && (
            <Button onClick={handleOpenSubmit} disabled={preview.loading}>
              {preview.loading ? "Menghitung…" : "Submit retur"}
            </Button>
          )}

          {can("purchaseReturns", "delete") && !editing && (
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => {
                setDialogError(null);
                setConfirming("discard");
              }}
            >
              Buang draft
            </Button>
          )}
        </div>
      )}

      {!isDraft && (
        <p className="text-xs text-muted">
          Retur ini sudah final dan tidak bisa diubah atau dihapus — stok sudah
          keluar, HPP sudah dibalik di harga beli asli, dan utang supplier sudah
          berkurang. Kalau ternyata keliru, koreksinya adalah menerima kembali
          barangnya lewat penerimaan barang.
        </p>
      )}

      {/* ------------------------------------------------------- confirmation */}
      {confirming === "submit" && preview.preview && (
        <ConfirmDialog
          title="Submit retur ke supplier?"
          confirmLabel="Submit retur"
          destructive
          busy={busy}
          error={dialogError}
          onConfirm={handleSubmit}
          onCancel={() => setConfirming(null)}
        >
          {/* Inline fragments, not <p>: DialogDescription is itself a <p>. */}
          <>
            <b>{preview.preview.movements.length} baris</b> akan ditulis ke kartu
            stok dengan total{" "}
            <b className="font-mono">
              {formatMoney(preview.preview.totalAmount)}
            </b>
            , dan HPP <b>{preview.preview.hppAvg.length} produk</b> dihitung
            ulang memakai harga beli aslinya.
            <span className="mt-2 block">
              {consignment ? (
                <>
                  Barang konsinyasi: utang supplier <b>tidak berubah</b>.
                </>
              ) : (
                <>
                  Utang supplier berkurang{" "}
                  <b className="font-mono">
                    {formatMoney(preview.preview.totalAmount)}
                  </b>
                  .
                </>
              )}
            </span>
            <span className="mt-2 block">
              Tindakan ini <b>tidak bisa dibatalkan</b>. Retur yang keliru
              dikoreksi dengan menerima kembali barangnya, bukan dengan
              menghapus.
            </span>
          </>
        </ConfirmDialog>
      )}

      {confirming === "discard" && (
        <ConfirmDialog
          title="Buang draft retur?"
          confirmLabel="Buang draft"
          destructive
          busy={busy}
          error={dialogError}
          onConfirm={handleDiscard}
          onCancel={() => setConfirming(null)}
        >
          <>
            Draft <b className="font-mono">{purchaseReturn.returnNumber}</b>{" "}
            beserta seluruh barisnya akan dibuang. Tidak ada stok yang berubah
            dan tidak ada utang yang bergerak — draft memang belum pernah menulis
            apa pun.
            <span className="mt-2 block">
              Jatah retur di penerimaan asalnya juga tidak terpengaruh: yang
              memotong jatah hanya retur yang sudah final.
            </span>
          </>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** One labelled fact in the header grid. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium tracking-widest text-muted uppercase">
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

/**
 * The lines as the document stores them — the read-only view.
 *
 * SHOWS `costPerUnit` AND `subtotal`, which the editor deliberately does not let
 * anybody touch: both are copied server-side from the receipt line, and the whole
 * point of tracing a return to a receipt is that the price it reverses at is the
 * price that was actually paid.
 */
function StoredLines({
  items,
}: {
  items: import("@/types/api").PurchaseReturnItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Retur ini tidak memiliki baris.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
            <th className="px-2 py-2 text-left font-medium">Produk</th>
            <th className="px-2 py-2 text-left font-medium">Lot</th>
            <th className="px-2 py-2 text-right font-medium">Qty</th>
            <th className="px-2 py-2 text-right font-medium">Harga beli asli</th>
            <th className="px-2 py-2 text-right font-medium">Subtotal</th>
            <th className="px-2 py-2 text-left font-medium">Alasan</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.originalReceiptItemId}
              className="border-b border-border/60 last:border-0"
            >
              <td className="px-2 py-2">
                <p className="text-sm font-medium">
                  {item.productName ?? "—"}
                </p>
                <p className="font-mono text-xs text-muted">
                  {item.productSku ?? "—"}
                </p>
              </td>
              <td className="px-2 py-2 font-mono text-xs text-muted">
                {item.batchCode ?? "—"}
              </td>
              <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                {formatQty(item.qty)}
                {item.productUnit ? (
                  <span className="text-muted"> {item.productUnit}</span>
                ) : null}
              </td>
              <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                {formatMoney(item.costPerUnit)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-sm tabular-nums text-danger">
                {formatMoney(item.subtotal)}
              </td>
              <td className="px-2 py-2 text-xs">{item.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
