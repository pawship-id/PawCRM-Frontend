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
import { autoBatchCode } from "@/lib/batchCode";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { OpnameItem } from "@/types/inventory";
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";

import { useOpnamePreview } from "../hooks/useOpnamePreview";
import { useOpnameSheet } from "../hooks/useOpnameSheet";
import { JournalPreview } from "./JournalPreview";
import { OpnameAddProductsDialog } from "./OpnameAddProductsDialog";
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
/**
 * One count sheet's lines, as exported columns.
 *
 * SIGNS ARE PRESERVED on both difference columns. A shortage is negative in the
 * ledger and must be negative here — an export that moved the direction into a
 * separate "jenis selisih" column would be one nobody can sum to "what did this
 * count cost us", which is the whole reason the file is opened.
 */
const SHEET_EXPORT_COLUMNS: XlsxColumn<OpnameItem>[] = [
  { header: "SKU", value: (item) => item.productSku ?? "" },
  { header: "Produk", value: (item) => item.productName ?? "" },
  { header: "Satuan", value: (item) => item.productUnit ?? "" },
  { header: "Qty sistem", value: (item) => item.systemQty, type: "number" },
  { header: "Qty fisik", value: (item) => item.physicalQty, type: "number" },
  { header: "Selisih qty", value: (item) => item.diffQty, type: "number" },
  {
    header: "HPP saat opname",
    value: (item) => item.hppAtOpname,
    type: "number",
  },
  { header: "Selisih nilai", value: (item) => item.diffValue, type: "number" },
  // The column that tells "not counted yet" from "counted, and it matched" —
  // both post nothing, and only one of them means the sheet is unfinished.
  { header: "Dihitung", value: (item) => (item.countedAt ? "ya" : "belum") },
  { header: "Kode batch", value: (item) => item.batchCode ?? "" },
  {
    header: "Kedaluwarsa",
    value: (item) => item.expiryDate ?? "",
    type: "date",
  },
  { header: "Catatan", value: (item) => item.notes ?? "" },
];

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
    removeLine,
    flush,
    addProducts,
    addEveryProduct,
    adding,
    reload,
  } = useOpnameSheet(opnameId);

  const preview = useOpnamePreview(opnameId);

  const [addingProducts, setAddingProducts] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  /** A counted line waiting on confirmation — see `handleRemove`. */
  const [pendingRemove, setPendingRemove] = useState<OpnameItem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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
  /** Drafts, and only for a role that may change one. */
  const canEdit = !done && can("stockOpnames", "update");
  const differing = items.filter(
    (item) => (toMinor(item.diffQty) ?? 0n) !== 0n,
  );
  const totalMinor = toMinor(opname.totalDiffValue) ?? 0n;

  /**
   * Lines that will be REFUSED at submit: found stock of a product that expires,
   * with no DATE to order the lot by. Surfaced here rather than left to the 400,
   * so the counter fixes them while still standing at the shelf.
   *
   * A missing CODE is not a refusal — the gateway fills it from the date.
   */
  const missingLot = items.filter(
    (item) =>
      item.productHasExpiry &&
      (toMinor(item.diffQty) ?? 0n) > 0n &&
      !item.expiryDate,
  );

  async function handleLoadEverything() {
    setAddError(await addEveryProduct());
  }

  /**
   * ONLY A COUNTED LINE ASKS FIRST. Removing a row nobody has been to costs
   * nothing — it is undoing a mistake made a second ago, and a dialog for it
   * would be the kind of prompt people learn to dismiss without reading. A line
   * somebody walked to a shelf for is different: its quantity is the one thing
   * on this sheet that cannot be recovered from anywhere else.
   */
  function handleRemove(item: OpnameItem) {
    if (item.countedAt !== null) {
      setPendingRemove(item);
      return;
    }
    void removeLine(item.productId);
  }

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

  /**
   * The sheet's LINES, as a workbook.
   *
   * `hppAtOpname` is exported alongside the value because a variance is argued
   * about in two currencies at once — "twelve bottles short" and "Rp 360.000
   * short" — and a file with only the second cannot be checked against a shelf.
   *
   * Uncounted lines are INCLUDED, not filtered out. A line nobody reached posts
   * nothing, but "we did not get to it" is a finding in its own right, and the
   * `Dihitung` column is what tells it from "counted, and it matched".
   */
  const exportSheet = async () => {
    setExporting(true);
    try {
      await exportToXlsx(
        SHEET_EXPORT_COLUMNS,
        items,
        `opname-${opname?.opnameNumber ?? "draft"}.xlsx`,
        { sheetName: "Selisih" },
      );
    } finally {
      setExporting(false);
    }
  };

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

      {/**
       * THE EXPORT AN ACCOUNTANT ACTUALLY USES, and it is deliberately outside
       * the `!done` block below: a SUBMITTED sheet is the one that gets
       * reconciled, and that is exactly the state with no other actions on
       * screen. A draft can be exported too — a half-finished count is a useful
       * thing to hand somebody walking the shelves.
       *
       * Per-LINE, unlike the history export on the list screen. The list answers
       * "which counts happened"; this answers "which products were off, and by
       * how much" — the question a variance is actually investigated with.
       */}
      {items.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={exportSheet}
            disabled={exporting}
          >
            {exporting ? <Spinner /> : null}
            Export selisih (.xlsx)
          </Button>
        </div>
      )}

      {!done && items.length > 0 && countedCount < items.length && (
        <Alert variant="info">
          {items.length - countedCount} produk belum dihitung. Baris yang belum
          disentuh <b>tidak dianggap nol</b> — ia tetap memakai angka sistem dan
          tidak menulis apa pun, jadi lembar yang belum selesai tetap aman
          diselesaikan.
        </Alert>
      )}

      {addError && <Alert variant="error">{addError}</Alert>}

      {/**
       * THE EMPTY SHEET IS WHERE THE COUNT IS SCOPED, and that is why it gets a
       * panel rather than an empty table. A sheet opens with no lines precisely
       * so this decision can be made here, next to the rows it produces: the
       * whole warehouse, or the shelves somebody actually means to walk to.
       */}
      {!done && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
          <p className="font-medium text-foreground">
            Lembar ini belum berisi produk
          </p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
            Muat seluruh isi gudang untuk stock take menyeluruh, atau pilih
            produk tertentu kalau yang dihitung hanya sebagian rak. Keduanya
            bisa digabung — produk masih bisa ditambahkan setelah penghitungan
            mulai.
          </p>

          {can("stockOpnames", "update") && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={handleLoadEverything} disabled={adding}>
                {adding ? "Memuat…" : "Muat semua produk gudang ini"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setAddingProducts(true)}
                disabled={adding}
              >
                + Tambah produk
              </Button>
            </div>
          )}

          <p className="mt-4 text-xs text-muted">
            Belum jadi menghitung? Lembar kosong ini masih memblokir gudangnya —
            buang lewat tombol <b>Buang</b> di{" "}
            <Link
              href="/dashboard/inventory/opname"
              className="font-medium text-primary-hover hover:underline"
            >
              daftar opname
            </Link>
            .
          </p>
        </div>
      )}

      {/* `error`, not a softer tone: the submit will be REFUSED until these are
          filled in, so anything gentler would understate what happens next. */}
      {!done && missingLot.length > 0 && (
        <Alert variant="error">
          {missingLot.length} produk kedaluwarsa ditemukan lebih banyak dari
          catatan, tapi belum punya tanggal kedaluwarsa. Barang yang
          &ldquo;masuk&rdquo; harus punya tanggal, kalau tidak stoknya tidak
          bisa diurutkan FEFO. Isi dulu sebelum menyelesaikan opname.
        </Alert>
      )}

      {/* ------------------------------------------------------------- table */}
      {/* Hidden while empty: a header row over nothing reads as a sheet that
          failed to load, where the panel above says what to do next. */}
      <div
        className={cn(
          "overflow-x-auto rounded-xl border border-border bg-surface",
          items.length === 0 && "hidden",
        )}
      >
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
              {canEdit && (
                <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
              )}
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
                onRemove={canEdit ? handleRemove : undefined}
              />
            ))}
          </tbody>
        </table>

        {/* A count sheet is a plan for an afternoon, and the plan is wrong the
            moment somebody finds a shelf that was not on it. Without this the
            only remedy was discarding the draft — and every quantity on it.

            ONLY ONCE THE SHEET HAS LINES. The empty state above already offers
            both of these, and while this bar rendered on an empty sheet too the
            screen carried two identical "+ Tambah produk" buttons a few
            centimetres apart. That was invisible for as long as one of them was
            labelled differently, which is the argument for naming a control
            after what it does rather than after where it sits. */}
        {items.length > 0 && !done && can("stockOpnames", "update") && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
            <Button
              variant="secondary"
              onClick={() => setAddingProducts(true)}
              disabled={adding}
            >
              + Tambah produk
            </Button>
            {/* The other half of the same decision, still available once the
                sheet has lines: it appends what is MISSING rather than starting
                over, so a partial count can be widened into a full one. */}
            <Button
              variant="ghost"
              onClick={handleLoadEverything}
              disabled={adding}
            >
              {adding ? "Memuat…" : "Muat sisa produk gudang"}
            </Button>
            <span className="text-xs text-muted">
              Baris baru dibuka dengan angka sistem dan berstatus belum dihitung
              — hitungan yang sudah diisi tidak berubah.
            </span>
          </div>
        )}

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
              "mt-1 tabular-nums text-2xl font-semibold",
              totalMinor < 0n
                ? "text-danger"
                : totalMinor > 0n
                  ? "text-success"
                  : "text-muted",
            )}
          >
            {formatMoney(opname.totalDiffValue)}
          </p>
          <p className="mt-1 tabular-nums text-xs text-muted">
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
              // An empty sheet has nothing to submit and the API says so; the
              // button is disabled rather than left to produce that 400.
              disabled={
                preview.loading || saveState === "saving" || items.length === 0
              }
            >
              {preview.loading ? "Menghitung…" : "Selesaikan opname"}
            </Button>
          ) : (
            <Alert variant="info">
              Anda bisa mengisi hitungan, tapi penyelesaian opname dilakukan
              oleh rekan dengan izin <b>submit</b>. Itu disengaja: yang
              menghitung dan yang menyetujui selisihnya sebaiknya bukan orang
              yang sama.
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

      {addingProducts && (
        <OpnameAddProductsDialog
          existingProductIds={items.map((item) => item.productId)}
          busy={adding}
          onAdd={addProducts}
          onClose={() => {
            setAddError(null);
            setAddingProducts(false);
          }}
        />
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Hapus produk dari lembar ini?"
          confirmLabel="Hapus baris"
          destructive
          onConfirm={() => {
            void removeLine(pendingRemove.productId);
            setPendingRemove(null);
          }}
          onCancel={() => setPendingRemove(null)}
        >
          {/* Inline fragments, not <p>: DialogDescription is itself a <p>. */}
          <>
            <b>{pendingRemove.productName ?? "Produk ini"}</b> sudah dihitung —
            jumlah fisik{" "}
            <b className="tabular-nums">
              {formatQty(pendingRemove.physicalQty)}
            </b>{" "}
            akan ikut terbuang bersama barisnya.
            <span className="mt-2 block">
              Tidak ada stok yang berubah: lembar ini masih draft dan belum
              menulis apa pun. Tapi hasil hitungnya tidak bisa dikembalikan
              tanpa kembali ke rak.
            </span>
          </>
        </ConfirmDialog>
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
            <b className="tabular-nums">
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
  onRemove,
}: {
  item: OpnameItem;
  readOnly: boolean;
  onEdit: (
    productId: string,
    patch: { physicalQty?: string; batchCode?: string; expiryDate?: string },
  ) => void;
  onCounted: (productId: string, counted: boolean) => void;
  /** Absent when the sheet is final or the role may not edit it. */
  onRemove?: (item: OpnameItem) => void;
}) {
  const diffMinor = toMinor(item.diffQty) ?? 0n;
  const counted = item.countedAt !== null;
  // Found stock of goods that expire has to DATE its lot, or the API refuses
  // it. The code is optional — a blank one is filled from that same date.
  const needsLot = Boolean(item.productHasExpiry) && diffMinor > 0n;
  const lotMissing = needsLot && !item.expiryDate;

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
          <p className="tabular-nums text-xs text-muted">
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

        <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted">
          {formatQty(item.systemQty)}
        </td>

        <td className="px-4 py-2.5 text-right">
          {readOnly ? (
            <span className="tabular-nums text-sm">
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
              className="ml-auto max-w-24 text-right tabular-nums"
            />
          )}
        </td>

        <td
          className={cn(
            "px-4 py-2.5 text-right tabular-nums text-sm font-semibold",
            diffMinor === 0n && "text-muted",
            diffMinor < 0n && "text-danger",
            diffMinor > 0n && "text-success",
          )}
        >
          {diffMinor === 0n
            ? "—"
            : `${diffMinor > 0n ? "+" : ""}${formatQty(item.diffQty)}`}
        </td>

        <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted">
          {formatMoney(item.hppAtOpname)}
        </td>

        <td className="px-4 py-2.5 text-right tabular-nums text-xs">
          {diffMinor === 0n ? "—" : formatMoney(item.diffValue)}
        </td>

        {onRemove && (
          <td className="px-4 py-2.5 text-right">
            <button
              type="button"
              onClick={() => onRemove(item)}
              className="text-sm font-medium text-danger hover:underline"
            >
              Hapus
            </button>
          </td>
        )}
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
          {/* Spans the action column too when there is one, or the lot fields
              would be pushed out from under the row they belong to. */}
          <td colSpan={onRemove ? 8 : 7} className="px-4 py-2.5">
            <div className="flex flex-wrap items-end gap-3">
              <p className="min-w-64 flex-1 text-xs text-muted">
                <b>{item.productName}</b> punya masa kedaluwarsa dan ditemukan
                lebih banyak dari catatan — isi tanggal kedaluwarsanya. Kode
                batch boleh dikosongkan.
              </p>

              {/* THE TWO FIELDS ARE ONE GROUP, and wrap as one. Left as
                  siblings of the sentence above, the code and its date were
                  pushed onto separate lines by a long product name — and a lot
                  is only a lot when both halves are read together. */}
              <div className="flex shrink-0 items-end gap-3">
                <Input
                  aria-label={`Kode batch ${item.productName ?? ""}`}
                  value={item.batchCode ?? ""}
                  onChange={(event) =>
                    onEdit(item.productId, { batchCode: event.target.value })
                  }
                  /* The derived name, but only once the date it derives from
                     exists — a preview of a code the server will not use is
                     worse than no preview. */
                  placeholder={
                    item.expiryDate
                      ? autoBatchCode(
                          item.productSku,
                          item.expiryDate.slice(0, 10),
                          "",
                        )
                      : "Kode batch (opsional)"
                  }
                  className="w-44"
                />
                <Input
                  aria-label={`Tanggal kedaluwarsa ${item.productName ?? ""}`}
                  type="date"
                  value={item.expiryDate ? item.expiryDate.slice(0, 10) : ""}
                  onChange={(event) =>
                    onEdit(item.productId, { expiryDate: event.target.value })
                  }
                  className="w-44"
                />
              </div>
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
      <p className={cn("mt-1 text-sm font-semibold", mono && "tabular-nums")}>
        {value}
      </p>
    </div>
  );
}
