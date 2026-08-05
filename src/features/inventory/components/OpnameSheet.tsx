"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Button, ConfirmDialog, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { OpnameItem } from "@/types/inventory";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";

import { useOpnamePreview } from "../hooks/useOpnamePreview";
import { useOpnameSheet } from "../hooks/useOpnameSheet";
import { JournalPreview } from "./JournalPreview";
import { OpnameStatusBadge } from "./OpnameStatusBadge";

/**
 * The count sheet: system quantity on one side, what the counter found on the
 * other, and the variance between them.
 *
 * THREE STATES PER LINE, and keeping them distinct is the whole point:
 *   belum dihitung — nobody has been to this shelf. Writes NOTHING on submit.
 *   cocok          — counted, and it matched. Also writes nothing: a movement of
 *                    zero is a row with no meaning that every report must skip.
 *   berselisih     — counted, and it did not. Writes one `opname_diff` movement.
 *
 * The first two are IDENTICAL in the numbers — both leave `physicalQty` equal to
 * `systemQty` — so the sheet cannot tell them apart from the quantities alone.
 * That is what the counted flag is for, and why the progress figure is honest:
 * without it "40 of 40" and "12 of 40, the rest untouched" look the same, and
 * submitting the second believing it was the first certifies shelves nobody
 * looked at.
 *
 * EVERY NUMBER EXCEPT `physicalQty` COMES FROM THE SERVER. The variance, its
 * value and the sheet total are recomputed on every save and again at submit —
 * against LIVE stock, because the shop keeps selling while somebody counts. A
 * browser subtracting the quantity it was handed this morning would show a
 * variance that quietly disagrees with the one actually posted.
 *
 * NOTHING IS SAVED BY A BUTTON. The sheet auto-saves as it is filled in, which
 * is the only workable model for a job that takes an afternoon on a tablet — and
 * the indicator says so explicitly, because an auto-save nobody can see is one
 * nobody trusts.
 */
