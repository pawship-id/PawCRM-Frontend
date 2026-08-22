"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, Spinner, TextField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button as UIButton } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { autoBatchCode } from "@/lib/batchCode";
import { ApiError } from "@/services/api-error";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import {
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  multiplyDecimals,
  sumDecimals,
} from "@/utils/decimal";
import type { CreateGoodsReceiptInput, PurchaseType } from "@/types/api";
import type { Product } from "@/types/inventory";
import { HppStrip } from "@/features/inventory/components/HppStrip";
import { JournalPreview } from "@/features/inventory/components/JournalPreview";
import { useStockCardLookups } from "@/features/inventory/hooks/useStockCardLookups";

import { ReceiptAddProductsDialog } from "./ReceiptAddProductsDialog";
import { useReceiptPreview } from "../hooks/useReceiptPreview";
import { useSupplierOptions } from "../hooks/useSupplierOptions";

interface LineDraft {
  productId: string;
  qty: string;
  costPerUnit: string;
  batchCode: string;
  expiryDate: string;
}

/** Today, as an `<input type="date">` holds it. Also the API's default. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whether a line gets its own lot, and therefore carries a batch code.
 *
 * True when the goods expire — the promise `hasExpiry` makes — or whenever the
 * delivery is consigned, because consignment stock always gets its own lot: its
 * cost was entered by hand rather than derived from a purchase.
 *
 * The code itself is no longer the clerk's problem — see `autoBatchCode`. What
 * IS still theirs is the expiry date, which nothing can derive.
 *
 * MODULE-LEVEL, taking `consignment` as an argument rather than closing over it.
 * Defined inside the component it would be a new function every render, and the
 * payload memo that calls it would either rebuild on every keystroke or lie about
 * its dependencies.
 */
function needsLot(product: Product | undefined, consignment: boolean): boolean {
  return Boolean(product?.hasExpiry) || consignment;
}

/**
 * The mark a required COLUMN carries, since a column header is the only place a
 * table can say "wajib" once for every row.
 *
 * `danger-ink` (6.37:1) rather than `danger`: a lone asterisk has no word beside
 * it to carry the meaning, so it has to clear the contrast floor on its own —
 * see ui-rules §13. Hidden from screen readers, which get `aria-required` off
 * each input and would otherwise hear a bare star per row.
 */
function Required() {
  return (
    <span aria-hidden className="text-xs font-bold text-danger-ink">
      {" "}
      *
    </span>
  );
}

/**
 * What to say when one product is on two rows.
 *
 * NAMES THE PRODUCT AND THE WAY OUT. The API's own refusal identifies it by
 * ObjectId, which tells a clerk nothing about which of their rows to touch — and
 * the fix is not obvious either, because two lines for one product is exactly how
 * somebody records "twenty at one price, ten at another".
 *
 * That case IS real, and the answer is TWO RECEIPTS: the delivery physically was
 * two purchases at two prices, and one line per product is what lets a purchase
 * return say which of them it is reversing.
 */
function duplicateMessage(name: string | undefined): string {
  return `${name ?? "Produk ini"} muncul di dua baris. Gabungkan menjadi satu baris — atau, kalau harga belinya memang berbeda, catat sebagai dua penerimaan terpisah.`;
}

