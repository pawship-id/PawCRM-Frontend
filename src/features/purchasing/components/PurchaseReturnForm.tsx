"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { purchaseReturnService } from "@/services/purchaseReturn.service";
import {
  formatMoney,
  multiplyDecimals,
  sumDecimals,
} from "@/utils/decimal";
import type { PurchaseReturnItemInput } from "@/types/api";

import { useGoodsReceipt } from "../hooks/useGoodsReceipt";
import { useReturnableReceipts } from "../hooks/useReturnableReceipts";
import {
  ReturnLinesEditor,
  chosenLines,
  exceedsRemaining,
  type ReturnLineDrafts,
} from "./ReturnLinesEditor";

/** `yyyy-mm-dd` for a date input, from the browser's own clock. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Open a return against a delivery.
 *
 * THIS SCREEN CREATES A DRAFT AND NOTHING ELSE. It moves no stock, reverses no
 * cost and touches no payable — all of that happens at submit, on the detail
 * screen, behind a separate permission. The split is the point: a storekeeper
 * lists what is going back while the damaged carton is in front of them, and
 * somebody with the authority to reduce a supplier's payable closes it later.
 * The return NUMBER is allocated here anyway, because a clerk on the phone to a
 * vendor needs one to quote before anything ships.
 *
 * THE RETURN IS ALWAYS DRAWN FROM A RECEIPT, never entered free-hand, and that
 * constraint is the whole design. The receipt line carries the price ACTUALLY
 * PAID, and reversing the weighted average needs exactly that number — reversing
 * at today's running average would remove a different amount of value than was
 * ever put in, leaving the stock that stays behind valued at a price nobody paid.
 *
 * WHAT THIS FORM NO LONGER DOES, and the absence is the improvement. The version
 * this replaced ran on the prototype store, simulated the weighted-average
 * reversal locally, and posted the return in one irreversible step from the
 * create screen. The simulation is gone — the server previews it, running the
 * same code the submit runs — and so is the one-step post.
 *
 * BOTH PURCHASE TYPES ARE OFFERED. The prototype filtered to `beli_putus` and was
 * stricter than the API: consignment goods CAN be sent back, the stock leaves and
 * the average is reversed exactly the same way, and only the journal entry is
 * skipped because the goods were never bought. The form labels that rather than
 * hiding the option.
 */
