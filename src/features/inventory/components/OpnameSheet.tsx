"use client";

import { SkuText } from "@/components/SkuText";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Alert,
  Button,
  ConfirmDialog,
  FilterSelect,
  InternalBatchCodeDisplay,
  Spinner,
  SupplierBatchCodeInput,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { batchCodeHint, lotOptionLabel } from "@/lib/batchCode";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { OpnameItem, ProductBatch } from "@/types/inventory";
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";
import { formatMoney, formatQty, toMinor } from "@/utils/decimal";

import { useOpnamePreview } from "../hooks/useOpnamePreview";
import {
  useOpnameSheet,
  type BatchChoice,
  type SheetLine,
} from "../hooks/useOpnameSheet";
import { useWarehouseBatches } from "../hooks/useWarehouseBatches";
import { JournalPreview } from "./JournalPreview";
import { OpnameAddProductsDialog } from "./OpnameAddProductsDialog";
import { OpnameStatusBadge } from "./OpnameStatusBadge";
import { prefetchProductCandidates } from "../hooks/useProductCandidates";

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
  // Which lot the line counted — what a variance on a product that expires is
  // actually argued about.
  { header: "Batch dihitung", value: (item) => batchText(item) ?? "" },
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
  // OURS once the sheet has been submitted and the lot exists; blank on a
  // draft, where there is no lot yet to have a code.
  {
    header: "Kode batch internal",
    value: (item) => item.postedBatchCode ?? "",
  },
  {
    header: "Kode batch supplier",
    value: (item) => item.supplierBatchCode ?? "",
  },
  {
    header: "Kedaluwarsa",
    value: (item) => item.expiryDate ?? "",
    type: "date",
  },
  { header: "Catatan", value: (item) => item.notes ?? "" },
];

/** The dropdown's "a lot the system does not know" row. Never sent as an id. */
const NEW_BATCH = "new-batch";

function formatExpiry(value: string | null | undefined): string | null {
  return value
    ? new Date(value).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;
}

/**
 * What lot a line counts, in words — or null for a product that has none to
 * speak of. Used where the line is READ: a submitted sheet and the export.
 */
