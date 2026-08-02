"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, TextField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { formatMoney, isDecimal, isPositive, multiplyDecimals, sumDecimals, toMinor } from "@/utils/decimal";
import type {
  BundleComponent,
  BundlePricingMode,
  VariantAxis,
} from "@/types/inventory";

import * as demo from "../data/demoStore";
import { useInventoryDemo } from "../hooks/useInventoryDemo";
import { BundleComponentEditor } from "./BundleComponentEditor";
import { VariantAxisEditor } from "./VariantAxisEditor";

type Mode = "standalone" | "variants" | "bundle";

interface VariantRow {
  id?: string;
  combo: string[];
  sku: string;
  barcode: string;
  sellPrice: string;
  minStock: string;
  openingQty: string;
  openingCost: string;
}

const MODES: Array<{ value: Mode; label: string; hint: string }> = [
  {
    value: "standalone",
    label: "Produk biasa",
    hint: "Satu barang, satu harga, satu stok.",
  },
  {
    value: "variants",
    label: "Punya varian",
    hint: "Satu produk induk yang mekar jadi beberapa ukuran atau rasa.",
  },
  {
    value: "bundle",
    label: "Bundle / multi-satuan",
    hint: "Paket yang memotong stok komponennya saat terjual.",
  },
];

/**
 * Create or edit a catalogue product, in whichever of its three shapes.
 *
 * ONE FORM, THREE SHAPES, and they are genuinely different things rather than a
 * standalone product with fields hidden. What changes per mode is not cosmetic:
 *
 *   standalone — owns its price, its stock and its reorder threshold.
 *   variants   — the form edits a FAMILY. It writes a parent plus one row per
 *                axis combination, because a parent with no variants is a POS
 *                tile that expands into nothing.
 *   bundle     — owns no stock at all. Its availability is derived from the
 *                components, and its cost is their sum.
 *
 * THE MODE IS LOCKED AFTER CREATION, mirroring the backend. Turning a standalone
 * into a parent would strand the stock rows and sales history written against
 * the old shape, so the API refuses it and this form does not offer it.
 *
 * OPENING STOCK LIVES HERE, on create, rather than as a separate errand. The
 * moment somebody defines a product is the moment they know how many are on the
 * shelf; sending them to another screen to say so is how catalogues end up full
 * of items with no stock and no cost basis.
 *
 * IT IS BEHIND A SWITCH, DEFAULTED OFF, and that is not timidity about the
 * feature. Filling it in writes a stock movement that cannot be edited or
 * deleted afterwards — the ledger is append-only, so a mistyped 100 is corrected
 * by a second movement of -90 and both stay on the stock card forever. It also
 * locks the product against deletion, since a product still holding stock cannot
 * be removed. A field that quietly did all that whenever somebody typed in it
 * would be a trap; a switch makes it a decision. Somebody cataloguing items
 * ahead of a delivery just leaves it off.
 *
 * A BUNDLE NEVER GETS THE SWITCH. It holds no stock of its own — how many are
 * available is derived from its components — so there is no balance to open.
 */
