"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  InternalBatchCodeDisplay,
  Spinner,
  SupplierBatchCodeInput,
  TextField,
  TextareaField,
  namedOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button as UIButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { batchCodeHint, lotOptionLabel } from "@/lib/batchCode";
import { blockingReason } from "../utils/blocker";
import { ApiError } from "@/services/api-error";
import { stockEntryService } from "@/services/stockEntry.service";
import type { Product } from "@/types/inventory";
import {
  formatQty,
  isDecimal,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

import { useStockCardLookups } from "../hooks/useStockCardLookups";
import { useBranchScope, warehousesForBranch } from "../hooks/useBranchScope";
import { useWarehouseBatches } from "../hooks/useWarehouseBatches";
import { qtyAtWarehouse } from "../utils/ledger";
import { AdjustmentAddProductsDialog } from "./AdjustmentAddProductsDialog";

/**
 * A manual stock adjustment — one numbered document, however many products.
 *
 * NOBODY PICKS A DIRECTION. Each row asks for the quantity that is really on the
 * shelf and derives the rest: `selisih = stok baru - stok sistem`, and the sign
 * falls out of the subtraction. "Barang masuk / barang keluar" was the shop's
 * language for a warehouse door, not for a correction, and a pair of buttons
 * asked somebody to classify their own arithmetic before doing it.
 *
 * IT ALSO MAKES NEGATIVE STOCK UNWRITEABLE. While a field held "how much to
 * remove", entering more than the shelf had was one keystroke; now it holds "how
 * much is there", and a count is never below nothing.
 *
 * A SHEET, NOT ONE PRODUCT PER SUBMISSION, and the document is why: an audit
 * asks "what did you correct on the 19th", and the answer should be one number
 * to look up rather than nine. Products arrive through ProductMultiPicker, the
 * same way they do on the opname sheet, the transfer form and the opening stock
 * document.
 *
 * A PRODUCT THAT TRACKS LOTS IS ADJUSTED ONE LOT AT A TIME. Such a product has
 * no single balance to correct - it has one per lot, and the person counting is
 * holding a particular box. The lot is CHOSEN from the ones at that warehouse
 * rather than typed, so a slip of the keyboard cannot mint a second lot for
 * goods that already have one; "+ Batch baru" is the deliberate way to make one.
 *
 * COST IS ASKED ONLY WHEN STOCK ARRIVES. Goods leaving are drawn at the average
 * the ledger already holds, so the field appears on exactly the rows that grow.
 *
 * THE REASON IS REQUIRED, and it lives on the header rather than per row. It is
 * the sentence an audit reads first; the ledger has no notion of a document, so
 * the server stamps it onto every movement the posting writes.
 */

/** The sentinel the batch picker uses for "make a new one". */
const NEW_BATCH = "__new__";

/** Today in the browser's timezone, as the `date` input wants it. */
function todayValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * The required marker a column header carries — the same red asterisk
 * `TextField` puts after a label, so the table and the fields above it say
 * "wajib" the same way.
 *
 * SAID UP FRONT rather than complained about afterwards. A red border and a
 * sentence under the row told somebody they had got it wrong; an asterisk tells
 * them before they do, and the disabled save button says what is still missing.
 */
function Required() {
  return <span className="text-danger"> *</span>;
}

interface DraftLine {
  productId: string;
  /** "" = not chosen, a lot id, or NEW_BATCH. Only for lot-tracked products. */
  batchChoice: string;
  newQty: string;
  costPerUnit: string;
  /**
   * THEIR code — the number printed on the carton, typed only while a new lot
   * is being opened. Ours is generated and unique across the tenant, so the API
   * refuses a client-supplied one and this form never holds it.
   */
  supplierBatchCode: string;
  expiryDate: string;
  isConsignment: boolean;
}

export function StockAdjustmentForm() {
  const router = useRouter();
  const lookups = useStockCardLookups();

  const [warehouseId, setWarehouseId] = useState("");
  /**
   * WHERE, asked before WHICH SHELF.
   *
   * The branch is the first question because it is the one the person filling
   * this in already knows: they are standing in, or answering for, a shop. The
   * warehouse list is then whatever that branch may post at — its own, plus the
   * shared central one — so a mismatched pair cannot be assembled at all.
   */
  const [pickedBranch, setPickedBranch] = useState("");
  const [entryDate, setEntryDate] = useState(todayValue);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productById, setProductById] = useState<Map<string, Product>>(
    new Map(),
  );
  const [picking, setPicking] = useState(false);

  /**
   * Which fields the user has actually engaged with.
   *
   * WHY NOT `fieldErrors` STATE, which is what this replaced. That was written
   * only inside `handleSubmit` — and the save button is disabled the moment
   * anything is wrong, so the submit never ran and not one per-field message
   * could ever appear. The rules were enforced, the refusals were computed, and
   * the only thing on screen was a red border: colour alone, which
   * docs/ui-rules.md §1 forbids as the only signal.
   *
   * So the errors are DERIVED live from `collectErrors`, and this set decides
   * which of them may speak. A row nobody has touched stays quiet — a sheet that
   * shouts "isi jumlahnya" at every row the moment it is added is a sheet nobody
   * reads — and the moment somebody types into one, it says what it still needs.
   */
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lots = useWarehouseBatches(warehouseId);

  const scope = useBranchScope();
  /**
   * ONE BRANCH IS NOT A CHOICE — a tenant with a single shop reaches the field
   * below without opening a dropdown that has one option in it. Derived rather
   * than written into state by an effect: an effect would render once with the
   * empty value and again with the real one, and the warehouse list in between
   * would be empty for no reason.
   */
  const branchId = pickedBranch || scope.soleBranch;
  // `lookups.warehouses` is ALREADY narrowed to what this user may reach
  // (useStockCardLookups); this second filter answers the other question —
  // what THAT BRANCH may post at.
  const scopedWarehouses = warehousesForBranch(branchId, lookups.warehouses);

  /**
   * What the system believes, per row - the left half of the subtraction.
   *
   * Per LOT when the product tracks them, because that is the balance being
   * corrected; a new lot starts at nothing. Per warehouse otherwise.
   */
  function systemQtyOf(line: DraftLine): string | null {
    const product = productById.get(line.productId);
    if (!product) return null;

    if (product.hasExpiry) {
      if (line.batchChoice === "") return null;
      if (line.batchChoice === NEW_BATCH) return "0";
      const lot = lots.byProduct
        .get(line.productId)
        ?.find((candidate) => candidate._id === line.batchChoice);
      return lot?.qtyRemaining ?? null;
    }

    return qtyAtWarehouse(product.stockByWarehouse ?? [], warehouseId);
  }

  /**
   * The adjustment itself, as the ledger wants it: signed, and derived.
   *
   * Null while either side is unknown or unusable, so nothing is sent against a
   * half-typed number. Zero is a real answer and deliberately NOT null - it
   * means the count agreed, and the row says so rather than pretending it is
   * still waiting.
   */
  function deltaOf(line: DraftLine): string | null {
    const system = systemQtyOf(line);
    if (system === null || line.newQty.trim() === "") return null;
    if (!isDecimal(line.newQty)) return null;

    const from = toMinor(system);
    const to = toMinor(line.newQty);
    if (from === null || to === null) return null;

    return toDecimalString(to - from);
  }

  /**
   * Whether this row is stock ARRIVING — the only case that needs a cost, since
   * goods leaving are valued at what the ledger already paid for them.
   */
  function isIncreasing(line: DraftLine): boolean {
    const delta = deltaOf(line);
    return delta !== null && (toMinor(delta) ?? 0n) > 0n;
  }

  function addLines(products: Product[]) {
    setProductById((prev) => {
      const next = new Map(prev);
      for (const product of products) next.set(product._id, product);
      return next;
    });
    setLines((prev) => [
      ...prev,
      ...products.map((product) => ({
        productId: product._id,
        batchChoice: "",
        newQty: "",
        costPerUnit: "",
        supplierBatchCode: "",
        expiryDate: "",
        isConsignment: false,
      })),
    ]);
  }

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((current, i) =>
        i === index ? { ...current, ...patch } : current,
      ),
    );
  }

  function markTouched(key: string) {
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Every rule the form owns - one source for the messages and for whether the
   * button may be pressed, so the two cannot drift apart.
   */
  function collectErrors(): Record<string, string> {
    const next: Record<string, string> = {};

    if (warehouseId === "") next.warehouseId = "Pilih gudang dulu.";
    if (branchId === "")
      next.branchId =
        "Pilih cabang — gudang ini belum punya cabang default, jadi nilainya tidak punya tujuan.";
    if (entryDate === "") next.entryDate = "Tanggal wajib diisi.";
    else if (entryDate > todayValue())
      next.entryDate = "Tanggal tidak boleh di masa depan.";
    if (notes.trim() === "")
      next.notes = "Catatan wajib diisi - ini yang dibaca saat diaudit.";
    if (lines.length === 0) next.lines = "Tambahkan minimal satu produk.";

    lines.forEach((line) => {
      const at = `line.${line.productId}`;
      const product = productById.get(line.productId);
      const delta = deltaOf(line);

      if (product?.hasExpiry && line.batchChoice === "") {
        next[`${at}.batch`] = "Pilih batch dulu.";
      }

      if (line.newQty.trim() === "") {
        next[`${at}.newQty`] = "Isi stok barunya.";
      } else if (!isDecimal(line.newQty)) {
        next[`${at}.newQty`] = "Gunakan angka, maksimal 4 desimal.";
      } else if ((toMinor(line.newQty) ?? 0n) < 0n) {
        // A count is never below nothing - the rule is the field's shape.
        next[`${at}.newQty`] = "Tidak bisa minus.";
      } else if (delta !== null && (toMinor(delta) ?? 0n) === 0n) {
        next[`${at}.newQty`] =
          "Tidak ada selisih - keluarkan produk ini dari dokumen.";
      }

      const increasing = delta !== null && (toMinor(delta) ?? 0n) > 0n;

      if (line.batchChoice === NEW_BATCH) {
        // The code is optional: left blank, the lot is named after its expiry.
        // The date is not, because that name is the only thing distinguishing
        // this lot from the next one of the same product.
        if (line.expiryDate === "")
          next[`${at}.expiryDate`] = "Tanggal kedaluwarsa wajib diisi.";
      }

      if (line.costPerUnit.trim() !== "" && !isDecimal(line.costPerUnit)) {
        next[`${at}.cost`] = "Gunakan angka, maksimal 4 desimal.";
      }
      // Required only where nothing can stand in for it: an arrival into a
      // balance with no average yet.
      if (
        increasing &&
        !line.isConsignment &&
        line.costPerUnit.trim() === "" &&
        !product?.hppAvg
      ) {
        next[`${at}.cost`] =
          "Belum ada HPP untuk barang ini - isi harga beli per unit.";
      }
    });

    return next;
  }

  const errors = collectErrors();
  const blocking = blockingReason(
    errors,
    (productId) => productById.get(productId)?.name,
  );

  /** A field's complaint, once its owner has engaged with it. */
  function shown(key: string, scope = key): string | undefined {
    return touched.has(scope) ? errors[key] : undefined;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // The button is disabled while anything is wrong, so this guards a submit
    // that arrived another way — a keyboard Enter on a form whose state moved
    // between render and event.
    if (Object.keys(collectErrors()).length > 0) {
      setFormError(null);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const entry = await stockEntryService.createAdjustment({
        warehouseId,
        branchId,
        entryDate,
        notes: notes.trim(),
        lines: lines.map((line) => {
          const delta = deltaOf(line) ?? "0";
          const increasing = (toMinor(delta) ?? 0n) > 0n;
          const makingBatch = line.batchChoice === NEW_BATCH;

          return {
            productId: line.productId,
            // Derived, never typed: the subtraction owns the sign.
            qty: delta,
            systemQty: systemQtyOf(line) ?? undefined,
            // Naming a lot and creating one are mutually exclusive - the API
            // refuses the pair, so the form never assembles it.
            batchId:
              line.batchChoice && !makingBatch ? line.batchChoice : undefined,
            // THEIRS, and only on a lot being OPENED — a lot being joined
            // recorded the supplier's number when it was created. Omitted
            // rather than sent blank: "" would claim a code was meant.
            supplierBatchCode:
              makingBatch && line.supplierBatchCode.trim() !== ""
                ? line.supplierBatchCode.trim()
                : undefined,
            expiryDate: makingBatch ? line.expiryDate : undefined,
            // Only arriving stock carries a cost, and consignment never does.
            costPerUnit:
              increasing &&
              !line.isConsignment &&
              line.costPerUnit.trim() !== ""
                ? line.costPerUnit.trim()
                : undefined,
            isConsignment: increasing && line.isConsignment ? true : undefined,
          };
        }),
      });

      swalToast(`${entry.entryNumber} tersimpan.`);
      router.push(`/dashboard/inventory/adjustments/${entry._id}`);
    } catch (error) {
      // The server's refusals name the SKU or the rule that was broken - the
      // part that says what to fix. Shown verbatim.
      setFormError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  if (lookups.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat daftar gudang...
      </div>
    );
  }

  if (lookups.error) {
    return <Alert variant="error">{lookups.error}</Alert>;
  }

  /**
   * HARGA BELI IS A COLUMN, not a strip under the row — it sits beside the
   * Selisih that calls for it, where the number being priced is readable in the
   * same glance.
   *
   * IT APPEARS ONLY WHEN SOMETHING IS ARRIVING. Most adjustments are losses —
   * rusak, hilang, susut — and those rows have no cost to give. A column that is
   * blank down its whole length on the common sheet is a column people learn to
   * skip, so it is not rendered until a row asks for it.
   */
  const anyIncreasing = lines.some(isIncreasing);
  /**
   * Two columns that come and go with the sheet's contents.
   *
   * A COLUMN NOBODY ON THIS SHEET CAN FILL IS A COLUMN OF DASHES, and a reader
   * pays for it in width on every row. Batch appears once any line tracks lots;
   * the purchase price once any line grows. Both are per-SHEET rather than
   * per-row, because a column cannot exist on one row and not another.
   */
  const anyLotTracked = lines.some(
    (line) => productById.get(line.productId)?.hasExpiry === true,
  );
  /**
   * A lot needs two more columns: its code and its date. They arrive together
   * and leave together — a lot is only a lot when both halves are there.
   *
   * SHOWN FOR A NAMED LOT TOO, not only a new one. The picker to their left
   * says `WSK-B26-0640 - sisa 12`, which identifies the lot but hides what the
   * row is actually about: goods are being added to a batch that expires on a
   * particular day, and that day belongs on the row being read. Left as
   * dashes, the two columns said the opposite — that this lot has no code and
   * no date — about a lot that has both.
   *
   * They are absent entirely until some line names a lot, because a column
   * nobody on this sheet can fill is a column of dashes.
   */
  const anyBatchNamed = lines.some((line) => line.batchChoice !== "");
  /** Whether anything on the sheet is TYPING those two, rather than reading them. */
  const anyMakingBatch = lines.some((line) => line.batchChoice === NEW_BATCH);

  return (
    <>
      {picking && (
        <AdjustmentAddProductsDialog
          existingProductIds={lines.map((line) => line.productId)}
          onAdd={addLines}
          onClose={() => setPicking(false)}
        />
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* The document's head: what it is, its number, and what can be done
            with it — see docs/ui-rules.md §16. NOT pinned; the bar scrolls
            with the page, because two stacked sticky bars (this and
            DashboardShell's) take too much of a laptop viewport.

            `No. [auto]` lives here rather than in the grid: the server
            allocates it on save, so it is not a field anybody fills in, and the
            first row of a form belongs to what actually needs attention. */}
        <FormActionBar
          title="Penyesuaian baru"
          meta={`No. [auto] · ${lines.length} produk`}
          submitLabel="Simpan penyesuaian"
          submitting={saving}
          disabled={blocking !== null}
          blockedReason={blocking}
          cancelHref="/dashboard/inventory/adjustments"
        />

        {formError && <Alert variant="error">{formError}</Alert>}

        <Card
          title="Keterangan dokumen"
          description="Satu dokumen untuk satu gudang, dengan nomornya sendiri."
        >
          <div className="flex flex-col gap-4">
            {/* KAPAN then DI MANA, in that order, on the first row — §16. Every
                transaction module opens with the same two questions so nobody
                re-scans a screen they have not used this week. Cabang drops to
                the second row: it is secondary classification, not the context
                somebody reads first. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Tanggal"
                name="entryDate"
                type="date"
                value={entryDate}
                max={todayValue()}
                onChange={(event) => {
                  setEntryDate(event.target.value);
                }}
                error={shown("entryDate")}
                hint="Tanggal kejadiannya, bukan tanggal dokumen dibuat."
                disabled={saving}
                required
              />

              <div>
                <FilterSelect
                  layout="form"
                  label="Gudang"
                  ariaLabel="Gudang"
                  value={warehouseId}
                  options={namedOptions(scopedWarehouses)}
                  active={false}
                  required
                  error={shown("warehouseId")}
                  placeholder={
                    branchId === "" ? "Pilih cabang dulu" : "Pilih gudang"
                  }
                  // Nothing to offer until a branch is named: the list IS the
                  // branch's warehouses, so an enabled empty picker would read
                  // as "this branch has none".
                  disabled={branchId === ""}
                  onChange={(value) => {
                    if (value === warehouseId) return;
                    markTouched("warehouseId");
                    setWarehouseId(value);
                    // Every row's system quantity - and every lot on offer -
                    // belongs to the old warehouse. Keeping them would leave the
                    // sheet describing somewhere the goods are not.
                    setLines([]);
                    setProductById(new Map());
                  }}
                />
                {lines.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted">
                    Mengganti gudang akan mengosongkan daftar produk di bawah.
                  </p>
                )}
              </div>

              <FilterSelect
                layout="form"
                label="Cabang"
                ariaLabel="Cabang"
                value={branchId}
                options={namedOptions(scope.branches)}
                active={false}
                required
                error={shown("branchId")}
                placeholder={scope.loading ? "Memuat…" : "Pilih cabang"}
                onChange={(value) => {
                  if (value === branchId) return;
                  markTouched("branchId");
                  setPickedBranch(value);
                  // Everything below is scoped to the branch: the warehouse
                  // may not belong to the new one, and the rows were chosen
                  // against the old warehouse's stock.
                  setWarehouseId("");
                  setLines([]);
                  setProductById(new Map());
                }}
              />
            </div>

            {/* Keterangan closes the header, always — §16. A real textarea, not
                the single-line input this was: six months on it is the only
                explanation left, and a reason nobody can re-read before saving
                is a reason nobody writes carefully. */}
            <TextareaField
              label="Keterangan"
              name="notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
              error={shown("notes")}
              hint="Wajib. Enam bulan lagi ini satu-satunya penjelasan yang tersisa."
              placeholder="mis. Barang rusak kena air saat hujan"
              maxLength={500}
              disabled={saving}
              required
            />
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              Produk &amp; jumlahnya
              {lines.length > 0 && (
                <Badge variant="outline">{lines.length} baris</Badge>
              )}
            </span>
          }
          description="Isi jumlah yang benar-benar ada di rak. Selisihnya dihitung sistem."
        >
          {lines.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <UIButton
                type="button"
                variant="secondary"
                onClick={() => setPicking(true)}
                disabled={warehouseId === ""}
              >
                + Tambah produk
              </UIButton>

              <div>
                <p className="font-medium text-foreground">Belum ada produk</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  {warehouseId === ""
                    ? "Pilih gudangnya dulu - stok sistem tiap barang dibaca dari gudang itu."
                    : "Cari dan centang beberapa produk sekaligus - semuanya tersimpan sebagai satu dokumen."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {lots.error && <Alert variant="error">{lots.error}</Alert>}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produk</TableHead>
                      {/* THE LOT IS PART OF WHAT IS BEING COUNTED, so it sits
                          beside the product rather than under it: a lot-tracked
                          product has one balance PER LOT, and the Stok sistem to
                          its right is read from whichever is named here. A row
                          of its own separated the question from its answer. */}
                      {anyLotTracked && (
                        <TableHead>
                          Batch
                          <Required />
                        </TableHead>
                      )}
                      {/* Next to the picker that summons them, so a lot reads
                          left to right as one thought: which lot, called what,
                          expiring when. */}
                      {anyBatchNamed && (
                        <>
                          {/* TWO CODES, TWO COLUMNS. Ours identifies the row
                              and gets barcoded; theirs identifies the factory
                              batch and is what a recall is traced by. */}
                          <TableHead>Kode batch internal</TableHead>
                          <TableHead>Kode batch supplier</TableHead>
                          <TableHead>
                            Kedaluwarsa
                            {/* Only when something is being TYPED. An asterisk
                                over two read-only cells marks as required a
                                field nobody can fill, which is how the marker
                                stops meaning anything. */}
                            {anyMakingBatch && <Required />}
                          </TableHead>
                        </>
                      )}
                      <TableHead className="text-right">Stok sistem</TableHead>
                      <TableHead className="text-right">
                        Stok baru
                        <Required />
                      </TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                      {anyIncreasing && (
                        <TableHead className="text-right">
                          Harga beli / unit
                        </TableHead>
                      )}
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => {
                      const product = productById.get(line.productId);
                      const system = systemQtyOf(line);
                      const delta = deltaOf(line);
                      const deltaMinor = delta === null ? null : toMinor(delta);
                      const increasing = deltaMinor !== null && deltaMinor > 0n;
                      const makingBatch = line.batchChoice === NEW_BATCH;
                      // The lot the picker names, when it names one that
                      // already exists. Its code and date are shown read-only
                      // beside it — they describe the goods, and nothing on
                      // this form may rewrite them.
                      const namedLot =
                        line.batchChoice !== "" && !makingBatch
                          ? ((lots.byProduct.get(line.productId) ?? []).find(
                              (lot) => lot._id === line.batchChoice,
                            ) ?? null)
                          : null;

                      return (
                        <Fragment key={line.productId}>
                          <TableRow>
                            <TableCell>
                              <p className="font-medium text-foreground">
                                {product?.name ?? "Produk"}
                              </p>
                              <p className="text-xs tabular-nums text-muted">
                                {product?.sku}
                                {product?.unit && ` - ${product.unit}`}
                              </p>
                            </TableCell>

                            {anyLotTracked && (
                              <TableCell className="min-w-56">
                                {product?.hasExpiry ? (
                                  <FilterSelect
                                    layout="field"
                                    label=""
                                    ariaLabel={`Batch ${product.name}`}
                                    value={line.batchChoice}
                                    active={line.batchChoice !== ""}
                                    placeholder="Pilih batch"
                                    options={[
                                      ...(
                                        lots.byProduct.get(line.productId) ?? []
                                      /* BOTH CODES — see `lotOptionLabel`.
                                         Picking a lot is matching a row to a
                                         carton, and the number printed on the
                                         carton is the supplier's. */
                                      ).map((lot) => ({
                                        value: lot._id,
                                        label: lotOptionLabel(lot),
                                      })),
                                      {
                                        value: NEW_BATCH,
                                        label: "+ Batch baru...",
                                      },
                                    ]}
                                    onChange={(value) =>
                                      patchLine(index, {
                                        batchChoice: value,
                                        newQty: "",
                                      })
                                    }
                                  />
                                ) : (
                                  // Said rather than left blank: an empty cell
                                  // under "Batch" reads as one nobody filled in.
                                  <span className="text-muted">—</span>
                                )}
                              </TableCell>
                            )}

                            {anyBatchNamed && (
                              <>
                                {/* OURS — never typed, always shown. This screen
                                    has no preview endpoint, so a lot being
                                    OPENED can only show the derived hint: the
                                    real code, suffix and all, is settled when
                                    the entry is saved. */}
                                <TableCell>
                                  {makingBatch ? (
                                    <InternalBatchCodeDisplay
                                      code={null}
                                      hint={
                                        line.expiryDate
                                          ? batchCodeHint(
                                              product?.sku,
                                              line.expiryDate,
                                              "",
                                            )
                                          : undefined
                                      }
                                      productName={product?.name}
                                      className="max-w-44 text-xs"
                                    />
                                  ) : namedLot ? (
                                    <InternalBatchCodeDisplay
                                      code={namedLot.batchCode}
                                      productName={product?.name}
                                      className="max-w-44 text-xs"
                                    />
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </TableCell>
                                {/* THEIRS — typed, optional, and only on a lot
                                    being OPENED. Retagging a lot that already
                                    exists would rewrite the recall trail of the
                                    delivery that opened it. */}
                                <TableCell>
                                  {makingBatch ? (
                                    <SupplierBatchCodeInput
                                      value={line.supplierBatchCode}
                                      onChange={(value) =>
                                        patchLine(index, {
                                          supplierBatchCode: value,
                                        })
                                      }
                                      productName={product?.name}
                                      disabled={saving}
                                      className="w-44"
                                    />
                                  ) : namedLot ? (
                                    <SupplierBatchCodeInput
                                      value={namedLot.supplierBatchCode ?? ""}
                                      onChange={() => {}}
                                      productName={product?.name}
                                      disabled
                                      className="w-44"
                                    />
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {makingBatch ? (
                                    <Input
                                      aria-label={`Tanggal kedaluwarsa ${product?.name ?? ""}`}
                                      type="date"
                                      value={line.expiryDate}
                                      onChange={(event) =>
                                        patchLine(index, {
                                          expiryDate: event.target.value,
                                        })
                                      }
                                      className="w-40"
                                      disabled={saving}
                                    />
                                  ) : namedLot?.expiryDate ? (
                                    <Input
                                      aria-label={`Kedaluwarsa ${product?.name ?? ""}`}
                                      type="date"
                                      value={namedLot.expiryDate.slice(0, 10)}
                                      disabled
                                      className="w-40"
                                    />
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </TableCell>
                              </>
                            )}

                            <TableCell className="text-right tabular-nums text-muted">
                              {system === null ? "-" : formatQty(system)}
                            </TableCell>

                            <TableCell className="text-right">
                              <Input
                                aria-label={`Stok baru ${product?.name ?? ""}`}
                                inputMode="decimal"
                                value={line.newQty}
                                onChange={(event) =>
                                  patchLine(index, {
                                    newQty: event.target.value,
                                  })
                                }
                                placeholder="0"
                                className="ml-auto w-28 text-right tabular-nums"
                                disabled={saving || system === null}
                              />
                            </TableCell>

                            <TableCell
                              className={cn(
                                "text-right font-bold tabular-nums",
                                deltaMinor === null
                                  ? "text-muted"
                                  : deltaMinor === 0n
                                    ? "text-primary"
                                    : increasing
                                      ? "text-success"
                                      : "text-danger",
                              )}
                            >
                              {delta === null
                                ? "-"
                                : `${increasing ? "+" : ""}${formatQty(delta)}`}
                            </TableCell>

                            {anyIncreasing && (
                              <TableCell className="text-right">
                                {increasing && (
                                  <Input
                                    aria-label={`Harga beli per unit ${product?.name ?? ""}`}
                                    inputMode="decimal"
                                    value={line.costPerUnit}
                                    onChange={(event) =>
                                      patchLine(index, {
                                        costPerUnit: event.target.value,
                                      })
                                    }
                                    // Only the one that TELLS you something.
                                    // "wajib" was a placeholder repeating what
                                    // the field already is, sitting in the box
                                    // where the number goes — and the rule it
                                    // announced is enforced on submit anyway,
                                    // with a line that says why.
                                    placeholder={
                                      product?.hppAvg
                                        ? "kosong = pakai HPP"
                                        : undefined
                                    }
                                    className="ml-auto w-44 text-right tabular-nums"
                                    disabled={saving}
                                  />
                                )}
                              </TableCell>
                            )}

                            <TableCell className="text-right">
                              <UIButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLine(index)}
                                disabled={saving}
                                aria-label={`Hapus ${product?.name ?? "produk"}`}
                              >
                                <Trash2 className="size-4" />
                                Hapus
                              </UIButton>
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="border-t border-border/60 pt-3">
                <UIButton
                  type="button"
                  variant="secondary"
                  onClick={() => setPicking(true)}
                  disabled={saving}
                >
                  + Tambah produk
                </UIButton>
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Kartu stok bersifat <b>append-only</b>. Dokumen ini tidak bisa
            diubah atau dihapus - salah angka dikoreksi dengan dokumen baru, dan
            keduanya tetap terlihat.
          </p>
        </div>
      </form>
    </>
  );
}