function batchText(item: OpnameItem): string | null {
  if (item.batchId) {
    return [
      item.lotCode ?? "Batch",
      item.lotSupplierBatchCode && `supplier ${item.lotSupplierBatchCode}`,
      formatExpiry(item.lotExpiryDate) &&
        `exp ${formatExpiry(item.lotExpiryDate)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (item.newBatch) {
    return item.postedBatchCode
      ? `Batch baru · ${item.postedBatchCode}`
      : "Batch baru";
  }
  return item.productHasExpiry ? "Semua batch" : null;
}

/** The dropdown's row for one lot: code, supplier code, expiry, what is left. */
function lotLabel(lot: ProductBatch): string {
  const expiry = formatExpiry(lot.expiryDate);
  return expiry
    ? `${lotOptionLabel(lot)} · exp ${expiry}`
    : lotOptionLabel(lot);
}

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
    changeBatch,
    removeLine,
    flush,
    addProducts,
    addEveryProduct,
    adding,
    reload,
  } = useOpnameSheet(opnameId);

  const preview = useOpnamePreview(opnameId);

  /**
   * The lots the warehouse holds, for the per-line batch dropdown. Only asked
   * of a DRAFT — a submitted sheet is read, not edited, and names its lots from
   * the labels the detail read already carries.
   */
  const lots = useWarehouseBatches(
    opname?.status === "draft" ? opname.warehouseId : "",
    // Kept current like the system quantities: the lots of the lines on the
    // sheet are re-read when products join and when somebody comes back.
    items.map((item) => item.productId),
  );

  const editable =
    opname?.status === "draft" && can("stockOpnames", "update");

  /**
   * ONE LOT, NO QUESTION. A line of a product that expires which names no batch
   * yet — an old draft's whole-product line — is pointed at the lot itself when
   * the product holds exactly one here that no other line counts. Only while it
   * is uncounted: a number already typed was counted for "semua batch", and
   * switching the lot under it would quietly throw it away. The dropdown still
   * offers "Batch baru" afterwards, for a carton the system does not know.
   */
  useEffect(() => {
    if (!editable || lots.loading) return;

    const taken = new Set(
      items.map((item) => item.batchId).filter(Boolean) as string[],
    );

    items.forEach((item, index) => {
      if (
        !item.productHasExpiry ||
        item.batchId ||
        item.newBatch ||
        item.countedAt !== null
      ) {
        return;
      }
      const productLots = lots.byProduct.get(item.productId) ?? [];
      if (productLots.length !== 1) return;
      const [lot] = productLots;
      if (taken.has(lot._id)) return;

      taken.add(lot._id);
      changeBatch(index, {
        kind: "lot",
        batchId: lot._id,
        systemQty: lot.qtyRemaining,
      });
    });
  }, [editable, lots.loading, lots.byProduct, items, changeBatch]);

  const [addingProducts, setAddingProducts] = useState(false);
  // Fetched as the form opens, so "+ Tambah produk" opens on a list that is
  // already here instead of a spinner — see prefetchProductCandidates. Only for a
  // sheet that can still take products.
  useEffect(() => {
    if (editable) prefetchProductCandidates({});
  }, [editable]);
  const [addError, setAddError] = useState<string | null>(null);
  /** A counted line waiting on confirmation — see `handleRemove`. */
  const [pendingRemove, setPendingRemove] = useState<{
    item: OpnameItem;
    index: number;
  } | null>(null);
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
      !item.batchId &&
      (toMinor(item.diffQty) ?? 0n) > 0n &&
      !item.expiryDate,
  );

  /**
   * Lines of a product that expires that name no batch — only an old draft can
   * carry one. The API refuses to finish the sheet until each picks a batch.
   */
  const unbatched = items.filter(
    (item) => item.productHasExpiry && !item.batchId && !item.newBatch,
  );

  /** The Batch column appears once any line is of a product that expires. */
  const showBatch = items.some(
    (item) => item.productHasExpiry || item.batchId || item.newBatch,
  );

  /**
   * What one line's batch dropdown offers: the lots of its product at this
   * warehouse that no OTHER line already counts, and a new lot. There is no
   * "whole product" choice — a product that expires is always counted batch by
   * batch, and a lot counted twice is refused by the API, so neither is offered.
   */
  function batchOptions(index: number) {
    const item = items[index];
    const siblings = items.filter(
      (other, at) => at !== index && other.productId === item.productId,
    );
    const taken = new Set(
      siblings.map((other) => other.batchId).filter(Boolean),
    );
    const available = (lots.byProduct.get(item.productId) ?? []).filter(
      (lot) => !taken.has(lot._id),
    );

    const options = available.map((lot) => ({
      value: lot._id,
      label: lotLabel(lot),
      triggerLabel: `${lot.batchCode} · sisa ${formatQty(lot.qtyRemaining)}`,
    }));

    // A lot sold down to nothing since it was put on the sheet is no longer in
    // the warehouse's list, yet it is still the lot this line counts.
    if (item.batchId && !available.some((lot) => lot._id === item.batchId)) {
      options.unshift({
        value: item.batchId,
        label: batchText(item) ?? "Batch",
        triggerLabel: item.lotCode ?? "Batch",
      });
    }

    options.push({
      value: NEW_BATCH,
      label: "+ Batch baru — belum tercatat di sistem",
      triggerLabel: "Batch baru",
    });

    return options;
  }

  function handleBatchChange(index: number, value: string) {
    const item = items[index];
    let choice: BatchChoice;

    if (value === NEW_BATCH) {
      choice = { kind: "new" };
    } else {
      const lot = (lots.byProduct.get(item.productId) ?? []).find(
        (candidate) => candidate._id === value,
      );
      choice = {
        kind: "lot",
        batchId: value,
        systemQty:
          lot?.qtyRemaining ?? (value === item.batchId ? item.systemQty : "0"),
      };
    }

    changeBatch(index, choice);
  }

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
  function handleRemove(item: OpnameItem, index: number) {
    if (item.countedAt !== null) {
      setPendingRemove({ item, index });
      return;
    }
    void removeLine(index);
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

      {/* ------------------------------------------------------------ header */}
      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-surface p-4">
        <Field label="Nomor" value={opname.opnameNumber} mono />
        {/* CABANG BEFORE GUDANG — which set of books, then which shelf, the
            order every stock screen in this module asks its two scoping
            questions in. Em dash on a sheet that declared no branch, which is
            what the ones opened before the field carry; it is NOT filled in from
            the warehouse's default, because a shared warehouse's default is one
            answer for every shop it serves. */}
        <Field label="Cabang" value={opname.branchName ?? "—"} />
        <Field label="Gudang" value={opname.warehouseName ?? "—"} />
        <Field
          label="Terhitung"
          value={`${countedCount} / ${items.length} baris`}
        />
        <Field label="Baris berselisih" value={String(differing.length)} />
        <div className="ml-auto flex flex-col items-end gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
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

      {!done && items.length > 0 && countedCount < items.length && (
        <Alert variant="info">
          {items.length - countedCount} baris belum dihitung. Baris yang belum
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

      {!done && unbatched.length > 0 && (
        <Alert variant="error">
          {unbatched.length} baris belum memilih batch. Produk yang punya
          kedaluwarsa dihitung per batch — pilih batchnya, atau{" "}
          <b>Batch baru</b> kalau barangnya belum tercatat.
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
            {/* NOWRAP: the lot fields sit on the line they belong to, so the
                table is wider than a laptop and scrolls sideways — headers
                breaking into two lines would only make every row taller. */}
            <tr className="whitespace-nowrap border-b border-border text-xs uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Produk</th>
              {showBatch && (
                <>
                  <th className="px-4 py-2.5 text-left font-medium">Batch</th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    Kode batch
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    Kode supplier
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    Kedaluwarsa
                  </th>
                </>
              )}
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
            {items.map((item, index) => (
              <SheetRow
                key={`${item.productId}-${item.batchId ?? (item.newBatch ? "new" : "whole")}-${index}`}
                item={item}
                index={index}
                readOnly={done}
                showBatch={showBatch}
                batchOptions={
                  showBatch && item.productHasExpiry && !done
                    ? batchOptions(index)
                    : null
                }
                lotsLoading={lots.loading}
                onBatch={handleBatchChange}
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
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary-hover">
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
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
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
                preview.loading ||
                saveState === "saving" ||
                items.length === 0 ||
                unbatched.length > 0
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
        </div>
      )}

      {addingProducts && (
        <OpnameAddProductsDialog
          // A product that expires stays on offer: adding it again opens a
          // line for the next batch the sheet does not count yet.
          existingProductIds={items
            .filter((item) => !item.productHasExpiry)
            .map((item) => item.productId)}
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
            void removeLine(pendingRemove.index);
            setPendingRemove(null);
          }}
          onCancel={() => setPendingRemove(null)}
        >
          {/* Inline fragments, not <p>: DialogDescription is itself a <p>. */}
          <>
            <b>{pendingRemove.item.productName ?? "Produk ini"}</b>
            {batchText(pendingRemove.item) &&
              ` (${batchText(pendingRemove.item)})`}{" "}
            sudah dihitung — jumlah fisik{" "}
            <b className="tabular-nums">
              {formatQty(pendingRemove.item.physicalQty)}
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
  index,
  readOnly,
  showBatch,
  batchOptions,
  lotsLoading,
  onBatch,
  onEdit,
  onCounted,
  onRemove,
}: {
  item: SheetLine;
  index: number;
  readOnly: boolean;
  /** Whether the table carries the Batch column at all. */
  showBatch: boolean;
  /** This line's dropdown, or null where it has nothing to choose. */
  batchOptions:
    { value: string; label: string; triggerLabel?: string }[] | null;
  lotsLoading: boolean;
  onBatch: (index: number, value: string) => void;
  onEdit: (
    index: number,
    patch: {
      physicalQty?: string;
      supplierBatchCode?: string;
      expiryDate?: string;
    },
  ) => void;
  onCounted: (index: number, counted: boolean) => void;
  /** Absent when the sheet is final or the role may not edit it. */
  onRemove?: (item: OpnameItem, index: number) => void;
}) {
  const diffMinor = toMinor(item.diffQty) ?? 0n;
  const counted = item.countedAt !== null;
  /**
   * Found stock of goods that expire has to DATE its lot, or the API refuses
   * it — but only where the goods go into a lot that does not exist yet. A
   * line counting a named lot puts what it found back into THAT lot, which
   * already has a date. Neither code is asked for: ours is derived from the
   * date when the sheet is submitted, and the supplier's is optional.
   */
  const needsLot =
    Boolean(item.productHasExpiry) && !item.batchId && diffMinor > 0n;
  const lotMissing = needsLot && !item.expiryDate;
  // Empty for an old draft's whole-product line: it must still pick one.
  const batchValue = item.batchId ?? (item.newBatch ? NEW_BATCH : "");
  // A NEW batch always asks for its lot, before anything is typed: the system
  // holds none of it, so whatever is counted there is found goods to be dated.
  const editLot = !readOnly && (needsLot || item.newBatch === true);

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/60",
          !counted && !readOnly && "bg-accent/20",
        )}
      >
        <td className="min-w-52 px-4 py-2.5">
          <p className="text-sm font-medium">{item.productName ?? "—"}</p>
          <p className="tabular-nums text-xs text-muted">
            {item.productSku ? (
              <SkuText value={item.productSku} />
            ) : (
              item.productId
            )}
            {item.productUnit && ` · ${item.productUnit}`}
          </p>
        </td>

        {showBatch && (
          <td className="px-4 py-2.5">
            {batchOptions ? (
              lotsLoading ? (
                <span className="text-xs text-muted">Memuat batch…</span>
              ) : (
                <div className="w-56">
                  <FilterSelect
                    layout="field"
                    label=""
                    ariaLabel={`Batch ${item.productName ?? ""}`}
                    value={batchValue}
                    active={false}
                    placeholder="Pilih batch"
                    invalid={batchValue === ""}
                    options={batchOptions}
                    wideList
                    onChange={(value) => {
                      if (value !== batchValue) onBatch(index, value);
                    }}
                  />
                </div>
              )
            ) : (
              <span className="text-xs text-muted">
                {batchText(item) ?? "—"}
              </span>
            )}
          </td>
        )}

        {/**
         * THE LOT, ON THE SAME LINE. Editable only where found goods go into a
         * lot that does not exist yet — a new batch, or an old whole-product
         * line — and only the DATE is required: our code is derived from it at
         * submit, the supplier's is optional. A line counting a named lot shows
         * that lot's own details, read-only.
         */}
        {showBatch && (
          <>
            <td className="px-4 py-2.5">
              {editLot ? (
                <InternalBatchCodeDisplay
                  code={item.postedBatchCode ?? null}
                  hint={
                    item.expiryDate
                      ? batchCodeHint(
                          item.productSku,
                          item.expiryDate.slice(0, 10),
                          "",
                        )
                      : undefined
                  }
                  productName={item.productName}
                  className="w-40 text-sm"
                />
              ) : (
                <LotText
                  value={item.batchId ? item.lotCode : item.postedBatchCode}
                />
              )}
            </td>
            <td className="px-4 py-2.5">
              {editLot ? (
                <SupplierBatchCodeInput
                  value={item.supplierBatchCode ?? ""}
                  onChange={(value) =>
                    onEdit(index, { supplierBatchCode: value })
                  }
                  productName={item.productName}
                  className="w-40"
                />
              ) : (
                <LotText
                  value={
                    item.batchId
                      ? item.lotSupplierBatchCode
                      : item.supplierBatchCode
                  }
                />
              )}
            </td>
            <td className="px-4 py-2.5">
              {editLot ? (
                <Input
                  aria-label={`Tanggal kedaluwarsa ${item.productName ?? ""}`}
                  aria-invalid={lotMissing}
                  type="date"
                  value={item.expiryDate ? item.expiryDate.slice(0, 10) : ""}
                  onChange={(event) =>
                    onEdit(index, { expiryDate: event.target.value })
                  }
                  className="w-40"
                />
              ) : (
                <LotText
                  value={formatExpiry(
                    item.batchId ? item.lotExpiryDate : item.expiryDate,
                  )}
                />
              )}
            </td>
          </>
        )}

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
              onCheckedChange={(value) => onCounted(index, value === true)}
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
                onEdit(index, { physicalQty: event.target.value })
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
              onClick={() => onRemove(item, index)}
              className="text-sm font-medium text-danger hover:underline"
            >
              Hapus
            </button>
          </td>
        )}
      </tr>
    </>
  );
}

/** One read-only lot detail in a cell, or a dash where there is none. */
function LotText({ value }: { value: string | null | undefined }) {
  return (
    <span className="whitespace-nowrap tabular-nums text-xs text-muted">
      {value || "—"}
    </span>
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
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-semibold", mono && "tabular-nums")}>
        {value}
      </p>
    </div>
  );
}
