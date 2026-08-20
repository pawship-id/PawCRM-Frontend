"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  Alert,
  Button,
  Card,
  FilterSelect,
  Spinner,
  TextField,
  namedOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button as UIButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface DraftLine {
  productId: string;
  /** "" = not chosen, a lot id, or NEW_BATCH. Only for lot-tracked products. */
  batchChoice: string;
  newQty: string;
  costPerUnit: string;
  batchCode: string;
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

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
        batchCode: "",
        expiryDate: "",
        isConsignment: false,
      })),
    ]);
    setFieldErrors({});
  }

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
    setFieldErrors({});
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setFieldErrors({});
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
      next.notes = "Alasan wajib diisi - ini yang dibaca saat diaudit.";
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
        if (line.batchCode.trim() === "")
          next[`${at}.batchCode`] = "Kode batch wajib diisi.";
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

  const blocking = Object.values(collectErrors())[0] ?? null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const errors = collectErrors();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(null);
      return;
    }

    setSaving(true);
    setFieldErrors({});
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
            batchCode: makingBatch ? line.batchCode.trim() : undefined,
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
          ? error.message
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
  const columnCount = anyIncreasing ? 6 : 5;

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
        {formError && <Alert variant="error">{formError}</Alert>}

        <Card
          title="Keterangan dokumen"
          description="Satu dokumen untuk satu gudang, dengan nomornya sendiri."
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <FilterSelect
                  layout="field"
                  label="Cabang"
                  ariaLabel="Cabang"
                  value={branchId}
                  options={namedOptions(scope.branches)}
                  active={false}
                  required
                  placeholder={scope.loading ? "Memuat…" : "Pilih cabang"}
                  onChange={(value) => {
                    if (value === branchId) return;
                    setPickedBranch(value);
                    // Everything below is scoped to the branch: the warehouse
                    // may not belong to the new one, and the rows were chosen
                    // against the old warehouse's stock.
                    setWarehouseId("");
                    setLines([]);
                    setProductById(new Map());
                    setFieldErrors({});
                  }}
                />
                {fieldErrors.branchId && (
                  <p role="alert" className="mt-1.5 text-xs text-danger">
                    {fieldErrors.branchId}
                  </p>
                )}
              </div>
              <div>
                <FilterSelect
                  layout="field"
                  label="Gudang"
                  ariaLabel="Gudang"
                  value={warehouseId}
                  options={namedOptions(scopedWarehouses)}
                  active={false}
                  required
                  placeholder={
                    branchId === "" ? "Pilih cabang dulu" : "Pilih gudang"
                  }
                  // Nothing to offer until a branch is named: the list IS the
                  // branch's warehouses, so an enabled empty picker would read
                  // as "this branch has none".
                  disabled={branchId === ""}
                  onChange={(value) => {
                    if (value === warehouseId) return;
                    setWarehouseId(value);
                    // Every row's system quantity - and every lot on offer -
                    // belongs to the old warehouse. Keeping them would leave the
                    // sheet describing somewhere the goods are not.
                    setLines([]);
                    setProductById(new Map());
                    setFieldErrors({});
                  }}
                />
                {fieldErrors.warehouseId && (
                  <p role="alert" className="mt-1.5 text-xs text-danger">
                    {fieldErrors.warehouseId}
                  </p>
                )}
                {lines.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted">
                    Mengganti gudang akan mengosongkan daftar produk di bawah.
                  </p>
                )}
              </div>
              <TextField
                label="Tanggal"
                name="entryDate"
                type="date"
                value={entryDate}
                max={todayValue()}
                onChange={(event) => {
                  setEntryDate(event.target.value);
                  setFieldErrors({});
                }}
                error={fieldErrors.entryDate}
                hint="Tanggal kejadiannya, bukan tanggal dokumen dibuat."
                disabled={saving}
                required
              />
            </div>

            <TextField
              label="Alasan"
              name="notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setFieldErrors({});
              }}
              error={fieldErrors.notes}
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
                      <TableHead className="text-right">Stok sistem</TableHead>
                      <TableHead className="text-right">Stok baru</TableHead>
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
                      const at = `line.${line.productId}`;
                      const product = productById.get(line.productId);
                      const system = systemQtyOf(line);
                      const delta = deltaOf(line);
                      const deltaMinor = delta === null ? null : toMinor(delta);
                      const increasing = deltaMinor !== null && deltaMinor > 0n;
                      const makingBatch = line.batchChoice === NEW_BATCH;

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
                                aria-invalid={Boolean(
                                  fieldErrors[`${at}.newQty`],
                                )}
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
                                    aria-invalid={Boolean(
                                      fieldErrors[`${at}.cost`],
                                    )}
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

                          {(fieldErrors[`${at}.newQty`] ||
                            fieldErrors[`${at}.batch`] ||
                            fieldErrors[`${at}.cost`]) && (
                            <TableRow>
                              <TableCell colSpan={columnCount} className="pt-0">
                                <p role="alert" className="text-xs text-danger">
                                  {fieldErrors[`${at}.batch`] ??
                                    fieldErrors[`${at}.newQty`] ??
                                    fieldErrors[`${at}.cost`]}
                                </p>
                              </TableCell>
                            </TableRow>
                          )}

                          {/* The lot this row is about, on exactly the rows
                              that have one, so the sheet stays a column of
                              quantities for the rows that do not. The cost is
                              no longer here — it is a column now, beside the
                              Selisih that asks for it. */}
                          {product?.hasExpiry && (
                            <TableRow className="bg-accent/40">
                              <TableCell colSpan={columnCount}>
                                <div className="flex flex-wrap items-end gap-4">
                                  {product?.hasExpiry && (
                                    <div className="min-w-56">
                                      <FilterSelect
                                        layout="field"
                                        label="Batch"
                                        ariaLabel={`Batch ${product.name}`}
                                        value={line.batchChoice}
                                        active={line.batchChoice !== ""}
                                        placeholder="Pilih batch"
                                        options={[
                                          ...(
                                            lots.byProduct.get(
                                              line.productId,
                                            ) ?? []
                                          ).map((lot) => ({
                                            value: lot._id,
                                            label: `${lot.batchCode} - sisa ${formatQty(lot.qtyRemaining)}`,
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
                                    </div>
                                  )}

                                  {makingBatch && (
                                    <>
                                      <div className="min-w-44">
                                        <Label className="mb-1.5 block">
                                          Kode batch baru
                                        </Label>
                                        <Input
                                          aria-label={`Kode batch baru ${product?.name ?? ""}`}
                                          value={line.batchCode}
                                          onChange={(event) =>
                                            patchLine(index, {
                                              batchCode: event.target.value,
                                            })
                                          }
                                          placeholder="mis. WSK-B26-0640"
                                          aria-invalid={Boolean(
                                            fieldErrors[`${at}.batchCode`],
                                          )}
                                        />
                                      </div>
                                      <div className="min-w-44">
                                        <Label className="mb-1.5 block">
                                          Kedaluwarsa
                                        </Label>
                                        <Input
                                          aria-label={`Tanggal kedaluwarsa ${product?.name ?? ""}`}
                                          type="date"
                                          value={line.expiryDate}
                                          onChange={(event) =>
                                            patchLine(index, {
                                              expiryDate: event.target.value,
                                            })
                                          }
                                          aria-invalid={Boolean(
                                            fieldErrors[`${at}.expiryDate`],
                                          )}
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
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

          {fieldErrors.lines && (
            <p role="alert" className="mt-3 text-xs text-danger">
              {fieldErrors.lines}
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || blocking !== null}>
              {saving ? "Menyimpan..." : "Simpan penyesuaian"}
            </Button>
          </div>

          {blocking && !saving && (
            <p className="text-xs text-muted">
              Belum bisa disimpan: <b>{blocking}</b>
            </p>
          )}

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