/**
 * Record goods arriving from a supplier.
 *
 * THIS FORM IS WHERE HPP IS BORN. Every other screen reads the weighted average;
 * this is the one that moves it. That is why the calculation is shown per product
 * as arithmetic rather than as a result — the shop owner holding the supplier's
 * invoice can check the new average against the price on the paper in their hand,
 * which is the only moment anybody ever can.
 *
 * THE NUMBERS ARE FETCHED, NOT COMPUTED. This form used to run its own sequential
 * weighted-average simulation across the lines, reimplemented from the service.
 * That is gone. `POST /goods-receipts/preview` is the posting path with the
 * commit left off, so the lots, the average and the journal shown here are the
 * ones that will actually be written. A reimplementation does not fail loudly
 * when the server changes its mind — it renders a confident wrong number that the
 * user approves, and here that number is permanent.
 *
 * BELI PUTUS vs KONSINYASI changes what the form even means. Outright, the goods
 * become the tenant's, the ledger is posted and `2101 Utang Supplier` is
 * credited. Consigned, they sit in the warehouse still belonging to the supplier
 * — stock rises, but nothing is owed and nothing is journalled, because nothing
 * has been bought. `taxAmount` is not merely hidden for consignment, it is
 * omitted from the payload: the API REFUSES the field there rather than ignoring
 * it, on the grounds that a clerk who typed one has misunderstood which kind of
 * delivery they are recording.
 *
 * WHAT THE SERVER REFUSES IS NOT DUPLICATED IN `validate`. A supplier whose terms
 * do not permit this purchase type, an inactive warehouse, a product that holds
 * no stock, a batch code already used — those come back as a 400 and are surfaced
 * verbatim, naming every offending SKU at once so a forty-line delivery is fixed
 * in one pass. Only the rules a user can fix without a round trip are checked
 * locally.
 *
 * SUBMITTING TWICE CREATES TWO DELIVERIES. `POST /goods-receipts` is not
 * idempotent and has no `idempotencyKey` to send — a receipt IS the upstream
 * document, so a retried submit is indistinguishable from a second van arriving
 * with the same goods. The button is therefore locked for the whole flight and
 * the handler refuses re-entry; the preview panel is the other half of the
 * mitigation.
 */
