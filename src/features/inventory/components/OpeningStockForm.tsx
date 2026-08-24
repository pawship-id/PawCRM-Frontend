"use client";

import { Fragment, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { batchCodeHint } from "@/lib/batchCode";
import { blockingReason } from "../utils/blocker";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { stockEntryService } from "@/services/stockEntry.service";
import type { Product } from "@/types/inventory";
import {
  formatMoney,
  isDecimal,
  isPositive,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

import { useStockCardLookups } from "../hooks/useStockCardLookups";
import { useBranchScope, warehousesForBranch } from "../hooks/useBranchScope";
import { OpeningStockAddProductsDialog } from "./OpeningStockAddProductsDialog";

/**
 * OPENING STOCK for products that were registered without any.
 *
 * WHY THIS SCREEN EXISTS. An opening balance used to be postable at exactly one
 * instant in a product's life — the moment it was created — and a tenant that
 * registered its catalogue first and counted its shelves afterwards had no way
 * back to it. The only route left was a manual adjustment, and that credits
 * 5201 Kerugian Persediaan: a shop's entire day-one inventory arriving as a
 * negative expense, which reads on the P&L as a profit earned by a shop that has
 * sold nothing. Registering the catalogue before counting the shelves is an
 * ordinary way to work and should not cost a wrong set of books.
 *
 * IT POSTS `opening_balance`, WHICH CREDITS 3101 MODAL / SALDO AWAL. That is the
 * only thing separating this screen from the adjustment form, and it is the
 * whole of it: goods a tenant already owned were not bought from anyone in this
 * system, so there is no supplier to owe and no sale to book — what happened is
 * that the owner brought assets in, which is the definition of capital.
 *
 * A SHEET, AND IT FILLS THE SAME WAY EVERY OTHER STOCK SHEET IN THIS MODULE
 * DOES: a "+ Tambah produk" button opening ProductMultiPicker, several products
 * ticked at once, empty rows on the form afterwards. The opname sheet and the
 * transfer form already worked that way; a per-row dropdown here would have been
 * a third convention for one act, and it could only offer one product at a time
 * out of a list the browser had to hold entirely in memory. The picker searches
 * on the server and keeps ticks across searches.
 *
 * THE WAREHOUSE IS ASKED ONCE, not per line — an opening count is done by
 * walking a building, and a field repeated identically on sixty rows is sixty
 * chances to get one of them wrong.
 *
 * COST IS REQUIRED ON EVERY ROW, and unlike on the adjustment form the server
 * agrees. Without it the ledger values the arrival at the product's running
 * average, which for something that has never moved is zero — quantity on the
 * shelf, nothing in the asset, and every later sale of it booked at a cost of
 * nothing, silently and permanently.
 *
 * ELIGIBILITY IS THE SERVER'S ANSWER, NOT THIS SCREEN'S. A product qualifies
 * only if the ledger has never had anything to say about it — not merely if it
 * holds no stock, because something received and then sold out sits at zero
 * while being exactly the case that must be refused. The browser cannot know
 * that, so it does not pretend to: a sheet naming an ineligible product comes
 * back refused with their SKUs, which is the list of rows to remove.
 */

/** Today in the browser's timezone, as the `date` input wants it. */
function todayValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

interface DraftLine {
  productId: string;
  qty: string;
  costPerUnit: string;
  /**
   * THEIR code — the number printed on the carton. Ours is generated and unique
   * across the tenant, so the API refuses a client-supplied one and this form
   * never holds it.
   */
  supplierBatchCode: string;
  expiryDate: string;
  isConsignment: boolean;
}

export function OpeningStockForm() {
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
  /**
   * The products themselves, kept beside the lines: a line holds an id, and the
   * row next to it has to print a name, a unit, and decide whether to ask for a
   * batch. Same arrangement the transfer form uses, and for the same reason —
   * the picker searches the server, so what it returns is the only place these
   * fields are known.
   */
  const [productById, setProductById] = useState<Map<string, Product>>(
    new Map(),
  );
  const [picking, setPicking] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  /** Σ(qty × cost) — what this sheet will add to the inventory asset. */
  const totalValue = useMemo(() => {
    let total = 0n;
    for (const line of lines) {
      if (!isDecimal(line.qty) || !isDecimal(line.costPerUnit)) continue;
      const qty = toMinor(line.qty);
      const cost = toMinor(line.costPerUnit);
      if (qty === null || cost === null) continue;
      // Both sides are scaled by 10^4, so the product carries 10^8 and one
      // scale has to come back out.
      total += (qty * cost) / 10_000n;
    }
    return total;
  }, [lines]);

  /** Several at once, from the picker. */
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
        qty: "",
        costPerUnit: "",
        supplierBatchCode: "",
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
   * Every rule the form owns — one source for the messages and for whether the
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
    if (lines.length === 0) next.lines = "Tambahkan minimal satu produk.";

    lines.forEach((line, index) => {
      const at = `line.${line.productId}`;
      const product = productById.get(line.productId);

      if (line.qty.trim() === "") {
        next[`${at}.qty`] = "Isi jumlahnya.";
      } else if (!isDecimal(line.qty)) {
        next[`${at}.qty`] = "Gunakan angka, maksimal 4 desimal.";
      } else if (!isPositive(line.qty)) {
        // Nothing on hand is said by leaving the product off the sheet, not by
        // writing a movement that records that nothing happened.
        next[`${at}.qty`] =
          "Harus lebih dari nol — produk yang belum ada stoknya tidak perlu dimasukkan.";
      }

      if (line.costPerUnit.trim() === "") {
        next[`${at}.cost`] =
          "Wajib diisi: tanpa harga, stoknya masuk bernilai nol.";
      } else if (!isDecimal(line.costPerUnit)) {
        next[`${at}.cost`] = "Gunakan angka, maksimal 4 desimal.";
      } else if (!isPositive(line.costPerUnit)) {
        // The server refuses it too: this is one of the three paths that
        // ESTABLISH a product's average, and a zero taken here becomes it.
        next[`${at}.cost`] =
          "Harus lebih dari 0 — nol akan mengunci HPP produk ini di nol.";
      }

      // Asked while the counter is still at the shelf, rather than surfaced as
      // a 400 after they have walked away.
      if (product?.hasExpiry) {
        // Only the DATE is asked for. The lot's own code is derived from it by
        // the server, and the supplier's is optional — most cartons carry no
        // number, and demanding one is how lots end up named "1".
        if (line.expiryDate === "")
          next[`${at}.expiryDate`] = "Produk ini melacak kedaluwarsa.";
      }

      void index;
    });

    return next;
  }

  /** The first complaint, for the note under a disabled button. */
  const blocking = blockingReason(
    collectErrors(),
    (productId) => productById.get(productId)?.name,
  );

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
      const entry = await stockEntryService.createOpeningStock({
        warehouseId,
        branchId,
        entryDate,
        notes: notes.trim() || undefined,
        lines: lines.map((line) => {
          const product = productById.get(line.productId);
          return {
            productId: line.productId,
            qty: line.qty.trim(),
            costPerUnit: line.costPerUnit.trim(),
            ...(product?.hasExpiry
              ? {
                  // THEIRS only. Omitted rather than sent blank when nobody
                  // typed one: "" would claim a code was meant.
                  ...(line.supplierBatchCode.trim() !== ""
                    ? { supplierBatchCode: line.supplierBatchCode.trim() }
                    : {}),
                  expiryDate: line.expiryDate,
                }
              : {}),
            ...(line.isConsignment ? { isConsignment: true } : {}),
          };
        }),
      });

      swalToast(`${entry.entryNumber} tersimpan sebagai modal / saldo awal.`);
      // To the DOCUMENT, not to a list: the number is what the person now has
      // to quote, and the screen proving what was posted is its own.
      router.push(`/dashboard/inventory/opening-stock/${entry._id}`);
    } catch (error) {
      // The server's refusals here name the SKUs to take off the sheet, which
      // is the part that says what to do next. Shown verbatim — a paraphrase
      // would drop exactly that.
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
        <Spinner /> Memuat daftar gudang…
      </div>
    );
  }

  if (lookups.error) {
    return <Alert variant="error">{lookups.error}</Alert>;
  }

  return (
    <>
      {picking && (
        <OpeningStockAddProductsDialog
          warehouseId={warehouseId}
          existingProductIds={lines.map((line) => line.productId)}
          onAdd={addLines}
          onClose={() => setPicking(false)}
        />
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* The running total rides in the meta rather than only at the foot of
            the sheet: it is the number somebody sanity-checks before pressing
            the button, and the button is no longer next to it. The two lines
            explaining WHICH accounts it moves stay down there, beside the rows
            they are about. */}
        <FormActionBar
          title="Stok awal baru"
          meta={`No. [auto] · ${lines.length} produk · ${formatMoney(
            toDecimalString(totalValue),
          )}`}
          submitLabel="Simpan stok awal"
          submitting={saving}
          disabled={blocking !== null}
          blockedReason={blocking}
          cancelHref="/dashboard/inventory/opening-stock"
        />

        {formError && <Alert variant="error">{formError}</Alert>}

        {/* THE ONE PRECONDITION, stated before the first field rather than
            discovered as a refusal after the sheet is full. */}
        <div className="rounded-lg border border-secondary/40 bg-secondary/15 px-4 py-3 text-sm text-secondary-foreground">
          <b>Hanya untuk produk yang belum pernah punya stok sama sekali.</b>{" "}
          Barang yang sudah pernah masuk atau terjual — walau sekarang stoknya
          nol — dikoreksi lewat <b>Penyesuaian Stok</b>, bukan di sini. Yang
          dicatat halaman ini adalah barang yang sudah Anda miliki sebelum
          memakai Buloo, dan nilainya masuk sebagai <b>modal pemilik</b>, bukan
          sebagai kerugian.
        </div>

        <Card
          title="Keterangan dokumen"
          description="Satu dokumen untuk satu gudang, dengan nomornya sendiri. Barang yang sama di gudang lain diisi di dokumen terpisah."
        >
          <div className="flex flex-col gap-4">
            {/* KAPAN then DI MANA on the first row, Cabang below as secondary
                classification — §16, the same order every transaction module
                opens with. */}
            <div className="grid gap-4 sm:grid-cols-2">
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
                hint="Tanggal stok itu dihitung, bukan tanggal dokumen dibuat."
                disabled={saving}
                required
              />

              <div>
                {/* The filter shell, like every other warehouse picker in the
                    module. `active={false}` because this is not a filter —
                    nothing is narrowed by naming a warehouse, the document
                    simply has one. */}
                <FilterSelect
                  layout="form"
                  label="Gudang"
                  ariaLabel="Gudang"
                  value={warehouseId}
                  options={namedOptions(scopedWarehouses)}
                  active={false}
                  required
                  error={fieldErrors.warehouseId}
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
                    // The rows were chosen against the OLD warehouse's
                    // eligibility, and "never moved here" is a different answer
                    // per location — keeping them would leave the document
                    // holding products the picker would not have offered for
                    // this one. Cheap in practice: the picker cannot be opened
                    // until a warehouse is named.
                    setLines([]);
                    setProductById(new Map());
                    setFieldErrors({});
                  }}
                />
                {lines.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted">
                    Mengganti gudang akan mengosongkan daftar produk di bawah —
                    barang yang boleh diisi berbeda per gudang.
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
                error={fieldErrors.branchId}
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
            </div>

            {/* Keterangan closes the header, always — §16. Optional here, unlike
                an adjustment: an opening balance explains itself. */}
            <TextareaField
              label="Keterangan"
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              hint="Opsional — mis. dari mana angkanya, atau siapa yang menghitung."
              maxLength={500}
              disabled={saving}
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
          /* The lot columns lost the sentence that used to sit in their own
             row, so it says it once here instead of on every expiry-tracked
             line: the date is what is required, the code fills itself in. */
          description="Harga beli per unit wajib diisi — angka itulah yang jadi dasar HPP dan nilai persediaan. Produk yang melacak kedaluwarsa wajib punya tanggal kadaluarsa; kode batch boleh kosong dan dibuat otomatis."
        >
          {/**
           * THE BUTTON FOLLOWS THE LIST, above it while it is empty and below
           * it once it is not — the same arrangement the transfer form and the
           * opname sheet use. On an empty card it is the only thing to do, so
           * it goes where the eye lands first; once rows exist the list grows
           * downwards, so the place a reader ends is the place the next row
           * comes from.
           */}
          {lines.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              {/* THE WAREHOUSE COMES FIRST, and the button says so rather than
                  opening a picker that cannot answer yet: the list is "products
                  that have never moved HERE", so without a warehouse there is no
                  question to ask. The precondition is stated on the control,
                  never left to be inferred from a disabled one. */}
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
                    ? "Pilih gudangnya dulu — daftar produk yang bisa diisi berbeda per gudang."
                    : "Cari dan centang beberapa produk sekaligus — semuanya tersimpan sebagai satu pencatatan stok awal."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* ui/table rather than a hand-rolled <table>: docs/ui-rules.md
                  §10. The opname sheet and the transfer form still write their
                  own — both are on the migration list, and matching them here
                  would have made it three. */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-center">Titipan</TableHead>
                      {/* The two the document cannot be saved without, marked
                          the way every other required field in the app is —
                          the column header IS their label, so the `*` goes
                          here rather than on each of the inputs below it. */}
                      <TableHead className="text-right">
                        Jumlah
                        <span className="text-danger"> *</span>
                      </TableHead>
                      <TableHead className="text-right">
                        Harga beli / unit
                        <span className="text-danger"> *</span>
                      </TableHead>
                      {/* THE LOT, AS TWO COLUMNS rather than a row of its own.
                          A batch belongs to the line that creates it, and a
                          spanning row underneath read as a second product. The
                          receipt form's table is laid out the same way, and the
                          columns are empty — an em dash — on the rows whose
                          product does not track expiry. */}
                      <TableHead>Kode batch internal</TableHead>
                      <TableHead>Kode batch supplier</TableHead>
                      <TableHead>
                        Kadaluarsa
                        {/* The column carries the mark, not the cell: a date
                            input holds no placeholder, so an empty one looks
                            finished and needs saying somewhere. Hidden from
                            screen readers, which hear `aria-invalid` and the
                            message below the row instead of a bare star. */}
                        <span aria-hidden className="text-danger">
                          {" "}
                          *
                        </span>
                      </TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => {
                      const at = `line.${line.productId}`;
                      const product = productById.get(line.productId);
                      return (
                        // Keyed on the product, not the index: a product appears
                        // at most once, and removing a middle row under an index
                        // key would leave React reusing the wrong row's input.
                        <Fragment key={line.productId}>
                          <TableRow>
                            <TableCell>
                              <p className="font-medium text-foreground">
                                {product?.name ?? "Produk"}
                              </p>
                              <p className="text-xs tabular-nums text-muted">
                                {product?.sku}
                                {product?.unit && ` · ${product.unit}`}
                              </p>
                            </TableCell>

                            <TableCell className="text-center">
                              <Checkbox
                                aria-label={`Barang titipan — ${product?.name ?? "produk"}`}
                                checked={line.isConsignment}
                                onCheckedChange={(checked) =>
                                  patchLine(index, {
                                    isConsignment: checked === true,
                                  })
                                }
                                disabled={saving}
                              />
                            </TableCell>

                            <TableCell className="text-right">
                              <Input
                                aria-label={`Jumlah ${product?.name ?? ""}`}
                                inputMode="decimal"
                                value={line.qty}
                                onChange={(event) =>
                                  patchLine(index, { qty: event.target.value })
                                }
                                placeholder="0"
                                className="ml-auto w-28 text-right tabular-nums"
                                aria-invalid={Boolean(fieldErrors[`${at}.qty`])}
                                disabled={saving}
                              />
                            </TableCell>

                            <TableCell className="text-right">
                              <Input
                                aria-label={`Harga beli per unit ${product?.name ?? ""}`}
                                inputMode="decimal"
                                value={line.costPerUnit}
                                onChange={(event) =>
                                  patchLine(index, {
                                    costPerUnit: event.target.value,
                                  })
                                }
                                placeholder="0"
                                className="ml-auto w-36 text-right tabular-nums"
                                aria-invalid={Boolean(
                                  fieldErrors[`${at}.cost`],
                                )}
                                disabled={saving}
                              />
                            </TableCell>

                            {/* OURS — never typed, always shown. This screen has
                                no preview endpoint, so it can only show the
                                derived hint: the real code, suffix and all, is
                                settled when the document is saved. */}
                            <TableCell>
                              {product?.hasExpiry ? (
                                <InternalBatchCodeDisplay
                                  code={null}
                                  hint={
                                    line.expiryDate
                                      ? batchCodeHint(
                                          product.sku,
                                          line.expiryDate,
                                          "",
                                        )
                                      : undefined
                                  }
                                  productName={product.name}
                                  className="max-w-40 text-xs"
                                />
                              ) : (
                                <span className="text-xs text-muted">—</span>
                              )}
                            </TableCell>

                            {/* THEIRS — typed, optional. Most cartons carry no
                                number; the ones that do are what a recall is
                                traced by. */}
                            <TableCell>
                              {product?.hasExpiry ? (
                                <SupplierBatchCodeInput
                                  value={line.supplierBatchCode}
                                  onChange={(value) =>
                                    patchLine(index, {
                                      supplierBatchCode: value,
                                    })
                                  }
                                  productName={product.name}
                                  disabled={saving}
                                  className="w-40 text-xs"
                                />
                              ) : (
                                <span className="text-xs text-muted">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              {product?.hasExpiry ? (
                                <Input
                                  aria-label={`Tanggal kedaluwarsa ${product.name}`}
                                  type="date"
                                  value={line.expiryDate}
                                  onChange={(event) =>
                                    patchLine(index, {
                                      expiryDate: event.target.value,
                                    })
                                  }
                                  className="w-40 text-xs"
                                  aria-invalid={Boolean(
                                    fieldErrors[`${at}.expiryDate`],
                                  )}
                                  disabled={saving}
                                />
                              ) : (
                                <span className="text-xs text-muted">—</span>
                              )}
                            </TableCell>

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

                          {/* THE ROW'S COMPLAINTS, under the row they belong to
                              rather than beside the inputs: the cells are narrow
                              and a message wrapped inside one would push the
                              whole table wider than the screen. §1 forbids the
                              red border being the only signal. */}
                          {(fieldErrors[`${at}.qty`] ||
                            fieldErrors[`${at}.cost`] ||
                            fieldErrors[`${at}.expiryDate`]) && (
                            <TableRow>
                              <TableCell colSpan={7} className="pt-0">
                                <p role="alert" className="text-xs text-danger">
                                  {fieldErrors[`${at}.qty`] ??
                                    fieldErrors[`${at}.cost`] ??
                                    fieldErrors[`${at}.expiryDate`]}
                                </p>
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
                {/* Sized to its label, left-aligned, like the same button under
                    the transfer form's and the opname sheet's tables. */}
                <UIButton
                  type="button"
                  variant="secondary"
                  onClick={() => setPicking(true)}
                  disabled={saving}
                >
                  + Tambah produk
                </UIButton>
              </div>

              {/* What this sheet will add to the inventory asset, and to
                  capital — the two halves of the entry it is about to write.
                  Shown because it is the number somebody sanity-checks before
                  pressing the button. */}
              <div className="rounded-lg bg-accent/60 px-4 py-3">
                <Label className="mb-1 block">Total nilai stok awal</Label>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {formatMoney(toDecimalString(totalValue))}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Sejumlah ini akan menambah <b>Persediaan</b> dan{" "}
                  <b>Modal / Saldo Awal</b>. Laba rugi tidak tersentuh.
                </p>
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
          <p className="text-xs text-muted">
            Kartu stok bersifat <b>append-only</b>. Baris yang tertulis di sini
            tidak bisa dihapus atau diedit — salah angka dikoreksi dengan
            penyesuaian stok, dan keduanya tetap terlihat.
          </p>
        </div>
      </form>
    </>
  );
}