export function OpnameSheet({ opnameId }: { opnameId: string }) {
  const router = useRouter();
  const { can } = usePermissions();

  const {
    opname,
    items,
    loading,
    error,
    saveState,
    lastSavedAt,
    countedCount,
    editLine,
    setCounted,
    flush,
    reload,
  } = useOpnameSheet(opnameId);

  const preview = useOpnamePreview(opnameId);

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat lembar opname…
      </div>
    );
  }

  if (!opname) {
    return <Alert variant="error">{error ?? "Opname tidak ditemukan."}</Alert>;
  }

  const done = opname.status === "submitted";
  const differing = items.filter((item) => (toMinor(item.diffQty) ?? 0n) !== 0n);
  const totalMinor = toMinor(opname.totalDiffValue) ?? 0n;

  /**
   * Lines that will be REFUSED at submit: found stock of a product that expires,
   * with no lot to put it in. Surfaced here rather than left to the 400, so the
   * counter fixes them while still standing at the shelf.
   */
  const missingLot = items.filter(
    (item) =>
      item.productHasExpiry &&
      (toMinor(item.diffQty) ?? 0n) > 0n &&
      (!item.batchCode || !item.expiryDate),
  );

  async function handleOpenConfirm() {
    setSubmitError(null);
    // The debounce may still be holding the last thing typed; submitting without
    // it would post a count one line out of date.
    await flush();
    const result = await preview.run();
    if (result) setConfirming(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const submitted = await stockOpnameService.submit(opnameId);

      swalToast(
        (toMinor(submitted.totalDiffValue) ?? 0n) === 0n
          ? "Opname final — tidak ada selisih, jadi tidak ada pergerakan stok."
          : `Opname final — selisih ${formatMoney(submitted.totalDiffValue)} tercatat di kartu stok dan jurnal.`,
      );
      setConfirming(false);
      router.push("/dashboard/inventory/opname");
    } catch (caught) {
      setSubmitError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Opname gagal diselesaikan. Coba lagi.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="error">
          {error}{" "}
          <button
            type="button"
            onClick={reload}
            className="font-medium underline"
          >
            Muat ulang
          </button>
        </Alert>
      )}

      {/* ------------------------------------------------------------ header */}
      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-surface p-4">
        <Field label="Nomor" value={opname.opnameNumber} mono />
        <Field label="Gudang" value={opname.warehouseName ?? "—"} />
        <Field
          label="Terhitung"
          value={`${countedCount} / ${items.length} produk`}
        />
        <Field label="Baris berselisih" value={String(differing.length)} />
        <div className="ml-auto flex flex-col items-end gap-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Status
          </p>
          {done ? (
            <div className="flex flex-col items-end gap-1">
              <OpnameStatusBadge status="submitted" />
              {opname.submittedByName && (
                <span className="text-xs text-muted">
                  oleh {opname.submittedByName}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <OpnameStatusBadge status="draft" />
              <SaveIndicator state={saveState} at={lastSavedAt} />
            </div>
          )}
        </div>
      </div>

      {!done && countedCount < items.length && (
        <Alert variant="info">
          {items.length - countedCount} produk belum dihitung. Baris yang belum
          disentuh <b>tidak dianggap nol</b> — ia tetap memakai angka sistem dan
          tidak menulis apa pun, jadi lembar yang belum selesai tetap aman
          diselesaikan.
        </Alert>
      )}

      {/* `error`, not a softer tone: the submit will be REFUSED until these are
          filled in, so anything gentler would understate what happens next. */}
      {!done && missingLot.length > 0 && (
        <Alert variant="error">
          {missingLot.length} produk kedaluwarsa ditemukan lebih banyak dari
          catatan, tapi belum punya kode batch dan tanggal kedaluwarsa. Barang
          yang &ldquo;masuk&rdquo; harus punya lot, kalau tidak stoknya tidak
          bisa diurutkan FEFO. Isi dulu sebelum menyelesaikan opname.
        </Alert>
      )}

      {/* ------------------------------------------------------------- table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Produk</th>
              <th className="px-4 py-2.5 text-center font-medium">Dihitung</th>
              <th className="px-4 py-2.5 text-right font-medium">Qty sistem</th>
              <th className="px-4 py-2.5 text-right font-medium">Qty fisik</th>
              <th className="px-4 py-2.5 text-right font-medium">Selisih</th>
              <th className="px-4 py-2.5 text-right font-medium">HPP</th>
              <th className="px-4 py-2.5 text-right font-medium">
                Nilai selisih
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <SheetRow
                key={item.productId}
                item={item}
                readOnly={done}
                onEdit={editLine}
                onCounted={setCounted}
              />
            ))}
          </tbody>
        </table>

        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
          Baris yang <b>belum dihitung</b> dan baris yang <b>cocok</b> sama-sama
          tidak menulis apa pun. Hanya yang berselisih yang menghasilkan
          pergerakan stok — dan angkanya dihitung ulang terhadap stok terbaru
          saat opname diselesaikan, bukan saat lembar ini dibuka.
        </p>
      </div>

      {/* ----------------------------------------------------------- summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary-hover">
            Total selisih
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-2xl font-semibold tabular-nums",
              totalMinor < 0n
                ? "text-danger"
                : totalMinor > 0n
                  ? "text-success"
                  : "text-muted",
            )}
          >
            {formatMoney(opname.totalDiffValue)}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            Σ (qty fisik − qty sistem) × HPP · opname mengubah kuantitas, bukan
            HPP
          </p>
        </div>

        {done ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
              Jurnal
            </p>
            {opname.journalEntryId ? (
              <>
                <p className="mt-1 text-sm">
                  Selisih ini sudah dibukukan ke jurnal umum.
                </p>
                <Link
                  href={`/dashboard/keuangan?entryId=${opname.journalEntryId}`}
                  className="mt-2 inline-block text-sm font-medium text-primary-hover hover:underline"
                >
                  Lihat jurnal →
                </Link>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                Tidak ada jurnal — selisihnya bernilai nol, jadi tidak ada nilai
                yang berpindah. Yang berubah hanya kuantitas.
              </p>
            )}
          </div>
        ) : (
          <JournalPreview
            lines={preview.preview?.journal ?? []}
            emptyReason={
              preview.error ??
              "Tekan “Selesaikan opname” untuk melihat jurnal yang akan dibuat — dihitung server, bukan ditebak di browser."
            }
          />
        )}
      </div>

      {/* ----------------------------------------------------------- actions */}
      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          {can("stockOpnames", "submit") ? (
            <Button
              onClick={handleOpenConfirm}
              disabled={preview.loading || saveState === "saving"}
            >
              {preview.loading ? "Menghitung…" : "Selesaikan opname"}
            </Button>
          ) : (
            <Alert variant="info">
              Anda bisa mengisi hitungan, tapi penyelesaian opname dilakukan oleh
              rekan dengan izin <b>submit</b>. Itu disengaja: yang menghitung dan
              yang menyetujui selisihnya sebaiknya bukan orang yang sama.
            </Alert>
          )}

          <Button
            variant="secondary"
            onClick={async () => {
              await flush();
              router.push("/dashboard/inventory/opname");
            }}
          >
            Simpan &amp; kembali
          </Button>

          {preview.error && !confirming && (
            <p className="w-full text-sm text-danger">{preview.error}</p>
          )}

          <p className="w-full text-xs text-muted">
            Setelah final, lembar ini tidak bisa diubah. Koreksi berikutnya
            dilakukan lewat opname baru — kartu stok bersifat append-only.
          </p>
        </div>
      )}

      {confirming && preview.preview && (
        <ConfirmDialog
          title="Selesaikan opname?"
          confirmLabel="Ya, selesaikan"
          busy={submitting}
          error={submitError}
          onConfirm={handleSubmit}
          onCancel={() => setConfirming(false)}
        >
          {/* Inline fragments, not <p>: DialogDescription is itself a <p>. */}
          <>
            <b>{preview.preview.movements.length} baris</b> penyesuaian akan
            ditulis ke kartu stok, dengan total selisih{" "}
            <b className="font-mono">
              {formatMoney(preview.preview.totalDiffValue)}
            </b>
            .
            <span className="mt-2 block">
              Angka ini dihitung ulang server terhadap stok <b>saat ini</b>,
              jadi penjualan yang terjadi selama penghitungan tidak ikut
              terhitung sebagai selisih.
            </span>
            <span className="mt-2 block">
              Tindakan ini <b>tidak bisa dibatalkan</b>.
            </span>
          </>
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * One counted line.
 *
 * THE CHECKBOX IS NOT REDUNDANT WITH THE FIELD. Typing a quantity marks the line
 * counted on its own — somebody who writes a number has been to that shelf. The
 * checkbox exists for the case the field cannot express: a shelf that was walked
 * and found exactly right, where the correct entry is to change nothing.
 */
function SheetRow({
  item,
  readOnly,
  onEdit,
  onCounted,
}: {
  item: OpnameItem;
  readOnly: boolean;
  onEdit: (productId: string, patch: { physicalQty?: string; batchCode?: string; expiryDate?: string }) => void;
  onCounted: (productId: string, counted: boolean) => void;
}) {
  const diffMinor = toMinor(item.diffQty) ?? 0n;
  const counted = item.countedAt !== null;
  // Found stock of goods that expire has to name a lot, or the API refuses it.
  const needsLot = Boolean(item.productHasExpiry) && diffMinor > 0n;
  const lotMissing = needsLot && (!item.batchCode || !item.expiryDate);

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/60",
          !counted && !readOnly && "bg-accent/20",
        )}
      >
        <td className="px-4 py-2.5">
          <p className="text-sm font-medium">{item.productName ?? "—"}</p>
          <p className="font-mono text-xs text-muted">
            {item.productSku ?? item.productId}
            {item.productUnit && ` · ${item.productUnit}`}
          </p>
        </td>

        <td className="px-4 py-2.5 text-center">
          {readOnly ? (
            counted ? (
              <Badge
                variant="outline"
                className="border-transparent bg-success/12 text-success"
              >
                ya
              </Badge>
            ) : (
              <span className="text-xs text-muted">—</span>
            )
          ) : (
            <Checkbox
              checked={counted}
              onCheckedChange={(value) =>
                onCounted(item.productId, value === true)
              }
              aria-label={`Tandai ${item.productName ?? "produk"} sudah dihitung`}
            />
          )}
        </td>

        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
          {formatQty(item.systemQty)}
        </td>

        <td className="px-4 py-2.5 text-right">
          {readOnly ? (
            <span className="font-mono text-sm tabular-nums">
              {formatQty(item.physicalQty)}
            </span>
          ) : (
            <Input
              aria-label={`Qty fisik ${item.productName ?? ""}`}
              inputMode="decimal"
              value={item.physicalQty}
              onChange={(event) =>
                onEdit(item.productId, { physicalQty: event.target.value })
              }
              className="ml-auto max-w-24 text-right font-mono"
            />
          )}
        </td>

        <td
          className={cn(
            "px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums",
            diffMinor === 0n && "text-muted",
            diffMinor < 0n && "text-danger",
            diffMinor > 0n && "text-success",
          )}
        >
          {diffMinor === 0n
            ? "—"
            : `${diffMinor > 0n ? "+" : ""}${formatQty(item.diffQty)}`}
        </td>

        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
          {formatMoney(item.hppAtOpname)}
        </td>

        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
          {diffMinor === 0n ? "—" : formatMoney(item.diffValue)}
        </td>
      </tr>

      {/* The lot row appears only when this line will actually need one, so the
          sheet stays a column of quantities for the products that do not. */}
      {needsLot && !readOnly && (
        <tr
          className={cn(
            "border-b border-border/60",
            lotMissing ? "bg-danger/10" : "bg-accent/30",
          )}
        >
          <td colSpan={7} className="px-4 py-2.5">
            <div className="flex flex-wrap items-end gap-3">
              <p className="text-xs text-muted">
                <b>{item.productName}</b> punya masa kedaluwarsa dan ditemukan
                lebih banyak dari catatan — barang yang masuk harus punya lot.
              </p>
              <Input
                aria-label={`Kode batch ${item.productName ?? ""}`}
                value={item.batchCode ?? ""}
                onChange={(event) =>
                  onEdit(item.productId, { batchCode: event.target.value })
                }
                placeholder="Kode batch"
                className="max-w-44"
              />
              <Input
                aria-label={`Tanggal kedaluwarsa ${item.productName ?? ""}`}
                type="date"
                value={item.expiryDate ? item.expiryDate.slice(0, 10) : ""}
                onChange={(event) =>
                  onEdit(item.productId, { expiryDate: event.target.value })
                }
                className="max-w-44"
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Whether the sheet is saved — shown rather than assumed.
 *
 * A count sheet auto-saves because the job takes an afternoon, and an auto-save
 * nobody can see is one nobody trusts: the alternative is a counter who
 * re-enters a whole shelf because they were not sure it took.
 */
function SaveIndicator({
  state,
  at,
}: {
  state: "idle" | "saving" | "saved" | "error";
  at: Date | null;
}) {
  if (state === "saving") {
    return <span className="text-xs text-muted">Menyimpan…</span>;
  }
  if (state === "error") {
    return (
      <span className="text-xs font-medium text-danger">Gagal menyimpan</span>
    );
  }
  if (state === "saved" && at) {
    return (
      <span className="text-xs text-muted">
        Tersimpan{" "}
        {at.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    );
  }
  return <span className="text-xs text-muted">Tersimpan otomatis</span>;
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
      <p className={cn("mt-1 text-sm font-semibold", mono && "font-mono")}>
        {value}
      </p>
    </div>
  );
}