export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const { products, categories, warehouses, sync } = useInventoryDemo();

  const existing = productId ? products.find((p) => p._id === productId) : undefined;
  const existingVariants = useMemo(
    () => (existing ? demo.variantsOf(existing._id) : []),
    [existing],
  );

  const [mode, setMode] = useState<Mode>(() => {
    if (!existing) return "standalone";
    return existing.productType === "parent"
      ? "variants"
      : existing.productType === "bundle"
        ? "bundle"
        : "standalone";
  });

  const [name, setName] = useState(existing?.name ?? "");
  const [sku, setSku] = useState(existing?.sku ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]._id);
  const [unit, setUnit] = useState(existing?.unit ?? "pcs");
  const [barcode, setBarcode] = useState(existing?.barcode ?? "");
  const [sellPrice, setSellPrice] = useState(existing?.sellPrice ?? "");
  const [minStock, setMinStock] = useState(String(existing?.minStock ?? 0));
  const [hasExpiry, setHasExpiry] = useState(existing?.hasExpiry ?? false);

  const [openingEnabled, setOpeningEnabled] = useState(false);
  const [openingQty, setOpeningQty] = useState("");
  const [openingCost, setOpeningCost] = useState("");
  const [openingWarehouseId, setOpeningWarehouseId] = useState(warehouses[0]._id);

  const [axes, setAxes] = useState<VariantAxis[]>(
    existing?.variantAxes?.length ? existing.variantAxes : [{ name: "Ukuran", values: [] }],
  );
  const [variantOverrides, setVariantOverrides] = useState<Record<string, Partial<VariantRow>>>({});

  const [pricingMode, setPricingMode] = useState<BundlePricingMode>(
    existing?.bundleConfig?.pricingMode ?? "fixed",
  );
  const [fixedPrice, setFixedPrice] = useState(existing?.bundleConfig?.fixedPrice ?? "");
  const [components, setComponents] = useState<BundleComponent[]>(
    existing?.bundleConfig?.components ?? [],
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Axis values existing variants sit on — removing one would strand them. */
  const lockedValues = useMemo(
    () =>
      new Set(
        existingVariants.flatMap((variant) =>
          Object.values(variant.variantAttributes ?? {}),
        ),
      ),
    [existingVariants],
  );

  /**
   * Every variant the current axes describe, each pre-filled from the existing
   * row when there is one so an edit does not wipe prices somebody set.
   */
  const variantRows: VariantRow[] = useMemo(() => {
    const base = (sku || "SKU").toUpperCase();

    return demo.variantCombinations(axes).map((combo) => {
      const key = combo.join("|");
      const previous = existingVariants.find(
        (variant) => Object.values(variant.variantAttributes ?? {}).join("|") === key,
      );
      const override = variantOverrides[key] ?? {};

      return {
        id: previous?._id,
        combo,
        sku:
          override.sku ??
          previous?.sku ??
          `${base}-${combo.map((v) => v.toUpperCase().replace(/\s+/g, "")).join("-")}`,
        barcode: override.barcode ?? previous?.barcode ?? "",
        sellPrice: override.sellPrice ?? previous?.sellPrice ?? "",
        minStock: override.minStock ?? String(previous?.minStock ?? 0),
        // No `previous` fallback: opening stock is a one-off event at creation,
        // not a property of the variant. A row that already exists has whatever
        // stock its movements gave it, and this form is not where that changes.
        openingQty: override.openingQty ?? "",
        openingCost: override.openingCost ?? "",
      };
    });
  }, [axes, sku, existingVariants, variantOverrides]);

  /**
   * Whether this save can open a stock balance at all.
   *
   * Create only — an existing product's quantity moves through the stock
   * screens, where the movement gets a reason. And never a bundle, which holds
   * no stock to open.
   */
  const canOpenStock = !existing && mode !== "bundle";

  /**
   * Whether this save actually WILL open one.
   *
   * Both halves, everywhere it is used: switching a standalone to bundle mode
   * with the switch left on must not send an opening quantity the backend would
   * refuse, and the switch's own state is not enough to know that.
   */
  const openingStockOn = canOpenStock && openingEnabled;

  const componentHpp = sumDecimals(
    components.map((component) => {
      const item = products.find((p) => p._id === component.componentProductId);
      return item?.hppAvg ? multiplyDecimals(item.hppAvg, component.qty) : "0";
    }),
  );

  const sellsAtLoss =
    mode === "bundle" &&
    pricingMode === "fixed" &&
    isDecimal(fixedPrice) &&
    (toMinor(fixedPrice) ?? 0n) < (toMinor(componentHpp) ?? 0n) &&
    (toMinor(componentHpp) ?? 0n) > 0n;

  function setVariantField(combo: string[], field: keyof VariantRow, value: string) {
    const key = combo.join("|");
    setVariantOverrides((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (name.trim() === "") next.name = "Nama produk wajib diisi.";
    if (sku.trim() === "") next.sku = "SKU wajib diisi.";
    else if (
      products.some(
        (product) => product.sku === sku.trim().toUpperCase() && product._id !== existing?._id,
      )
    ) {
      next.sku = `SKU ${sku.trim().toUpperCase()} sudah dipakai produk lain.`;
    }
    if (unit.trim() === "") next.unit = "Satuan wajib diisi.";

    if (mode === "standalone") {
      if (sellPrice.trim() === "") next.sellPrice = "Harga jual wajib diisi.";
      else if (!isDecimal(sellPrice)) next.sellPrice = "Gunakan angka, maksimal 4 desimal.";
    }

    if (mode === "variants") {
      /**
       * The axis rules, checked here rather than left to the API.
       *
       * All three mirror what the backend enforces, and all three matter more
       * now that an axis past the fourth arrives with an EMPTY name: a blank is
       * the normal state of a new axis, so it has to be caught before the save
       * instead of coming back as a 400 on a form the user has already filled.
       *
       * The duplicate check is case-insensitive because an axis name becomes a
       * key in `variantAttributes` — "Ukuran" and "ukuran" would be two keys
       * rendering as one label, and the variant would describe only one of them.
       */
      const names = axes.map((axis) => axis.name.trim());
      const lowered = names.map((name) => name.toLowerCase());
      const duplicate = lowered.find(
        (name, index) => name !== "" && lowered.indexOf(name) !== index,
      );
      // Named by position, since the thing they are missing IS the name.
      const unnamed = names
        .map((name, index) => (name === "" ? index + 1 : null))
        .filter((position): position is number => position !== null);
      const valueless = axes
        .filter((axis) => axis.values.length === 0)
        .map((axis) => axis.name.trim())
        .filter(Boolean);

      if (unnamed.length > 0) {
        next.axes = `Atribut ke-${unnamed.join(", ke-")} belum punya nama.`;
      } else if (duplicate) {
        next.axes = `Nama atribut tidak boleh kembar: "${duplicate}".`;
      } else if (valueless.length > 0) {
        next.axes = `Atribut ${valueless.join(", ")} belum punya nilai — hapus atribut itu, atau isi nilainya.`;
      } else if (variantRows.length === 0) {
        next.axes = "Isi minimal satu nilai atribut supaya varian bisa dibuat.";
      }

      const skus = variantRows.map((row) => row.sku.trim().toUpperCase());
      if (new Set(skus).size !== skus.length) {
        next.axes = "Ada SKU varian yang kembar — setiap varian butuh SKU sendiri.";
      }
    }

    /**
     * Opening stock, checked only when the switch is on.
     *
     * A stale number left in a field the user then switched off must not block
     * the save: they said they did not want it, and refusing to save over a
     * value that will be discarded anyway is the form arguing with them.
     */
    if (openingStockOn) {
      if (mode === "standalone") {
        if (openingQty.trim() !== "" && !isDecimal(openingQty)) {
          next.openingQty = "Gunakan angka, maksimal 4 desimal.";
        }
        if (openingCost.trim() !== "" && !isDecimal(openingCost)) {
          next.openingCost = "Gunakan angka, maksimal 4 desimal.";
        }
      }

      if (mode === "variants") {
        const malformed = variantRows.filter(
          (row) =>
            (row.openingQty.trim() !== "" && !isDecimal(row.openingQty)) ||
            (row.openingCost.trim() !== "" && !isDecimal(row.openingCost)),
        );
        if (malformed.length > 0) {
          next.openingVariants = `Angka tidak valid pada varian ${malformed
            .map((row) => row.combo.join(" / "))
            .join(", ")} — maksimal 4 desimal.`;
        }
      }
    }

    if (mode === "bundle") {
      if (components.length === 0) next.components = "Bundle butuh minimal satu komponen.";
      if (components.some((component) => !isPositive(component.qty))) {
        next.components = "Qty setiap komponen harus lebih dari nol.";
      }
      if (pricingMode === "fixed") {
        if (fixedPrice.trim() === "") next.fixedPrice = "Harga bundle wajib diisi.";
        else if (!isDecimal(fixedPrice)) next.fixedPrice = "Gunakan angka, maksimal 4 desimal.";
      }
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      const saved = demo.saveProduct({
        id: existing?._id,
        sku,
        name,
        productType:
          mode === "variants" ? "parent" : mode === "bundle" ? "bundle" : "standalone",
        categoryId,
        unit,
        barcode: mode === "variants" ? undefined : barcode,
        sellPrice: mode === "standalone" ? sellPrice : undefined,
        minStock: mode === "standalone" ? Number(minStock) || 0 : undefined,
        hasExpiry: mode === "bundle" ? false : hasExpiry,
        variantAxes: mode === "variants" ? axes : undefined,
        variants:
          mode === "variants"
            ? variantRows.map((row) => ({
                id: row.id,
                combo: row.combo,
                sku: row.sku,
                barcode: row.barcode || undefined,
                sellPrice: row.sellPrice || undefined,
                minStock: Number(row.minStock) || 0,
                openingQty: openingStockOn ? row.openingQty || undefined : undefined,
                openingCost: openingStockOn ? row.openingCost || undefined : undefined,
              }))
            : undefined,
        bundleConfig:
          mode === "bundle"
            ? {
                pricingMode,
                fixedPrice: pricingMode === "fixed" ? fixedPrice : null,
                components,
              }
            : undefined,
        openingQty:
          openingStockOn && mode === "standalone" && openingQty.trim() !== ""
            ? openingQty
            : undefined,
        openingCost:
          openingStockOn && openingCost.trim() !== "" ? openingCost : undefined,
        openingWarehouseId,
      });

      sync();
      router.push("/dashboard/inventory/products");
      swalToast(
        existing ? "Perubahan disimpan." : `${saved.name} dibuat.`,
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Terjadi kesalahan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      {/* ------------------------------------------------------------ mode */}
      <div>
        <div className="inline-flex flex-wrap rounded-lg bg-accent p-1">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={Boolean(existing)}
              onClick={() => setMode(option.value)}
              className={cn(
                "rounded-md px-3.5 py-2 text-sm font-medium transition",
                mode === option.value
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
                existing && "cursor-not-allowed opacity-60",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {existing
            ? "Tipe produk dikunci setelah dibuat — mengubahnya akan memutus kartu stok dan riwayat penjualan yang sudah tertulis."
            : MODES.find((option) => option.value === mode)?.hint}
        </p>
      </div>

      {/* ---------------------------------------------------------- common */}
      <Card title="Informasi produk">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nama produk"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              placeholder="mis. Royal Canin Adult"
              required
            />
            <TextField
              label="SKU"
              name="sku"
              value={sku}
              onChange={(event) => setSku(event.target.value.toUpperCase())}
              error={fieldErrors.sku}
              hint="Unik per tenant"
              placeholder="RC-ADULT"
              className="font-mono"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Kategori</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                {/* w-full: the shadcn trigger defaults to `w-fit`, which is
                    right for a toolbar filter and wrong in a form grid — it
                    leaves the control narrower than the inputs beside it, and
                    the width then jumps with whichever category is selected. */}
                <SelectTrigger id="category" aria-label="Kategori" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category._id} value={category._id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TextField
              label="Satuan"
              name="unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              error={fieldErrors.unit}
              placeholder="pcs / kg / dus"
              required
            />

            {mode !== "variants" && (
              <TextField
                label="Barcode"
                name="barcode"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                hint="Opsional, unik per tenant"
                placeholder="899…"
                className="font-mono"
              />
            )}
          </div>

          {mode !== "bundle" && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="hasExpiry"
                checked={hasExpiry}
                onCheckedChange={(checked) => setHasExpiry(checked === true)}
              />
              <div>
                <Label htmlFor="hasExpiry">Produk punya masa kedaluwarsa</Label>
                <p className="text-xs text-muted">
                  Kalau dicentang, setiap penerimaan <b>wajib</b> mengisi kode
                  batch dan tanggal kedaluwarsa — itulah yang membuat FEFO dan
                  laporan expired bisa bekerja.
                  {mode === "variants" && " Varian mewarisi setelan ini dari induknya."}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------ standalone */}
      {mode === "standalone" && (
        <Card title="Harga & stok">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Harga jual"
                name="sellPrice"
                inputMode="decimal"
                value={sellPrice}
                onChange={(event) => setSellPrice(event.target.value)}
                error={fieldErrors.sellPrice}
                placeholder="68000"
                required
              />
              <TextField
                label="Stok minimum"
                name="minStock"
                inputMode="numeric"
                value={minStock}
                onChange={(event) => setMinStock(event.target.value)}
                hint="Ambang alert restock. 0 = tidak dialerti."
              />
            </div>

            <p className="text-xs text-muted">
              HPP tidak diisi manual. Ia terbentuk sendiri dari penerimaan barang
              sebagai rata-rata tertimbang.
            </p>
          </div>
        </Card>
      )}

      {/* -------------------------------------------------------- variants */}
      {mode === "variants" && (
        <>
          <VariantAxisEditor axes={axes} onChange={setAxes} lockedValues={lockedValues} />
          {fieldErrors.axes && (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors.axes}
            </p>
          )}

          <Card
            title={
              <span className="flex flex-wrap items-center gap-2">
                Varian yang akan dibuat
                <Badge variant="outline">{variantRows.length} kombinasi</Badge>
                {variantRows.length > 12 && (
                  <span className="text-xs font-normal text-secondary-foreground">
                    Varian sebanyak ini memperlambat pencarian di POS.
                  </span>
                )}
              </span>
            }
          >
            {variantRows.length === 0 ? (
              <div className="py-10 text-center">
                <p className="font-medium">Belum ada kombinasi</p>
                <p className="mt-1 text-sm text-muted">
                  Isi nilai atribut di atas — varian dibuat otomatis dari setiap
                  perkalian nilainya.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                      <th className="px-2 py-2 text-left font-medium">Varian</th>
                      <th className="px-2 py-2 text-left font-medium">SKU</th>
                      <th className="px-2 py-2 text-left font-medium">Barcode</th>
                      <th className="px-2 py-2 text-left font-medium">Harga jual</th>
                      <th className="px-2 py-2 text-left font-medium">Min stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantRows.map((row) => (
                      <tr key={row.combo.join("|")} className="border-b border-border/60">
                        <td className="px-2 py-2 font-medium">
                          {row.combo.join(" / ")}
                          {row.id && (
                            <Badge variant="outline" className="ml-2">
                              sudah ada
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`SKU ${row.combo.join(" ")}`}
                            value={row.sku}
                            onChange={(event) =>
                              setVariantField(row.combo, "sku", event.target.value.toUpperCase())
                            }
                            className="font-mono text-xs"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`Barcode ${row.combo.join(" ")}`}
                            value={row.barcode}
                            onChange={(event) =>
                              setVariantField(row.combo, "barcode", event.target.value)
                            }
                            placeholder="opsional"
                            className="font-mono text-xs"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`Harga ${row.combo.join(" ")}`}
                            inputMode="decimal"
                            value={row.sellPrice}
                            onChange={(event) =>
                              setVariantField(row.combo, "sellPrice", event.target.value)
                            }
                            className="font-mono"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`Min stok ${row.combo.join(" ")}`}
                            inputMode="numeric"
                            value={row.minStock}
                            onChange={(event) =>
                              setVariantField(row.combo, "minStock", event.target.value)
                            }
                            className="max-w-20 font-mono"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ---------------------------------------------------------- bundle */}
      {mode === "bundle" && (
        <>
          <Card title="Harga bundle">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pricingMode">Mode harga</Label>
                <Select
                  value={pricingMode}
                  onValueChange={(value) => setPricingMode(value as BundlePricingMode)}
                >
                  {/* w-full for the same reason as the category select: the
                      shadcn trigger defaults to `w-fit`, so it sits narrower
                      than the price field beside it and its width jumps between
                      "Tetap — saya isi manual" and "Otomatis". */}
                  <SelectTrigger
                    id="pricingMode"
                    aria-label="Mode harga"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Tetap — saya isi manual</SelectItem>
                    <SelectItem value="auto">
                      Otomatis — jumlah harga komponen
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted">
                  {pricingMode === "auto"
                    ? "Harga ikut naik sendiri saat harga komponen naik — tidak ada yang perlu diubah di sini."
                    : "Harga tetap di angka ini sampai diubah, meski harga komponen bergerak."}
                </p>
              </div>

              {pricingMode === "fixed" && (
                <TextField
                  label="Harga bundle"
                  name="fixedPrice"
                  inputMode="decimal"
                  value={fixedPrice}
                  onChange={(event) => setFixedPrice(event.target.value)}
                  error={fieldErrors.fixedPrice}
                  placeholder="480000"
                  required
                />
              )}
            </div>
          </Card>

          <BundleComponentEditor
            components={components}
            products={products}
            onChange={setComponents}
          />
          {fieldErrors.components && (
            <p role="alert" className="text-xs text-danger">
              {fieldErrors.components}
            </p>
          )}

          {/* Not an Alert: the app's Alert has no warning variant, and this is
              deliberately not an error — selling a bundle below cost is a
              legitimate promo decision. It needs to be seen, not blocked. */}
          {sellsAtLoss && (
            <div className="rounded-lg border border-secondary/40 bg-secondary/15 px-4 py-3 text-sm text-secondary-foreground">
              Harga tetap <b>{formatMoney(fixedPrice)}</b> berada di bawah HPP
              komponen <b>{formatMoney(componentHpp)}</b> — bundle ini dijual
              rugi. Boleh disimpan, tapi tercatat di audit trail.
            </div>
          )}

          <p className="text-xs text-muted">
            Bundle tidak menyimpan stok sendiri. Saat terjual, komponennya yang
            berkurang — satu baris <span className="font-mono">bundle_consume</span>{" "}
            per komponen di kartu stok.
          </p>
        </>
      )}

      {/* ----------------------------------------------------- opening stock */}
      {canOpenStock && (
        <Card
          title={
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>Isi stok awal sekarang?</span>
              <span className="flex items-center gap-2">
                <Switch
                  id="openingEnabled"
                  checked={openingEnabled}
                  onCheckedChange={setOpeningEnabled}
                  aria-label="Isi stok awal sekarang"
                />
                <Label htmlFor="openingEnabled" className="text-sm font-normal">
                  {openingEnabled ? "Ya" : "Tidak"}
                </Label>
              </span>
            </span>
          }
        >
          {!openingEnabled ? (
            <p className="text-sm text-muted">
              Produk dibuat tanpa stok. Kuantitasnya bisa diisi kapan saja lewat{" "}
              <b>Penyesuaian Stok</b> — pilih ini kalau barangnya belum datang,
              atau kalau kamu sedang mendaftarkan katalog lebih dulu.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Not an Alert: this is not an error, and it must be read before
                  the fields below rather than after a failed save. */}
              <div className="rounded-lg border border-secondary/40 bg-secondary/15 px-4 py-3 text-sm text-secondary-foreground">
                Stok awal tercatat sebagai <b>penyesuaian masuk</b> di kartu
                stok, jadi ada jejak dari mana kuantitas pertama datang.{" "}
                <b>Baris itu tidak bisa dihapus atau diedit</b> — salah angka
                dikoreksi dengan penyesuaian lagi, dan keduanya tetap terlihat.
                Produk yang sudah memegang stok juga tidak bisa dihapus.
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="openingWarehouse">Masuk ke gudang</Label>
                  <Select value={openingWarehouseId} onValueChange={setOpeningWarehouseId}>
                    <SelectTrigger
                      id="openingWarehouse"
                      aria-label="Masuk ke gudang"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses
                        .filter((warehouse) => warehouse.isActive)
                        .map((warehouse) => (
                          <SelectItem key={warehouse._id} value={warehouse._id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {mode === "variants" && (
                    <p className="text-xs text-muted">
                      Berlaku untuk semua varian di bawah.
                    </p>
                  )}
                </div>

                {mode === "standalone" && (
                  <>
                    <TextField
                      label="Jumlah stok awal"
                      name="openingQty"
                      inputMode="decimal"
                      value={openingQty}
                      onChange={(event) => setOpeningQty(event.target.value)}
                      error={fieldErrors.openingQty}
                      placeholder="0"
                    />
                    <TextField
                      label="Harga beli per unit"
                      name="openingCost"
                      inputMode="decimal"
                      value={openingCost}
                      onChange={(event) => setOpeningCost(event.target.value)}
                      error={fieldErrors.openingCost}
                      hint="Membentuk HPP awal. Kosongkan kalau belum tahu."
                      placeholder="44000"
                    />
                  </>
                )}
              </div>

              {/* A parent holds no stock of its own — its variants do — so the
                  quantity is asked per row and never once for the family. */}
              {mode === "variants" &&
                (variantRows.length === 0 ? (
                  <p className="text-sm text-muted">
                    Isi nilai atribut dulu — stok awal diisi per varian, karena
                    induk tidak memegang stok sendiri.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                          <th className="px-2 py-2 text-left font-medium">Varian</th>
                          <th className="px-2 py-2 text-left font-medium">Stok awal</th>
                          <th className="px-2 py-2 text-left font-medium">
                            Harga beli / unit
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {variantRows.map((row) => (
                          <tr key={row.combo.join("|")} className="border-b border-border/60">
                            <td className="px-2 py-2 font-medium">
                              {row.combo.join(" / ")}
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                aria-label={`Stok awal ${row.combo.join(" ")}`}
                                inputMode="decimal"
                                value={row.openingQty}
                                onChange={(event) =>
                                  setVariantField(row.combo, "openingQty", event.target.value)
                                }
                                placeholder="0"
                                className="max-w-24 font-mono"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                aria-label={`Harga beli ${row.combo.join(" ")}`}
                                inputMode="decimal"
                                value={row.openingCost}
                                onChange={(event) =>
                                  setVariantField(row.combo, "openingCost", event.target.value)
                                }
                                placeholder="opsional"
                                className="max-w-32 font-mono"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-muted">
                      Varian yang dikosongkan dibuat tanpa stok. Tidak semua
                      harus diisi.
                    </p>
                  </div>
                ))}

              {fieldErrors.openingVariants && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.openingVariants}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : existing ? "Simpan perubahan" : "Simpan produk"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/dashboard/inventory/products")}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