export function PurchaseReturnForm({ receiptId }: { receiptId?: string }) {
  const router = useRouter();
  const {
    receipts,
    loading: loadingReceipts,
    error: receiptsError,
    truncated,
  } = useReturnableReceipts();

  const [selectedId, setSelectedId] = useState(receiptId ?? "");
  const [returnDate, setReturnDate] = useState(today());
  const [drafts, setDrafts] = useState<ReturnLineDrafts>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The lines, the original costs and the returnable ceiling all come from here.
  // `remainingQty` is the server's own number — see the editor's header.
  const {
    receipt,
    loading: loadingReceipt,
    error: receiptError,
  } = useGoodsReceipt(selectedId);

  const items = selectedId && receipt?._id === selectedId ? receipt.items : [];
  const chosen = chosenLines(items, drafts);

  const total = sumDecimals(
    chosen.map((item) =>
      multiplyDecimals(drafts[item.itemId].qty, item.costPerUnit),
    ),
  );

  const consignment = receipt?.purchaseType === "konsinyasi";

  /**
   * Every reason a line would be refused, checked here so the user learns it
   * before the round trip. The server checks all of it again — this is a
   * courtesy, never the authority.
   */
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
      // Defaults first, then whatever the row already held, then the patch —
      // spread order matters, and listing the literal keys alongside a spread
      // that also carries them is how a default silently wins over a real value.
      [itemId]: {
        qty: prev[itemId]?.qty ?? "",
        reason: prev[itemId]?.reason ?? "",
        ...patch,
      },
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (chosen.length === 0) {
      setFormError("Pilih minimal satu barang untuk diretur.");
      return;
    }

    if (invalidLines.length > 0) {
      setFormError(
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
      const created = await purchaseReturnService.create({
        originalReceiptId: selectedId,
        returnDate,
        items,
      });

      swalToast(
        `Draft retur ${created.returnNumber} dibuat — belum ada stok yang keluar.`,
      );
      // Straight to the detail, which is where the preview and the submit live.
      // A draft left on the list is one somebody has to find again.
      router.push(`/dashboard/purchasing/returns/${created._id}`);
    } catch (caught) {
      setFormError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Retur gagal disimpan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  if (loadingReceipts) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat daftar penerimaan…
      </div>
    );
  }

  if (receiptsError) {
    return <Alert variant="error">{receiptsError}</Alert>;
  }

  if (receipts.length === 0) {
    return (
      <Alert variant="info">
        Belum ada penerimaan yang bisa diretur. Retur selalu ditarik dari
        penerimaan yang sudah tercatat — itulah yang membawa harga beli aslinya.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Card title="Penerimaan asal">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt">Pilih penerimaan</Label>
            <Select
              value={selectedId}
              onValueChange={(value) => {
                setSelectedId(value);
                // The drafts are keyed by the OLD receipt's item ids; keeping
                // them would silently carry quantities onto lines of a different
                // delivery.
                setDrafts({});
                setFormError(null);
              }}
            >
              <SelectTrigger id="receipt" aria-label="Pilih penerimaan">
                <SelectValue placeholder="Pilih penerimaan…" />
              </SelectTrigger>
              <SelectContent>
                {receipts.map((row) => (
                  <SelectItem key={row._id} value={row._id}>
                    {row.receiptNumber} · {row.supplierName ?? "—"}
                    {row.purchaseType === "konsinyasi" ? " · konsinyasi" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">
              Harga beli aslinya ikut terbawa dari sini — bukan HPP yang berlaku
              hari ini.
            </p>
            {truncated && (
              <p className="text-xs text-muted">
                Hanya {receipts.length} penerimaan terbaru yang ditampilkan.
                Kalau penerimaannya tidak ada di sini, buka detailnya dari daftar
                penerimaan dan mulai retur dari sana.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="returnDate">Tanggal retur</Label>
            <Input
              id="returnDate"
              type="date"
              value={returnDate}
              onChange={(event) => setReturnDate(event.target.value)}
            />
            <p className="text-xs text-muted">
              Tanggal barang benar-benar dikembalikan — ini yang dipakai jurnal
              saat retur disubmit, bukan tanggal pengetikan.
            </p>
          </div>
        </div>

        {consignment && (
          <div className="mt-4">
            <Alert variant="info">
              Penerimaan konsinyasi. Stok tetap keluar dan HPP tetap dibalik,
              tapi <b>tidak ada utang yang berkurang</b> — barangnya memang belum
              pernah dibeli, jadi tidak ada jurnal yang dibuat.
            </Alert>
          </div>
        )}
      </Card>

      <Card title="Barang yang dikembalikan">
        {!selectedId && (
          <p className="py-8 text-center text-sm text-muted">
            Pilih penerimaan dulu untuk melihat barang yang bisa diretur.
          </p>
        )}

        {selectedId && loadingReceipt && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Spinner /> Memuat baris penerimaan…
          </div>
        )}

        {selectedId && receiptError && (
          <Alert variant="error">{receiptError}</Alert>
        )}

        {selectedId && !loadingReceipt && items.length > 0 && (
          <ReturnLinesEditor
            items={items}
            drafts={drafts}
            onChange={setDraft}
            disabled={saving}
          />
        )}
      </Card>

      <Card title="Ringkasan">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Baris diretur</span>
            <b className="tabular-nums">{chosen.length}</b>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <b>Perkiraan nilai retur</b>
            <b className="tabular-nums text-base text-danger">
              {formatMoney(total)}
            </b>
          </div>
          {/* PERKIRAAN, deliberately. The server recomputes every line against
              the live receipt at submit, so a draft opened this morning can be
              worth something different this afternoon if another return against
              the same delivery landed in between. */}
          <p className="mt-1 text-xs text-muted">
            Angka ini dihitung ulang oleh server saat retur disubmit. Nilai
            akhirnya bisa berbeda kalau ada retur lain atas penerimaan yang sama
            yang lebih dulu final.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSave}>
          {saving ? "Menyimpan…" : "Simpan draft retur"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => router.push("/dashboard/purchasing/returns")}
        >
          Batal
        </Button>
      </div>

      <p className="text-xs text-muted">
        Menyimpan draft <b>belum</b> mengeluarkan stok dan belum mengurangi utang.
        Perkiraan HPP dan jurnalnya bisa dilihat di halaman detail, lalu retur
        disubmit dari sana.
      </p>
    </form>
  );
}