export function ReceiptForm({ supplierId }: { supplierId?: string }) {
  const router = useRouter();

  const { suppliers, loading: suppliersLoading } =
    useSupplierOptions(supplierId);
  const lookups = useStockCardLookups();

  const [supplier, setSupplier] = useState(supplierId ?? "");
  const [warehouseId, setWarehouseId] = useState("");
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("beli_putus");
  const [receiptDate, setReceiptDate] = useState(today);
  const [taxAmount, setTaxAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  /**
   * The products the rows are ABOUT, kept here rather than looked up in a
   * catalogue held in memory.
   *
   * The picker searches on the server and hands back whole products, so this
   * grows one pick at a time and never needs the other five thousand. Nothing is
   * ever removed from it: a row deleted and its product picked again would
   * otherwise re-fetch what is already known, and a stale entry costs a few
   * bytes and nothing else.
   */
  const [productById, setProductById] = useState<Map<string, Product>>(
    new Map(),
  );
  const [picking, setPicking] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const consignment = purchaseType === "konsinyasi";

  /**
   * ACTIVE warehouses only, unlike the stock card. This form WRITES, and the API
   * refuses a delivery at an inactive location — offering one would produce a
   * rejection after the user had filled the whole form.
   */
  const writableWarehouses = useMemo(
    () => lookups.warehouses.filter((warehouse) => warehouse.isActive),
    [lookups.warehouses],
  );

  /**
   * THE CATALOGUE IS NO LONGER HELD HERE. It used to be `lookups.products`,
   * filtered to the active ones and poured into a per-row `<Select>`; the picker
   * dialog now asks the SERVER for the matches to one search — active products
   * that hold stock, which is exactly what a receipt line may name — so a tenant
   * with five thousand SKUs pays for the fifty they looked at. `lookups` stays
   * for the warehouses, which are a short list nobody searches.
   */

  // The first warehouse becomes the default once the list arrives. Kept out of an
  // effect: a value derived from props/state does not need to round-trip through
  // one, and `warehouseId` staying "" until then is a legitimate intermediate.
  const effectiveWarehouseId =
    warehouseId || (writableWarehouses[0]?._id ?? "");

  /**
   * The payload, built once and used for BOTH the preview and the save.
   *
   * Identical on purpose: a preview of a DIFFERENT request is worse than no
   * preview, and this is the only place the two could diverge.
   */
  const payload = useMemo<CreateGoodsReceiptInput>(() => {
    const trimmedTax = taxAmount.trim();

    return {
      supplierId: supplier,
      warehouseId: effectiveWarehouseId,
      receiptDate,
      purchaseType,
      // Omitted entirely on consignment — the API forbids the key, it does not
      // ignore it. Omitted when blank so an untouched field is not "0".
      ...(consignment || trimmedTax === "" ? {} : { taxAmount: trimmedTax }),
      ...(notes.trim() === "" ? {} : { notes: notes.trim() }),
      items: lines.map((line) => {
        const product = productById.get(line.productId);
        return {
          productId: line.productId,
          qty: line.qty.trim(),
          costPerUnit: line.costPerUnit.trim(),
          // Filled in for the clerk when they left it blank. Done HERE rather
          // than in the field itself so the row keeps showing what the supplier
          // actually printed — nothing — while the preview and the save both
          // carry the code that will really be written.
          ...(needsLot(product, consignment)
            ? {
                batchCode:
                  line.batchCode.trim() ||
                  autoBatchCode(product?.sku, line.expiryDate, receiptDate),
              }
            : {}),
          ...(needsLot(product, consignment) && line.expiryDate !== ""
            ? { expiryDate: line.expiryDate }
            : {}),
        };
      }),
    };
    // `needsLot` closes over `consignment`, which `purchaseType` already covers.
  }, [
    supplier,
    effectiveWarehouseId,
    receiptDate,
    purchaseType,
    consignment,
    taxAmount,
    notes,
    lines,
    productById,
  ]);

  /**
   * The product on two rows at once, if there is one.
   *
   * THE API REFUSES THIS, and its message names the offending product by
   * ObjectId — correct for a machine, useless to a clerk staring at two rows that
   * look perfectly reasonable side by side. Detected here so the form can say
   * WHICH product, by name, before the request is sent.
   *
   * The picker below already excludes what is on the form, so this is reachable
   * only by a line whose product was removed from the catalogue mid-edit. It
   * stays because "unreachable" and "unreachable today" are different claims, and
   * the failure mode is a raw id in a red box.
   */
  const duplicateProductId = useMemo(() => {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.productId)) return line.productId;
      seen.add(line.productId);
    }
    return null;
  }, [lines]);

  /**
   * The gate on asking the server. The endpoint refuses exactly what the create
   * refuses, so asking it about a half-typed line would paint the panel red while
   * the user is still working. Everything checked here is something the user can
   * see and fix in the form; the server has the final word on the rest.
   */
  const previewEnabled =
    Boolean(supplier) &&
    Boolean(effectiveWarehouseId) &&
    lines.length > 0 &&
    // Asking about a payload we KNOW will be refused buys nothing but a red
    // panel quoting an ObjectId.
    duplicateProductId === null &&
    lines.every((line) => {
      const product = productById.get(line.productId);
      if (!isPositive(line.qty)) return false;
      if (!isDecimal(line.costPerUnit)) return false;
      // No batch-code gate: a blank one is filled by `autoBatchCode`. The
      // expiry date is not derivable and still blocks the preview.
      if (product?.hasExpiry && line.expiryDate === "") return false;
      return true;
    }) &&
    (consignment || taxAmount.trim() === "" || isDecimal(taxAmount.trim()));

  const {
    preview,
    loading: previewLoading,
    error: previewError,
  } = useReceiptPreview(payload, previewEnabled);

  /** Line subtotals are plain multiplication — no server rule is involved. */
  const localSubtotal = sumDecimals(
    lines.map((line) =>
      isDecimal(line.qty) && isDecimal(line.costPerUnit)
        ? multiplyDecimals(line.qty, line.costPerUnit)
        : "0",
    ),
  );

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  /**
   * SEVERAL AT ONCE, because a van carries several. The old picker added one row
   * per trip through a dropdown; the dialog hands back everything that was
   * ticked, across however many searches it took to find them.
   */
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
        qty: "1",
        // Seeded with the current average so a re-order at the same price is one
        // keystroke, and a price CHANGE is visible as a change.
        costPerUnit: product.hppAvg ?? "",
        batchCode: "",
        expiryDate: "",
      })),
    ]);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!supplier) next.supplier = "Pilih supplier.";
    if (!effectiveWarehouseId) next.warehouse = "Pilih gudang tujuan.";
    if (lines.length === 0) next.lines = "Tambahkan minimal satu barang.";

    if (duplicateProductId !== null) {
      next.lines = duplicateMessage(productById.get(duplicateProductId)?.name);
    }

    if (!next.lines) {
      for (const [index, line] of lines.entries()) {
        const product = productById.get(line.productId);
        const label = product?.name ?? `Baris ${index + 1}`;

        if (!isPositive(line.qty)) {
          next.lines = `${label}: qty harus lebih dari nol.`;
          break;
        }
        if (!isDecimal(line.costPerUnit)) {
          next.lines = consignment
            ? `${label}: HPP manual wajib diisi untuk barang konsinyasi.`
            : `${label}: harga beli wajib diisi.`;
          break;
        }
        // Kode batch is NOT checked: blank means "supplier tidak memberi nomor",
        // and the payload derives one. The expiry date has no such fallback —
        // it is the thing the code is derived FROM, and FEFO is wrong without it.
        if (product?.hasExpiry && line.expiryDate === "") {
          next.lines = `${label}: tanggal kedaluwarsa wajib diisi.`;
          break;
        }
      }
    }

    if (
      !consignment &&
      taxAmount.trim() !== "" &&
      !isDecimal(taxAmount.trim())
    ) {
      next.taxAmount = "Gunakan angka, maksimal 4 desimal.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Re-entry guard. `disabled` on the button covers the pointer; this covers
    // a second submit event from the keyboard while the first is still in
    // flight — which, without an idempotency key, would be a second delivery.
    if (saving) return;

    setFormError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      const receipt = await goodsReceiptService.create(payload);

      swalToast(
        consignment
          ? `${receipt.receiptNumber} tersimpan — stok naik, belum ada utang.`
          : `${receipt.receiptNumber} tersimpan — HPP dan utang diperbarui.`,
      );
      // `replace`, not `push`: the create form must not be reachable by going
      // back, because going back to it and submitting again receives the goods
      // a second time.
      router.replace(`/dashboard/purchasing/receipts/${receipt._id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.fullMessage);
        setFieldErrors(error.fieldErrors);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  return (
    <>
      {picking && (
        <ReceiptAddProductsDialog
          existingProductIds={lines.map((line) => line.productId)}
          onAdd={addLines}
          onClose={() => setPicking(false)}
        />
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {formError && <Alert variant="error">{formError}</Alert>}
        {lookups.error && <Alert variant="error">{lookups.error}</Alert>}

        <div>
          <div className="inline-flex rounded-lg bg-accent p-1">
            {(
              [
                ["beli_putus", "Beli putus"],
                ["konsinyasi", "Konsinyasi (titipan)"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPurchaseType(value)}
                className={cn(
                  "rounded-md px-3.5 py-2 text-sm font-medium transition",
                  purchaseType === value
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {consignment
              ? "Barang masuk gudang tapi masih milik supplier — tidak ada utang dan tidak ada jurnal. HPP diisi manual, dan setiap baris punya lot sendiri — kode batch terisi otomatis kalau dikosongkan."
              : "Barang jadi milik toko saat diterima — utang ke supplier langsung tercatat dan jurnal diposting."}
          </p>
        </div>

        <Card title="Dokumen">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier">Supplier</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger id="supplier" aria-label="Supplier">
                  <SelectValue
                    placeholder={
                      suppliersLoading ? "Memuat supplier…" : "Pilih supplier…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((item) => (
                    <SelectItem key={item._id} value={item._id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.supplier && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.supplier}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warehouse">Masuk ke gudang</Label>
              <Select value={effectiveWarehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="warehouse" aria-label="Masuk ke gudang">
                  <SelectValue placeholder="Pilih gudang…" />
                </SelectTrigger>
                <SelectContent>
                  {writableWarehouses.map((warehouse) => (
                    <SelectItem key={warehouse._id} value={warehouse._id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.warehouse && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.warehouse}
                </p>
              )}
            </div>

            <TextField
              label="Tanggal terima"
              name="receiptDate"
              type="date"
              value={receiptDate}
              onChange={(event) => setReceiptDate(event.target.value)}
              hint="Tanggal barang tiba, bukan tanggal input."
            />

            {/* PPN belongs to a purchase. There is none on a consignment, and the
                API refuses the field there outright. */}
            {!consignment && (
              <TextField
                label="PPN masukan"
                name="taxAmount"
                inputMode="decimal"
                value={taxAmount}
                onChange={(event) => setTaxAmount(event.target.value)}
                error={fieldErrors.taxAmount}
                hint="Masuk ke akun 1301, bukan ke nilai persediaan."
                placeholder="0"
              />
            )}
          </div>
        </Card>

        <Card
          title={
            <span className="flex flex-wrap items-center gap-2">
              Barang diterima
              {lines.length > 0 && (
                <Badge variant="outline">{lines.length} baris</Badge>
              )}
            </span>
          }
        >
          {/**
           * THE BUTTON FOLLOWS THE LIST, above it while it is empty and below it
           * once it is not — the same arrangement the transfer form, the opname
           * sheet, the opening stock document and the adjustment use. On an empty
           * card it is the only thing to do, so it goes where the eye lands first;
           * once rows exist the list grows downwards, so the place a reader ends
           * is the place the next row comes from.
           */}
          {lines.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <UIButton
                type="button"
                variant="secondary"
                onClick={() => setPicking(true)}
              >
                + Tambah produk
              </UIButton>

              <div>
                <p className="font-medium text-foreground">Belum ada barang</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  Cari dan centang beberapa produk sekaligus — semuanya tercatat
                  sebagai satu penerimaan dari supplier ini.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                      <th className="px-2 py-2 text-left font-medium">Produk</th>
                      {/* LEFT, not right, though both columns hold numbers.
                          What sits under them is an INPUT BOX of a fixed width,
                          not a figure — the box starts at the left edge of the
                          cell, so a right-aligned label floats away from the
                          control it names. Subtotal keeps `text-right`, because
                          that column really is a number. */}
                      <th className="px-2 py-2 text-left font-medium">Qty</th>
                      {/* MARKED WAJIB, both ways round. On beli putus the
                          figure is on the supplier's invoice; on konsinyasi
                          nobody bought anything, so the agreed value can only
                          come from the person typing. Neither can be derived
                          from the running average — a receipt that fell back to
                          it could never move HPP, which is the one thing this
                          form exists to do. The seed makes a re-order at the
                          same price one click; it does not make the field
                          optional. */}
                      <th className="px-2 py-2 text-left font-medium">
                        {consignment ? "HPP manual" : "Harga beli"}
                        <Required />
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        Kode batch
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        {/* The column, not the cell, carries the mark: a date
                            input cannot hold a placeholder, so an empty one
                            looks finished and needs saying somewhere. */}
                        Expired
                        <Required />
                      </th>
                      <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const product = productById.get(line.productId);
                      const lotTracked = needsLot(product, consignment);
                      const expiryRequired = Boolean(product?.hasExpiry);
                      // Shown as the batch field's placeholder, so the clerk can see
                      // the code they are about to accept rather than discovering it
                      // on the receipt afterwards. Withheld until the expiry date is
                      // in, because until then it would be derived from the wrong
                      // date and change under them the moment they type one.
                      const autoCode =
                        expiryRequired && line.expiryDate === ""
                          ? null
                          : autoBatchCode(
                              product?.sku,
                              line.expiryDate,
                              receiptDate,
                            );

                      return (
                        <tr
                          key={`${line.productId}-${index}`}
                          className="border-b border-border/60"
                        >
                          <td className="px-2 py-2">
                            <p className="font-medium">{product?.name ?? "—"}</p>
                            <p className="tabular-nums text-xs text-muted">
                              {product?.sku}
                              {product?.unit && ` · ${product.unit}`}
                            </p>
                          </td>

                          <td className="px-2 py-2">
                            <Input
                              aria-label={`Qty ${product?.name ?? ""}`}
                              inputMode="decimal"
                              value={line.qty}
                              onChange={(event) =>
                                updateLine(index, { qty: event.target.value })
                              }
                              className="max-w-20 text-right tabular-nums"
                            />
                          </td>

                          <td className="px-2 py-2">
                            <Input
                              aria-label={`Harga ${product?.name ?? ""}`}
                              inputMode="decimal"
                              required
                              aria-required
                              value={line.costPerUnit}
                              onChange={(event) =>
                                updateLine(index, {
                                  costPerUnit: event.target.value,
                                })
                              }
                              className="max-w-28 text-right tabular-nums"
                            />
                          </td>

                          <td className="px-2 py-2">
                            {lotTracked ? (
                              <Input
                                aria-label={`Kode batch ${product?.name ?? ""}`}
                                value={line.batchCode}
                                onChange={(event) =>
                                  updateLine(index, {
                                    batchCode: event.target.value,
                                  })
                                }
                                // "opsional" rather than the code itself. The
                                // placeholder used to preview what would be
                                // generated, which read as a value already in
                                // the box — and the one thing a clerk needs to
                                // know here is that leaving it empty is fine.
                                // The code is still on the tooltip.
                                placeholder="opsional"
                                title={
                                  autoCode
                                    ? `Kosongkan untuk memakai ${autoCode}`
                                    : "Kosongkan untuk kode otomatis dari SKU dan tanggal expired"
                                }
                                className="max-w-40 tabular-nums text-xs"
                              />
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>

                          <td className="px-2 py-2">
                            {expiryRequired ? (
                              <Input
                                aria-label={`Expired ${product?.name ?? ""}`}
                                type="date"
                                required
                                aria-required
                                value={line.expiryDate}
                                onChange={(event) =>
                                  updateLine(index, {
                                    expiryDate: event.target.value,
                                  })
                                }
                                // No red border while it is merely empty: a row
                                // that has just been added has not been got
                                // wrong yet. The asterisk on the column header
                                // says it is required, the note under the table
                                // says why, and `validate` names the row by
                                // product if a save is attempted without it.
                                className="max-w-36 text-xs"
                              />
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>

                          <td className="px-2 py-2 text-right tabular-nums text-xs">
                            {isDecimal(line.qty) && isDecimal(line.costPerUnit)
                              ? formatMoney(
                                  multiplyDecimals(line.qty, line.costPerUnit),
                                )
                              : "—"}
                          </td>

                          <td className="px-2 py-2 text-right">
                            <UIButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-danger"
                              onClick={() =>
                                setLines((prev) =>
                                  prev.filter((_, i) => i !== index),
                                )
                              }
                            >
                              Hapus
                            </UIButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Sized to its label, left-aligned, like the same button under the
                  transfer form's, the opname sheet's and the opening stock
                  document's tables. */}
              <div className="mt-4 border-t border-border/60 pt-3">
                <UIButton
                  type="button"
                  variant="secondary"
                  onClick={() => setPicking(true)}
                  disabled={saving}
                >
                  + Tambah produk
                </UIButton>
              </div>
            </>
          )}

          {/* Says the rule ONCE, above the row-level marks, because the two fields
              changed places: the code used to be mandatory and the date easy to
              miss, and a clerk who learned the old form would otherwise read the
              empty batch box as the thing blocking them. */}
          {lines.some((line) =>
            needsLot(productById.get(line.productId), consignment),
          ) && (
            <p className="mt-3 text-xs text-muted">
              Produk berkedaluwarsa <b>wajib</b> punya tanggal expired — FEFO
              menjual lot terdekat lebih dulu, dan tanpa tanggal urutannya tidak
              ada. <b>Kode batch boleh kosong</b>: kalau supplier tidak mencetak
              nomor lot, sistem memakai{" "}
              <span className="tabular-nums">SKU:tanggal-expired</span>.
            </p>
          )}

          {/* A duplicate is reported the moment it exists, not on submit: it blocks
              the preview too, so waiting for a save attempt would leave the panels
              silently empty with nothing on screen explaining why. */}
          {duplicateProductId !== null ? (
            <p role="alert" className="mt-3 text-xs text-danger">
              {duplicateMessage(productById.get(duplicateProductId)?.name)}
            </p>
          ) : (
            fieldErrors.lines && (
              <p role="alert" className="mt-3 text-xs text-danger">
                {fieldErrors.lines}
              </p>
            )
          )}
        </Card>

        {/* --------------------------------------------------- what will happen */}
        {previewError && <Alert variant="error">{previewError}</Alert>}

        {previewEnabled && previewLoading && !preview && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Menghitung dampak penerimaan…
          </div>
        )}

        {preview && (
          <>
            <div className="flex flex-col gap-3">
              <p className="text-[10px] font-medium tracking-widest text-primary-hover uppercase">
                Perhitungan HPP rata-rata tertimbang
              </p>
              {preview.hppAvg.map((row) => (
                <div key={row.productId}>
                  <p className="mb-1 text-xs font-medium">
                    {productById.get(row.productId)?.name ?? row.productId}
                  </p>
                  <HppStrip preview={row} />
                </div>
              ))}
              <p className="text-xs text-muted">
                Angka inilah yang dipakai setiap penjualan berikutnya untuk
                menghitung HPP dan margin. Cocokkan dengan faktur supplier di
                tangan — setelah disimpan, tidak bisa diubah.
              </p>
            </div>

            {preview.movements.some((movement) => movement.isNewBatch) && (
              <Card title="Lot yang akan dibuat">
                <ul className="flex flex-col gap-1 text-sm">
                  {preview.movements
                    .filter((movement) => movement.isNewBatch)
                    .map((movement, index) => (
                      <li key={index} className="flex flex-wrap gap-2">
                        <span className="font-medium">
                          {productById.get(movement.productId)?.name ??
                            movement.productId}
                        </span>
                        <span className="tabular-nums text-xs text-muted">
                          {movement.batchCode ?? "—"}
                          {movement.batchExpiryDate &&
                            ` · exp ${movement.batchExpiryDate.slice(0, 10)}`}
                        </span>
                        <span className="ml-auto tabular-nums text-xs">
                          {formatQty(movement.qty)}
                        </span>
                      </li>
                    ))}
                </ul>
              </Card>
            )}
          </>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          {/* The preview labels its own accounts now — see ReceiptJournalLine.
              This used to go through a shim that guessed them and got it wrong. */}
          <JournalPreview
            lines={preview?.journal ?? []}
            emptyReason={
              consignment
                ? "Konsinyasi tidak menjurnal — barang belum menjadi milik toko, jadi belum ada utang yang tercatat."
                : "Lengkapi barang yang diterima untuk melihat jurnal yang akan dibuat."
            }
          />

          <Card title="Ringkasan">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <b className="tabular-nums">
                  {formatMoney(preview?.total ?? localSubtotal)}
                </b>
              </div>
              {!consignment && (
                <div className="flex justify-between">
                  <span className="text-muted">PPN</span>
                  <b className="tabular-nums">
                    {formatMoney(
                      preview?.taxAmount ??
                        (isDecimal(taxAmount.trim()) ? taxAmount.trim() : "0"),
                    )}
                  </b>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-2">
                <b>Total</b>
                <b className="tabular-nums text-base">
                  {formatMoney(preview?.grandTotal ?? localSubtotal)}
                </b>
              </div>
              {preview ? (
                <p className="mt-1 text-xs text-muted">
                  Nomor sementara{" "}
                  <span className="tabular-nums">{preview.receiptNumber}</span> —
                  masih bisa berubah kalau ada penerimaan lain lebih dulu.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Angka sementara, dihitung di browser. Yang mengikat adalah hasil
                  dari server setelah semua baris lengkap.
                </p>
              )}
              {consignment && (
                <p className="text-xs text-muted">
                  Nilai titipan — belum menjadi utang.
                </p>
              )}
            </div>
          </Card>
        </div>

        <TextField
          label="Catatan"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="opsional"
          className="max-w-xl"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving || lines.length === 0}>
            {saving ? "Menyimpan…" : "Simpan & terima barang"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => router.push("/dashboard/purchasing/receipts")}
          >
            Batal
          </Button>
          <p className="text-xs text-muted">
            Sekali disimpan, penerimaan tidak bisa diedit atau dihapus.
          </p>
          </div>
      </form>
    </>
  );
}
