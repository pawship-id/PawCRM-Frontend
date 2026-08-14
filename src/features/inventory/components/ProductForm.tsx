"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Alert, Button, Card, Spinner, TextField } from "@/components";
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
import { MediaGallery } from "@/components/MediaGallery";
import { mediaService } from "@/services/media.service";
import { Plus, X } from "lucide-react";
import dynamic from "next/dynamic";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  multiplyDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type { Category } from "@/types/api";
import type { ChartOfAccount } from "@/types/accounting";
import type { BusinessLine } from "@/services/businessLine.service";
import type {
  BundleComponent,
  BundlePricingMode,
  CreateFamilyVariantInput,
  CreateProductInput,
  OpeningStockInput,
  Product,
  ProductMedia,
  StockWarehouse,
  UpdateProductInput,
  VariantAxis,
  WeightUnit,
} from "@/types/inventory";

import { useBundleCandidates } from "../hooks/useBundleCandidates";
import { useBarcodeCheck } from "../hooks/useBarcodeCheck";
import { useCatalogLookups } from "../hooks/useCatalogLookups";
import { useProductDetail } from "../hooks/useProductDetail";
import {
  attributesFor,
  defaultVariantSku,
  matchVariant,
  skuPrefix,
  variantCombinations,
} from "../utils/catalogue";
import { BundleComponentEditor } from "./BundleComponentEditor";
import {
  ShippingFieldsCard,
  isShippingEmpty,
  toShippingDraft,
  toShippingPayload,
} from "./ShippingFieldsCard";
import type { ShippingDraft } from "./ShippingFieldsCard";
import { VariantAxisEditor } from "./VariantAxisEditor";

/**
 * ProseMirror touches `document` while it constructs, so the editor cannot be
 * server-rendered. Loaded lazily for a second reason too: it is by far the
 * heaviest thing on this screen, and a user creating a plain product with no
 * description should not pay for it.
 */
const RichTextEditor = dynamic(
  () => import("@/components/RichTextEditor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-40 rounded-lg border border-border bg-accent/40" />
    ),
  },
);

/**
 * A variant row's single image — a 32px tile that IS the upload control.
 *
 * One cell rather than a column of buttons: the matrix is already scrolling
 * sideways at five columns, and "upload / crop / delete" as three more would
 * make it unusable. Clicking the tile picks a file; clicking the × clears it.
 *
 * NO CROPPER HERE, deliberately. The gallery's crop dialog exists because a
 * catalogue hero image is composed; a variant thumbnail is a record of which
 * colour this one is, and stopping to crop twelve of them is the friction that
 * stops anyone filling the field in at all. The server still re-encodes, so the
 * safety properties are identical.
 */
function VariantImageCell({
  row,
  onChange,
}: {
  row: VariantRow;
  onChange: (asset: ProductMedia | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    try {
      onChange(await mediaService.upload(file));
    } catch {
      // The row keeps whatever it had. A failed upload here must not take down
      // a form holding eleven other rows of typed-in prices.
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label={`Gambar ${row.combo.join(" ")}`}
        onClick={() => inputRef.current?.click()}
        className="block size-8 overflow-hidden rounded border border-dashed border-border bg-accent/40"
      >
        {busy ? (
          <span className="text-[9px] text-muted">…</span>
        ) : row.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.image.thumbUrl ?? row.image.url}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <Plus className="mx-auto size-3 text-muted" />
        )}
      </button>

      {row.image && (
        <button
          type="button"
          aria-label={`Hapus gambar ${row.combo.join(" ")}`}
          onClick={() => onChange(null)}
          className="absolute -top-1 -right-1 rounded-full bg-foreground/70 p-0.5 text-surface"
        >
          <X className="size-2.5" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void pick(file);
        }}
      />
    </span>
  );
}

type Mode = "standalone" | "variants" | "bundle";

interface VariantRow {
  /** Set when this combination is already a stored variant. */
  id?: string;
  combo: string[];
  sku: string;
  barcode: string;
  sellPrice: string;
  minStock: string;
  openingQty: string;
  openingCost: string;

  /**
   * The per-row overrides, behind the expander.
   *
   * EVERY ONE IS "" BY DEFAULT AND "" MEANS INHERIT. The row shows the parent's
   * value as a placeholder and stores nothing until somebody types — which is
   * the same rule the standalone form follows, applied per row.
   */
  weight: string;
  weightUnit: string;
  length: string;
  width: string;
  height: string;
  image: ProductMedia | null;
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
 * The units a product may be counted in — the API's closed list, mirrored.
 *
 * A select rather than a text box because the API refuses anything else: free
 * text let one tenant spell the same unit three ways, and a report grouping by
 * unit then showed three rows for one. Leaving it alone stores DEFAULT_UNIT,
 * which is why the field asks for nothing and starts filled.
 */
const PRODUCT_UNITS = ["pcs", "sak", "dus"] as const;
const DEFAULT_UNIT = "pcs";

/**
 * The create/edit screen for a catalogue product.
 *
 * A LOADER AROUND THE FORM, and the split is not ceremony: every field below
 * initialises from the product being edited, and `useState` reads its initial
 * value once. Rendering the fields only after the product (and, for a parent,
 * its variants) has arrived is what lets that stay true — the alternative is an
 * effect that copies server data into state and a race about which wins.
 */
export function ProductForm({ productId }: { productId?: string }) {
  const detail = useProductDetail(productId);
  // `withAccounting` is what pulls in the income accounts and business lines the
  // accounting section picks from. Opt-in, so the list screen and the stock
  // pickers still issue exactly the two requests they always did.
  const lookups = useCatalogLookups({ withAccounting: true });

  if (detail.loading || lookups.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat…
      </div>
    );
  }

  if (detail.error) return <Alert variant="error">{detail.error}</Alert>;
  if (lookups.error) return <Alert variant="error">{lookups.error}</Alert>;

  if (lookups.categories.length === 0) {
    return (
      <Alert variant="error">
        Belum ada kategori produk. Buat satu dulu di Inventory → Kategori —
        setiap produk harus difilekan di bawah kategori.
      </Alert>
    );
  }

  return (
    <ProductFormFields
      existing={detail.product ?? undefined}
      existingVariants={detail.variants}
      categories={lookups.categories}
      warehouses={lookups.warehouses}
      salesAccounts={lookups.salesAccounts}
      businessLines={lookups.businessLines}
      accountingError={lookups.accountingError}
    />
  );
}

/**
 * Create or edit a catalogue product, in whichever of its three shapes.
 *
 * ONE FORM, THREE SHAPES, and they are genuinely different things rather than a
 * standalone product with fields hidden. What changes per mode is not cosmetic:
 *
 *   standalone — owns its price, its stock and its reorder threshold.
 *   variants   — the form edits a FAMILY. It writes a parent plus one row per
 *                axis combination, in ONE request that the API commits as one
 *                transaction, because a parent with no variants is a POS tile
 *                that expands into nothing.
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
 * of items with no stock and no cost basis. It travels in the same request and
 * is posted to the stock ledger by the API.
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
function ProductFormFields({
  existing,
  existingVariants,
  categories,
  warehouses,
  salesAccounts,
  businessLines,
  accountingError,
}: {
  existing?: Product;
  existingVariants: Product[];
  categories: Category[];
  warehouses: StockWarehouse[];
  salesAccounts: ChartOfAccount[];
  businessLines: BusinessLine[];
  accountingError: { status: number; message: string } | null;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>(() => {
    if (!existing) return "standalone";
    return existing.productType === "parent"
      ? "variants"
      : existing.productType === "bundle"
        ? "bundle"
        : "standalone";
  });

  const bundleCandidates = useBundleCandidates(mode === "bundle");
  const products = bundleCandidates.products;

  const [name, setName] = useState(existing?.name ?? "");
  // "" for a parent that has none — the field is shown in every mode, but only
  // the modes that sell something insist on it.
  const [sku, setSku] = useState(existing?.sku ?? "");
  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ?? categories[0]._id,
  );
  const [unit, setUnit] = useState(existing?.unit ?? DEFAULT_UNIT);
  /**
   * The stored unit when it predates the closed list ("botol", "kg").
   *
   * Rendered as an extra option so the select can SHOW it. Without this the
   * trigger would come up blank on such a product and the first save would
   * rewrite a field the user never touched.
   */
  const legacyUnit =
    existing?.unit &&
    !(PRODUCT_UNITS as readonly string[]).includes(existing.unit)
      ? existing.unit
      : null;
  const [barcode, setBarcode] = useState(existing?.barcode ?? "");
  // Debounced advisory lookup — see the hook. Passes the product being edited so
  // it does not report itself as its own duplicate.
  const { takenBy: barcodeTaken } = useBarcodeCheck(barcode, existing?._id);
  const [sellPrice, setSellPrice] = useState(existing?.sellPrice ?? "");
  const [minStock, setMinStock] = useState(String(existing?.minStock ?? 0));
  const [hasExpiry, setHasExpiry] = useState(existing?.hasExpiry ?? false);

  /**
   * ─── The marketplace fields ───────────────────────────────────────────
   *
   * Every one seeded from the STORED value (`existing.brand`), never from the
   * resolved one (`existing.resolved.brand`). On a variant the difference is the
   * whole feature: seeding from `resolved` would load the parent's brand into
   * the input, and the next save would write it as this variant's own — so it
   * would silently stop following the family on a save about something else.
   *
   * The parent's values are shown as PLACEHOLDERS instead, which is where the
   * `resolved` block is read.
   */
  const [brand, setBrand] = useState(existing?.brand ?? "");
  const [isPreorder, setIsPreorder] = useState(existing?.isPreorder ?? false);
  const [shipping, setShipping] = useState<ShippingDraft>(
    toShippingDraft(existing?.shipping),
  );
  const [media, setMedia] = useState<ProductMedia[]>(existing?.media ?? []);
  // Stored HTML, seeded from the STORED value like every other inheritable
  // field — never from `resolved`, for the reason spelled out above.
  const [description, setDescription] = useState(existing?.description ?? "");
  const [salesAccountId, setSalesAccountId] = useState(
    existing?.salesAccountId ?? "",
  );
  const [businessLineId, setBusinessLineId] = useState(
    existing?.businessLineId ?? "",
  );

  const [openingEnabled, setOpeningEnabled] = useState(false);
  const [openingQty, setOpeningQty] = useState("");
  const [openingCost, setOpeningCost] = useState("");
  const [openingWarehouseId, setOpeningWarehouseId] = useState(
    warehouses[0]?._id ?? "",
  );
  const [openingBatchCode, setOpeningBatchCode] = useState("");
  const [openingExpiryDate, setOpeningExpiryDate] = useState("");

  const [axes, setAxes] = useState<VariantAxis[]>(
    existing?.variantAxes?.length
      ? existing.variantAxes
      : [{ name: "Ukuran", values: [] }],
  );
  const [variantOverrides, setVariantOverrides] = useState<
    Record<string, Partial<VariantRow>>
  >({});

  const [pricingMode, setPricingMode] = useState<BundlePricingMode>(
    existing?.bundleConfig?.pricingMode ?? "fixed",
  );
  const [fixedPrice, setFixedPrice] = useState(
    existing?.bundleConfig?.fixedPrice ?? "",
  );
  const [components, setComponents] = useState<BundleComponent[]>(
    existing?.bundleConfig?.components ?? [],
  );

  /**
   * Which variant rows have their override drawer open, by combination key.
   *
   * EXPAND IN PLACE RATHER THAN A DIALOG, because the user is comparing rows —
   * "the 10 kg should weigh more than the 3 kg" — and a modal hides exactly the
   * comparison they opened it to make. It is also the cheapest thing that could
   * work: one Set, no new component, and it degrades to a long form on mobile.
   */
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Per-row API refusals, keyed by combination — see applyApiError. */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
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
    // The parent's SKU when it has one, its NAME when it does not — leaving the
    // parent's code empty is ordinary now, and twelve rows called "SKU-…" would
    // be twelve rows the user has to retype.
    const prefix = skuPrefix(sku, name);

    return variantCombinations(axes).map((combo) => {
      const key = combo.join("|");
      const previous = matchVariant(existingVariants, axes, combo);
      const override = variantOverrides[key] ?? {};

      return {
        id: previous?._id,
        combo,
        sku: override.sku ?? previous?.sku ?? defaultVariantSku(prefix, combo),
        barcode: override.barcode ?? previous?.barcode ?? "",
        sellPrice: override.sellPrice ?? previous?.sellPrice ?? "",
        minStock: override.minStock ?? String(previous?.minStock ?? 0),
        // No `previous` fallback: opening stock is a one-off event at creation,
        // not a property of the variant. A row that already exists has whatever
        // stock its movements gave it, and this form is not where that changes.
        openingQty: override.openingQty ?? "",
        openingCost: override.openingCost ?? "",

        /**
         * The per-row overrides behind the expander.
         *
         * Seeded from the STORED value (`previous.shipping.weight`), never from
         * the resolved one. That is the same rule the standalone form follows,
         * applied twelve times: loading the parent's weight into each row's
         * input would turn every inherited row into an explicit override on the
         * first save, and the family would stop moving together.
         *
         * `""` is what the parent's value shows through as — the placeholder.
         */
        weight: override.weight ?? previous?.shipping?.weight ?? "",
        weightUnit: override.weightUnit ?? previous?.shipping?.weightUnit ?? "",
        length: override.length ?? previous?.shipping?.length ?? "",
        width: override.width ?? previous?.shipping?.width ?? "",
        height: override.height ?? previous?.shipping?.height ?? "",
        image: override.image ?? previous?.variantImage ?? null,
      };
    });
  }, [axes, sku, name, existingVariants, variantOverrides]);

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

  /**
   * A preview of the bundle weight the API will derive — the same relationship
   * `componentHpp` above already has with `hppAvg`: computed here so the number
   * moves while the user edits the component list, and authoritative on the
   * server, which resolves each component's own inheritance.
   *
   * In GRAMS, matching what the API reports, so the two cannot disagree about
   * units while the form is open.
   */
  const componentWeightGrams = useMemo(() => {
    if (mode !== "bundle" || components.length === 0) return null;

    let total = 0n;
    for (const component of components) {
      const item = products.find(
        (candidate) => candidate._id === component.componentProductId,
      );
      const weight = item?.resolved?.shipping.weight;
      if (!weight) continue;

      const grams =
        item?.resolved?.shipping.weightUnit === "kg"
          ? multiplyDecimals(weight, "1000")
          : weight;
      total += toMinor(multiplyDecimals(grams, component.qty)) ?? 0n;
    }

    // toDecimalString, never a float — a weight is a decimal like every
    // other quantity here, and Number() would reintroduce exactly the error
    // minor units exist to remove.
    return total > 0n ? formatQty(toDecimalString(total)) : null;
  }, [mode, components, products]);

  /** Components with no weight recorded — named so the total can be trusted. */
  const unweighedComponents = useMemo(() => {
    if (mode !== "bundle") return [];

    return components
      .map((component) =>
        products.find(
          (candidate) => candidate._id === component.componentProductId,
        ),
      )
      .filter((item) => item && !item.resolved?.shipping.weight)
      .map((item) => item?.name ?? "Komponen");
  }, [mode, components, products]);

  const sellsAtLoss =
    mode === "bundle" &&
    pricingMode === "fixed" &&
    isDecimal(fixedPrice) &&
    (toMinor(fixedPrice) ?? 0n) < (toMinor(componentHpp) ?? 0n) &&
    (toMinor(componentHpp) ?? 0n) > 0n;

  /**
   * A row's shipping overrides as a payload, or undefined when it typed none.
   *
   * Only the leaves the row actually filled in: a variant that set its weight
   * and nothing else keeps inheriting the parent's box size, which is the whole
   * reason INHERITED_FROM_PARENT names leaf paths rather than the object.
   */
  function rowShippingPayload(row: VariantRow) {
    const leaves: Record<string, string> = {};
    if (row.weight.trim()) leaves.weight = row.weight.trim();
    if (row.weightUnit.trim()) leaves.weightUnit = row.weightUnit.trim();
    if (row.length.trim()) leaves.length = row.length.trim();
    if (row.width.trim()) leaves.width = row.width.trim();
    if (row.height.trim()) leaves.height = row.height.trim();

    return Object.keys(leaves).length > 0 ? leaves : undefined;
  }

  /**
   * Records one row's override.
   *
   * The value is typed as the FIELD'S own type rather than as `string`, because
   * `image` holds an asset object and `null` is how it is cleared — the same
   * clear-by-null every other override in this form uses.
   */
  function setVariantField<K extends keyof VariantRow>(
    combo: string[],
    field: K,
    value: VariantRow[K],
  ) {
    const key = combo.join("|");
    setVariantOverrides((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    /** Per-variant refusals, keyed by combination — same map applyApiError fills. */
    const nextRows: Record<string, string> = {};

    if (name.trim() === "") next.name = "Nama produk wajib diisi.";
    /**
     * A SKU is required by everything that is SOLD, and by nothing else.
     *
     * A parent holds no stock, carries no price and is never scanned — what
     * staff quote and the till looks up is the variant's code, and each row of
     * the table below insists on one. Asking for a parent code as well is a
     * second thing to keep unique that nobody ever says out loud. The field is
     * still SHOWN in this mode: filling it seeds every variant's SKU.
     *
     * Uniqueness is NOT checked here. Only the server knows what is taken, and
     * it answers with the field — see applyApiError.
     */
    if (mode !== "variants" && sku.trim() === "") next.sku = "SKU wajib diisi.";
    // No check on `unit`: the select always holds one of the API's values, so
    // there is nothing a user can do to it that the server would refuse.

    if (mode === "standalone") {
      if (sellPrice.trim() === "") next.sellPrice = "Harga jual wajib diisi.";
      else if (!isDecimal(sellPrice))
        next.sellPrice = "Gunakan angka, maksimal 4 desimal.";
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

      /**
       * The variant SKUs, checked ON THE ROW rather than above the table.
       *
       * This is where the requirement moved to: the parent may have no code, so
       * every row must. Both refusals are bound to the cell that caused them —
       * a family of twelve rows told only "a SKU is missing" is a hunt, and the
       * duplicate message used to land in the AXIS error slot, where it also
       * overwrote whatever the axis editor was trying to say.
       */
      const skus = variantRows.map((row) => row.sku.trim().toUpperCase());
      const duplicated = new Set(
        skus.filter(
          (value, index) => value !== "" && skus.indexOf(value) !== index,
        ),
      );

      variantRows.forEach((row, index) => {
        const key = row.combo.join("|");
        if (skus[index] === "") {
          nextRows[key] = "SKU varian wajib diisi.";
        } else if (duplicated.has(skus[index])) {
          nextRows[key] = "SKU ini kembar dengan varian lain.";
        }
      });

      // Every variant is sold directly, so every variant needs a price — the
      // API requires it per row, and a blank here would come back as a 400 on
      // a table the user has already filled in.
      const priceless = variantRows.filter(
        (row) => row.sellPrice.trim() === "" || !isDecimal(row.sellPrice),
      );
      if (priceless.length > 0) {
        next.variantPrices = `Harga jual belum benar pada varian ${priceless
          .map((row) => row.combo.join(" / "))
          .join(", ")}.`;
      }
    }

    /**
     * The marketplace fields. Optional throughout, so what is checked is the
     * SHAPE of anything actually typed — an empty field is a valid answer.
     *
     * Length caps mirror the API's, so a 200-character brand is refused on the
     * field rather than as a banner over a form the user has to re-find their
     * way around.
     */
    if (brand.trim().length > 120) {
      next.brand = "Maksimal 120 karakter.";
    }

    // The API's own cap, checked against the RAW html rather than the rendered
    // text: 30 KB of markup still has to be parsed even if it renders as a
    // paragraph, and refusing it here keeps the refusal on the field.
    if (description.length > 20_000) {
      next.description = "Deskripsi terlalu panjang (maksimal 20.000 karakter).";
    }

    (
      [
        ["weight", "Berat"],
        ["length", "Panjang"],
        ["width", "Lebar"],
        ["height", "Tinggi"],
      ] as const
    ).forEach(([field, label]) => {
      const raw = shipping[field].trim();
      if (raw === "") return;
      if (!isDecimal(raw)) {
        next[`shipping.${field}`] = `${label}: gunakan angka, maksimal 4 desimal.`;
      } else if (raw.startsWith("-")) {
        next[`shipping.${field}`] = `${label} tidak boleh negatif.`;
      }
    });

    // A number with no unit is ambiguous in exactly the way that ships a 3 kg
    // sack as three grams. The API defaults a bare weight to grams; asking here
    // means the user chooses rather than discovering the default later.
    if (shipping.weight.trim() !== "" && shipping.weightUnit.trim() === "") {
      next["shipping.weightUnit"] = "Pilih satuan berat.";
    }

    if (shipping.packageContents.trim().length > 500) {
      next["shipping.packageContents"] = "Maksimal 500 karakter.";
    }

    /**
     * Opening stock, checked only when the switch is on.
     *
     * A stale number left in a field the user then switched off must not block
     * the save: they said they did not want it, and refusing to save over a
     * value that will be discarded anyway is the form arguing with them.
     */
    if (openingStockOn) {
      if (warehouses.length === 0) {
        next.openingWarehouse =
          "Belum ada gudang aktif — stok awal tidak bisa dicatat.";
      }

      /**
       * A quantity has to arrive with the price it was bought at.
       *
       * The API refuses opening stock without `costPerUnit` — and it refuses it
       * BEFORE writing anything, so a product that would otherwise exist does
       * not. Asking here keeps the refusal on the field.
       *
       * The reason is accounting rather than tidiness: the price is what the
       * opening inventory journal is built from. Without it the movement carries
       * a quantity with no value, the journal line is skipped, and the tenant
       * ends up with stock on the shelf that the balance sheet says is worth
       * nothing — a hole that only surfaces at the first stocktake, by which
       * time the original price is a question nobody can answer.
       *
       * Zero is allowed, deliberately: donated stock and free samples are real.
       */
      const COST_REQUIRED =
        "Harga beli wajib — angka ini yang membentuk jurnal persediaan stok awal.";

      /**
       * And the quantity itself is required, because the switch already asked.
       *
       * Left blank it would save a product with no stock at all — which is
       * exactly what the OFF position means, except the user walks away
       * believing they entered an opening balance and only finds out at the
       * first stock card. Zero is refused for the same reason: a movement of
       * nothing is not an opening balance, it is the switch turned off.
       */
      const QTY_REQUIRED = "Jumlah stok awal wajib diisi.";

      if (mode === "standalone") {
        if (openingQty.trim() === "") {
          next.openingQty = QTY_REQUIRED;
        } else if (!isDecimal(openingQty)) {
          next.openingQty = "Gunakan angka, maksimal 4 desimal.";
        } else if (!isPositive(openingQty)) {
          next.openingQty = "Jumlah stok awal harus lebih dari 0.";
        }
        if (openingCost.trim() === "") {
          next.openingCost = COST_REQUIRED;
        } else if (!isDecimal(openingCost)) {
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
        } else if (
          variantRows.length > 0 &&
          variantRows.every((row) => row.openingQty.trim() === "")
        ) {
          // Which variants get stock stays the user's call — a family may
          // stock two sizes and leave the third for later — but leaving every
          // row empty is the switch turned off with extra steps.
          next.openingVariants = `${QTY_REQUIRED} Isi minimal satu varian.`;
        }

        // Per row, because a family may open stock for some variants and not
        // others — naming the rows is what makes a twelve-row table actionable.
        const priceless = variantRows.filter(
          (row) =>
            row.openingQty.trim() !== "" && row.openingCost.trim() === "",
        );
        if (priceless.length > 0) {
          next.openingCostVariants = `${COST_REQUIRED} Lengkapi varian ${priceless
            .map((row) => row.combo.join(" / "))
            .join(", ")}.`;
        }
      }

      /**
       * A lot has to be named for goods that expire.
       *
       * The promise `hasExpiry` makes is that every receipt can be picked FEFO
       * and reported on before it turns — which needs a batch code and a date.
       * The API refuses the movement without them, so asking here keeps the
       * refusal on the field instead of on a saved product.
       */
      if (hasExpiry && opensAnyStock()) {
        if (openingBatchCode.trim() === "") {
          next.openingBatchCode =
            "Produk kedaluwarsa: kode batch wajib diisi untuk stok awal.";
        }
        if (openingExpiryDate.trim() === "") {
          next.openingExpiryDate =
            "Produk kedaluwarsa: tanggal kedaluwarsa wajib diisi untuk stok awal.";
        }
      }
    }

    if (mode === "bundle") {
      if (components.length === 0)
        next.components = "Bundle butuh minimal satu komponen.";
      if (components.some((component) => !isPositive(component.qty))) {
        next.components = "Qty setiap komponen harus lebih dari nol.";
      }
      if (pricingMode === "fixed") {
        if (fixedPrice.trim() === "")
          next.fixedPrice = "Harga bundle wajib diisi.";
        else if (!isDecimal(fixedPrice))
          next.fixedPrice = "Gunakan angka, maksimal 4 desimal.";
      }
    }

    setFieldErrors(next);
    setRowErrors(nextRows);
    return Object.keys(next).length === 0 && Object.keys(nextRows).length === 0;
  }

  /** Whether anything at all will be sent as an opening balance. */
  function opensAnyStock(): boolean {
    if (!openingStockOn) return false;
    if (mode === "standalone") return openingQty.trim() !== "";
    return variantRows.some((row) => row.openingQty.trim() !== "");
  }

  /** The opening-stock instruction for one quantity, or undefined for none. */
  function openingStockFor(
    qty: string,
    cost: string,
  ): OpeningStockInput | undefined {
    if (!openingStockOn || qty.trim() === "") return undefined;

    return {
      warehouseId: openingWarehouseId,
      qty: qty.trim(),
      // Always sent, never conditional: the API requires it, and validate()
      // has already refused an empty one. Omitting it here would turn a caught
      // field error into a 400 the form has to unpack.
      costPerUnit: cost.trim(),
      ...(hasExpiry
        ? {
            batchCode: openingBatchCode.trim(),
            expiryDate: openingExpiryDate.trim(),
          }
        : {}),
    };
  }

  /** The create payload for whichever shape the form is in. */
  /**
   * The marketplace fields, as a create payload.
   *
   * Every one is OMITTED when blank rather than sent as null. On a variant that
   * is what makes it inherit: the API stores the schema default (null), and null
   * is the sentinel that resolves from the parent. Sending an explicit null
   * would reach the same place today, but "absent means inherit" is the contract
   * the API documents and the one that survives a default changing.
   */
  function marketplaceCreateFields() {
    return {
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(isPreorder ? { isPreorder: true } : {}),
      ...(salesAccountId ? { salesAccountId } : {}),
      ...(businessLineId ? { businessLineId } : {}),
      ...(isShippingEmpty(shipping)
        ? {}
        : { shipping: toShippingPayload(shipping) }),
      // Omitted when empty, like every other optional field. The gallery is
      // forbidden on a variant, but this form never creates a lone variant —
      // it creates a parent whose rows carry one image each.
      ...(media.length > 0 ? { media } : {}),
      ...(description.trim() ? { description } : {}),
    };
  }

  function buildCreateInput(): CreateProductInput {
    const base = {
      name: name.trim(),
      categoryId,
      unit: unit.trim(),
    };
    const trimmedSku = sku.trim().toUpperCase();

    if (mode === "bundle") {
      return {
        ...base,
        ...marketplaceCreateFields(),
        sku: trimmedSku,
        productType: "bundle",
        ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
        bundleConfig: {
          pricingMode,
          ...(pricingMode === "fixed" ? { fixedPrice: fixedPrice.trim() } : {}),
          components: components.map((component) => ({
            componentProductId: component.componentProductId as string,
            qty: component.qty,
          })),
        },
      };
    }

    if (mode === "variants") {
      const variants: CreateFamilyVariantInput[] = variantRows.map((row) => ({
        sku: row.sku.trim().toUpperCase(),
        variantAttributes: attributesFor(axes, row.combo),
        sellPrice: row.sellPrice.trim(),
        ...(row.barcode.trim() ? { barcode: row.barcode.trim() } : {}),
        minStock: Number(row.minStock) || 0,
        // OMITTED when the row typed nothing — absence is what makes the field
        // resolve from the parent, and sending a null would be the same thing
        // said less clearly.
        ...(rowShippingPayload(row) ? { shipping: rowShippingPayload(row) } : {}),
        ...(row.image ? { variantImage: row.image } : {}),
        ...(openingStockFor(row.openingQty, row.openingCost)
          ? { openingStock: openingStockFor(row.openingQty, row.openingCost) }
          : {}),
      }));

      return {
        ...base,
        ...marketplaceCreateFields(),
        // Omitted entirely when blank rather than sent as "" — the parent's
        // code is genuinely optional, and the rows below carry the real ones.
        ...(trimmedSku ? { sku: trimmedSku } : {}),
        productType: "parent",
        hasExpiry,
        // Trimmed here rather than in the editor: a half-typed axis is a normal
        // state to be in while filling the form, and only a submit has to care.
        variantAxes: axes
          .filter((axis) => axis.values.length > 0)
          .map((axis) => ({ name: axis.name.trim(), values: axis.values })),
        ...(variants.length > 0 ? { variants } : {}),
      };
    }

    return {
      ...base,
      ...marketplaceCreateFields(),
      sku: trimmedSku,
      sellPrice: sellPrice.trim(),
      minStock: Number(minStock) || 0,
      hasExpiry,
      ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      ...(openingStockFor(openingQty, openingCost)
        ? { openingStock: openingStockFor(openingQty, openingCost) }
        : {}),
    };
  }

  /**
   * What changed on the product itself.
   *
   * ONLY THE DIFFERENCE IS SENT. The API rejects an empty patch, and a field
   * echoed back unchanged is a field that can collide with itself — re-sending
   * an untouched SKU makes the uniqueness check answer about the product's own
   * row.
   */
  function buildPatch(product: Product): UpdateProductInput {
    const patch: UpdateProductInput = {};

    if (name.trim() !== product.name) patch.name = name.trim();

    /**
     * "" is how the API is told to CLEAR one, the same way `barcode` works —
     * and only a parent may be cleared, which is the one mode where the field
     * is optional. `product.sku` is null there, so the comparison is against
     * `?? ""` rather than the raw value.
     */
    const nextSku = sku.trim().toUpperCase();
    if (nextSku !== (product.sku ?? "")) patch.sku = nextSku;
    if (categoryId !== product.categoryId && mode !== "variants")
      patch.categoryId = categoryId;
    if (unit.trim() !== product.unit) patch.unit = unit.trim();

    if (mode !== "variants") {
      const nextBarcode = barcode.trim();
      if (nextBarcode !== (product.barcode ?? "")) {
        // "" is how the API is told to CLEAR one — see the validation layer.
        patch.barcode = nextBarcode;
      }
    }

    if (mode === "standalone") {
      if (toMinor(sellPrice) !== toMinor(product.sellPrice ?? ""))
        patch.sellPrice = sellPrice.trim();
      if ((Number(minStock) || 0) !== product.minStock)
        patch.minStock = Number(minStock) || 0;
    }

    if (mode !== "bundle" && hasExpiry !== product.hasExpiry) {
      patch.hasExpiry = hasExpiry;
    }

    if (mode === "variants") {
      const before = JSON.stringify(
        product.variantAxes.map((axis) => [axis.name, axis.values]),
      );
      const after = JSON.stringify(
        axes
          .filter((axis) => axis.values.length > 0)
          .map((axis) => [axis.name.trim(), axis.values]),
      );
      if (before !== after) {
        patch.variantAxes = axes
          .filter((axis) => axis.values.length > 0)
          .map((axis) => ({ name: axis.name.trim(), values: axis.values }));
      }
    }

    /**
     * The marketplace fields, diffed against the STORED value — never against
     * `product.resolved`.
     *
     * The mirror of the placeholder rule. Comparing against the resolved value
     * would make an untouched variant look changed the moment its parent
     * differed from it, and the patch would write the parent's number as this
     * variant's own override.
     *
     * "" becomes null, which is how an override is CLEARED and the field
     * resumes inheriting.
     */
    if (description !== (product.description ?? "")) {
      // "" clears it, which on a variant is what makes it inherit again.
      patch.description = description.trim() === "" ? null : description;
    }

    const nextBrand = brand.trim();
    if (nextBrand !== (product.brand ?? "")) {
      patch.brand = nextBrand === "" ? null : nextBrand;
    }
    if (isPreorder !== (product.isPreorder ?? false)) {
      patch.isPreorder = isPreorder;
    }
    if (salesAccountId !== (product.salesAccountId ?? "")) {
      patch.salesAccountId = salesAccountId === "" ? null : salesAccountId;
    }
    if (businessLineId !== (product.businessLineId ?? "")) {
      patch.businessLineId = businessLineId === "" ? null : businessLineId;
    }

    /**
     * The gallery, sent WHOLE whenever it differs.
     *
     * Compared by storage key rather than by object identity: an asset read back
     * from the API carries an `_id` the freshly-uploaded one does not, so a deep
     * compare would report every gallery as changed on every save.
     */
    const mediaKeys = (items: ProductMedia[]) =>
      items.map((item) => item.storageKey).join("|");
    if (mediaKeys(media) !== mediaKeys(product.media ?? [])) {
      patch.media = media;
    }

    // Sent whole when anything in it moved: the API merges leaf by leaf, so an
    // emptied field has to arrive as an explicit null rather than as an absence.
    const nextShipping = toShippingPayload(shipping);
    if (
      JSON.stringify(nextShipping) !==
      JSON.stringify(toShippingPayload(toShippingDraft(product.shipping)))
    ) {
      patch.shipping = nextShipping;
    }

    if (mode === "bundle") {
      patch.bundleConfig = {
        pricingMode,
        ...(pricingMode === "fixed" ? { fixedPrice: fixedPrice.trim() } : {}),
        components: components.map((component) => ({
          componentProductId: component.componentProductId as string,
          qty: component.qty,
        })),
      };
    }

    return patch;
  }

  /**
   * Binds an API refusal to the field that caused it.
   *
   * The backend answers a 400 and a 409 alike with `details: [{ field, message }]`
   * — including inside a family, where the field is `variants.3.sku`. Those are
   * routed to the row rather than dumped above the table, because a form of
   * twelve variants is exactly where "SKU already exists" with no row attached
   * is useless.
   */
  function applyApiError(error: ApiError) {
    const fields = error.fieldErrors;
    const own: Record<string, string> = {};
    const rows: Record<string, string> = {};

    Object.entries(fields).forEach(([field, message]) => {
      const match = /^variants\.(\d+)\./.exec(field);
      if (match) {
        const row = variantRows[Number(match[1])];
        if (row) rows[row.combo.join("|")] = message;
        return;
      }
      own[field] = message;
    });

    setFieldErrors((prev) => ({ ...prev, ...own }));
    setRowErrors(rows);
    setFormError(error.message);
  }

  /**
   * Saving a FAMILY on edit is a diff, not a rewrite.
   *
   * The parent is created with its variants in one request, but afterwards the
   * rows have independent lives — one gets a new price, one is added when the
   * tenant starts stocking a size. So each row is compared with what is stored:
   * changed rows are patched, new combinations are created against the parent,
   * and untouched rows are not sent at all.
   *
   * A combination that DISAPPEARED is not deleted here. Removing an axis value
   * is refused by the API while a live variant sits on it (the editor locks
   * those values), and deleting a variant is its own decision — made on the
   * list, where its stock and history are visible.
   */
  async function saveFamily(product: Product) {
    for (const row of variantRows) {
      if (row.id) {
        const previous = existingVariants.find((v) => v._id === row.id);
        if (!previous) continue;

        const patch: UpdateProductInput = {};
        if (row.sku.trim().toUpperCase() !== previous.sku)
          patch.sku = row.sku.trim().toUpperCase();
        if (row.barcode.trim() !== (previous.barcode ?? ""))
          patch.barcode = row.barcode.trim();
        if (toMinor(row.sellPrice) !== toMinor(previous.sellPrice ?? ""))
          patch.sellPrice = row.sellPrice.trim();
        if ((Number(row.minStock) || 0) !== previous.minStock)
          patch.minStock = Number(row.minStock) || 0;

        /**
         * The per-row overrides, diffed against the STORED values.
         *
         * `previous.shipping` is what this variant itself holds — nulls where it
         * inherits — so an untouched inherited row produces an identical payload
         * and no patch. Comparing against `previous.resolved.shipping` instead
         * would make every inherited row look changed and write the parent's
         * numbers onto it, which is the bug the whole design exists to prevent.
         *
         * Sent WHOLE when anything moved, because the API merges leaf by leaf
         * and an emptied field has to arrive as an explicit null to clear.
         */
        const nextShipping = {
          weight: row.weight.trim() || null,
          weightUnit: (row.weightUnit.trim() || null) as WeightUnit | null,
          length: row.length.trim() || null,
          width: row.width.trim() || null,
          height: row.height.trim() || null,
        };
        const storedShipping = {
          weight: previous.shipping?.weight ?? null,
          weightUnit: previous.shipping?.weightUnit ?? null,
          length: previous.shipping?.length ?? null,
          width: previous.shipping?.width ?? null,
          height: previous.shipping?.height ?? null,
        };
        if (JSON.stringify(nextShipping) !== JSON.stringify(storedShipping)) {
          patch.shipping = nextShipping;
        }

        if (
          (row.image?.storageKey ?? null) !==
          (previous.variantImage?.storageKey ?? null)
        ) {
          // Null removes it — the same clear-by-null every override uses.
          patch.variantImage = row.image;
        }

        if (Object.keys(patch).length > 0) {
          await productService.update(row.id, patch);
        }
        continue;
      }

      await productService.create({
        productType: "variant",
        parentId: product._id,
        sku: row.sku.trim().toUpperCase(),
        name: `${name.trim()} — ${row.combo.join(" / ")}`,
        variantAttributes: attributesFor(axes, row.combo),
        sellPrice: row.sellPrice.trim(),
        ...(row.barcode.trim() ? { barcode: row.barcode.trim() } : {}),
        minStock: Number(row.minStock) || 0,
        ...(rowShippingPayload(row)
          ? { shipping: rowShippingPayload(row) }
          : {}),
        ...(row.image ? { variantImage: row.image } : {}),
      });
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setRowErrors({});
    if (!validate()) return;

    setSaving(true);

    try {
      if (existing) {
        const patch = buildPatch(existing);
        if (Object.keys(patch).length > 0) {
          await productService.update(existing._id, patch);
        }
        if (mode === "variants") await saveFamily(existing);

        swalToast("Perubahan disimpan.");
      } else {
        const created = await productService.create(buildCreateInput());

        /**
         * The create succeeded; the opening stock may not have.
         *
         * The API commits the products before it posts to the ledger, so a
         * failure there comes back on a 201 rather than as an error. Saying so
         * is the whole point — the user is about to leave this screen believing
         * they entered a quantity.
         */
        if (created.openingStock && !created.openingStock.posted) {
          swalToast(
            `${created.name} dibuat, tapi stok awal belum tercatat: ${
              created.openingStock.error ?? "gagal"
            }. Catat lewat Penyesuaian Stok.`,
          );
        } else {
          swalToast(`${created.name} dibuat.`);
        }
      }

      router.push("/dashboard/inventory/products");
    } catch (error) {
      if (error instanceof ApiError) {
        applyApiError(error);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
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
            {/* Shown in every mode, insisted on only where something is sold.
                A parent keeps the field because filling it seeds every variant
                SKU below — it is a convenience, not a requirement. */}
            <TextField
              label="SKU"
              name="sku"
              value={sku}
              onChange={(event) => setSku(event.target.value.toUpperCase())}
              error={fieldErrors.sku}
              hint={
                mode === "variants"
                  ? "Opsional — dipakai sebagai awalan SKU varian. Induk tidak dijual, jadi boleh dikosongkan."
                  : "Unik per tenant"
              }
              placeholder="RC-ADULT"
              className="font-mono"
              required={mode !== "variants"}
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
                <SelectTrigger
                  id="category"
                  aria-label="Kategori"
                  className="w-full"
                >
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
              {mode === "variants" && (
                <p className="text-xs text-muted">
                  Varian mewarisi kategori ini dari induknya.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit">Satuan</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="unit" aria-label="Satuan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_UNITS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                  {/* A product catalogued as "botol" before the list closed is
                      still editable, and its unit has to be SHOWN rather than
                      silently rewritten to pcs by a select that cannot render
                      it. Offered as its own option, so changing it stays a
                      decision the user makes. */}
                  {legacyUnit && (
                    <SelectItem value={legacyUnit}>
                      {legacyUnit} (satuan lama)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted">
                {mode === "variants"
                  ? "Varian mewarisi satuan ini dari induknya."
                  : "Opsional — kosong berarti pcs."}
              </p>
            </div>

            {mode !== "variants" && (
              <div>
                <TextField
                  label="Barcode"
                  name="barcode"
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  error={fieldErrors.barcode}
                  hint="Opsional, unik per tenant"
                  placeholder="899…"
                  className="font-mono"
                />
                {/*
                  ADVISORY, NOT A GATE — the save button stays enabled. The check
                  races anything another user does in the same second and the
                  server is the authority regardless; what this buys is learning
                  about the clash while there is still time to go and look,
                  rather than after filling in the whole product.
                */}
                {barcodeTaken && (
                  <p className="mt-1.5 text-xs text-danger">
                    Barcode ini sudah dipakai{" "}
                    <Link
                      href={`/dashboard/inventory/products/${barcodeTaken._id}`}
                      className="underline underline-offset-2"
                      target="_blank"
                    >
                      {barcodeTaken.sku ?? barcodeTaken.name}
                    </Link>
                    . Simpan akan ditolak.
                  </p>
                )}
              </div>
            )}

            <TextField
              label="Merk"
              name="brand"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              error={fieldErrors.brand}
              hint="Opsional. Dipakai untuk filter katalog dan listing marketplace."
              placeholder="Royal Canin"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="isPreorder"
              checked={isPreorder}
              onCheckedChange={(checked) => setIsPreorder(checked === true)}
            />
            <div>
              <Label htmlFor="isPreorder">Produk pre-order</Label>
              <p className="text-xs text-muted">
                Boleh dipesan walau stok kosong. Dibaca POS dan sinkronisasi
                e-commerce.
                {/* Unlike hasExpiry, this does NOT cascade — it is a per-SKU
                    availability statement, and stock is held per variant.
                    Saying so is what stops somebody expecting the checkbox to
                    behave like the one directly below it. */}
                {mode === "variants" &&
                  " Setelan ini milik induk saja; atur per varian di tabel varian."}
              </p>
            </div>
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
                  {/* On an EXISTING family the change cascades, which is a bigger
                      action than the checkbox looks. Saying so here is cheaper
                      than a user discovering it from a stock card six weeks on. */}
                  {mode === "variants" &&
                    (existing
                      ? " Mengubahnya ikut mengubah SEMUA varian produk ini — setelan ini milik induk, bukan milik ukurannya."
                      : " Varian mewarisi setelan ini dari induknya.")}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------- description */}
      <Card
        title="Deskripsi"
        description="Dipublikasikan ke marketplace dan website. Boleh menyisipkan gambar."
      >
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="Ceritakan produknya — komposisi, cara pakai, ukuran kemasan."
          error={fieldErrors.description}
        />
      </Card>

      {/* ---------------------------------------------------------- media */}
      {/* On a family this is the PARENT's gallery. Each variant gets its own
          single image in the variant table — nine images per size is a gallery
          nobody curates and a POS tile nobody can pick from. */}
      <Card
        title="Foto & video produk"
        description="Yang pertama jadi gambar utama di katalog, POS dan marketplace."
      >
        <MediaGallery
          value={media}
          onChange={setMedia}
          error={fieldErrors.media}
        />
      </Card>

      {/* ------------------------------------------------------- shipping */}
      {/* On a family this is the PARENT's shipping — the variant rows inherit
          it, and only the rows that genuinely weigh something else say so. */}
      <ShippingFieldsCard
        value={shipping}
        onChange={setShipping}
        derivedWeightGrams={componentWeightGrams}
        unweighedComponents={unweighedComponents}
        errors={{
          weight: fieldErrors["shipping.weight"],
          weightUnit: fieldErrors["shipping.weightUnit"],
          length: fieldErrors["shipping.length"],
          width: fieldErrors["shipping.width"],
          height: fieldErrors["shipping.height"],
          packageContents: fieldErrors["shipping.packageContents"],
        }}
      />

      {/* ----------------------------------------------------- accounting */}
      <Card title="Akuntansi">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted">
            {/* WHAT THE USER NEEDS, not why we decided it.

                This said "diisi sekarang karena di sinilah tenant tahu
                jawabannya; menanyakannya belakangan berarti menanyakannya untuk
                setiap produk sekaligus" — a justification of OUR design choice,
                aimed at a developer. Why we ask now is not the user's problem;
                the reasoning belongs in the changelog. What they actually need
                is whether they may skip it and whether skipping breaks
                anything. */}
            Opsional — boleh dikosongkan. Menentukan ke mana penjualan produk ini
            dicatat nanti saat modul penjualan aktif; untuk sekarang belum
            berpengaruh ke laporan mana pun.
            {mode === "variants" && " Varian mengikuti setelan induk."}
          </p>

          {accountingError ? (
            /**
             * REPORTS WHAT HAPPENED, RATHER THAN DIAGNOSING IT.
             *
             * This block used to assert "your role has no access to Accounting"
             * for any failure at all — and the first real failure was a
             * malformed request from our own service layer (a page size above
             * the API's cap, answered 400). The screen was confidently wrong,
             * and it sent people looking at RBAC instead of at the bug.
             *
             * 403 is the one status that genuinely IS a permissions answer.
             * Everything else gets the server's own message, which is the thing
             * that actually helps whoever has to fix it.
             */
            <p className="rounded-lg border border-secondary/40 bg-secondary/15 px-3 py-2 text-xs">
              {accountingError.status === 403 ? (
                <>
                  Role Anda tidak punya akses ke Akuntansi, jadi daftar akun dan
                  lini bisnis tidak bisa dimuat.
                </>
              ) : (
                <>
                  Daftar akun dan lini bisnis gagal dimuat
                  {accountingError.status > 0 && ` (${accountingError.status})`}:{" "}
                  {accountingError.message}
                </>
              )}{" "}
              Produk tetap bisa disimpan tanpa keduanya.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salesAccountId">Akun penjualan</Label>
                <Select
                  value={salesAccountId}
                  onValueChange={setSalesAccountId}
                  disabled={salesAccounts.length === 0}
                >
                  {/* w-fit by default — see the note on the category select. */}
                  <SelectTrigger id="salesAccountId" className="w-full">
                    <SelectValue
                      placeholder={
                        salesAccounts.length === 0
                          ? "Belum ada akun pendapatan"
                          : "Pilih akun"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {salesAccounts.map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {account.code} — {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted">
                  Hanya akun bertipe pendapatan. Menentukan ke mana penjualan
                  produk ini dikreditkan.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="businessLineId">Lini bisnis</Label>
                <Select
                  value={businessLineId}
                  onValueChange={setBusinessLineId}
                  disabled={businessLines.length === 0}
                >
                  <SelectTrigger id="businessLineId" className="w-full">
                    <SelectValue
                      placeholder={
                        businessLines.length === 0
                          ? "Belum ada lini bisnis"
                          : "Pilih lini bisnis"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {businessLines.map((line) => (
                      <SelectItem key={line._id} value={line._id}>
                        {line.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted">
                  Tagging jurnal — memisahkan laporan Grooming, Hotel dan Retail.
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
              HPP tidak diisi manual. Ia terbentuk sendiri dari penerimaan
              barang sebagai rata-rata tertimbang.
            </p>
          </div>
        </Card>
      )}

      {/* -------------------------------------------------------- variants */}
      {mode === "variants" && (
        <>
          <VariantAxisEditor
            axes={axes}
            onChange={setAxes}
            lockedValues={lockedValues}
          />
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
                    <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                      <th className="px-2 py-2 text-left font-medium">
                        Varian
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        SKU <span className="text-danger">*</span>
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        Barcode
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        Harga jual
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        Min stok
                      </th>
                      {/* The drawer toggle. Unlabelled because the button in
                          each row carries its own aria-label with the variant
                          name in it. */}
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {variantRows.map((row) => {
                      const key = row.combo.join("|");
                      const rowError = rowErrors[key];

                      const open = expandedRows.has(key);

                      return (
                        <Fragment key={key}>
                        <tr className="border-b border-border/60">
                          <td className="px-2 py-2 font-medium">
                            <div className="flex items-center gap-2">
                              {/* The image cell — one click opens the picker for
                                  this row. A whole column of upload controls
                                  would be five more columns in a table that is
                                  already scrolling sideways. */}
                              <VariantImageCell
                                row={row}
                                onChange={(asset: ProductMedia | null) =>
                                  setVariantField(row.combo, "image", asset)
                                }
                              />
                              <span>
                                {row.combo.join(" / ")}
                                {row.id && (
                                  <Badge variant="outline" className="ml-2">
                                    sudah ada
                                  </Badge>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            {/* The requirement lives here now that the parent
                                has none, so the refusal does too — a family of
                                twelve rows told only "a SKU is missing" above
                                the table is a hunt. Every row refusal is bound
                                to this cell, including the API's. */}
                            <Input
                              aria-label={`SKU ${row.combo.join(" ")}`}
                              aria-invalid={rowError ? true : undefined}
                              aria-describedby={
                                rowError
                                  ? `variant-sku-error-${key}`
                                  : undefined
                              }
                              value={row.sku}
                              onChange={(event) =>
                                setVariantField(
                                  row.combo,
                                  "sku",
                                  event.target.value.toUpperCase(),
                                )
                              }
                              className="font-mono text-xs"
                            />
                            {rowError && (
                              <p
                                id={`variant-sku-error-${key}`}
                                role="alert"
                                className="mt-1 text-xs text-danger"
                              >
                                {rowError}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              aria-label={`Barcode ${row.combo.join(" ")}`}
                              value={row.barcode}
                              onChange={(event) =>
                                setVariantField(
                                  row.combo,
                                  "barcode",
                                  event.target.value,
                                )
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
                                setVariantField(
                                  row.combo,
                                  "sellPrice",
                                  event.target.value,
                                )
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
                                setVariantField(
                                  row.combo,
                                  "minStock",
                                  event.target.value,
                                )
                              }
                              className="max-w-20 font-mono"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              aria-label={`Detail ${row.combo.join(" ")}`}
                              aria-expanded={open}
                              onClick={() =>
                                setExpandedRows((previous) => {
                                  const next = new Set(previous);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                })
                              }
                              className="rounded px-1 text-muted hover:text-foreground"
                            >
                              {open ? "▾" : "▸"}
                            </button>
                          </td>
                        </tr>

                        {open && (
                          /* EXPANDED IN PLACE rather than in a dialog, because
                             the user is comparing rows — "the 10 kg should be
                             heavier than the 3 kg" — and a modal hides exactly
                             the comparison they opened it to make. */
                          <tr className="border-b border-border/60 bg-accent/30">
                            <td colSpan={6} className="px-2 py-3">
                              <p className="mb-2 text-xs text-muted">
                                Kosongkan untuk mengikuti induk. Angka di
                                placeholder adalah nilai induk.
                              </p>
                              <div className="grid gap-3 sm:grid-cols-5">
                                {(
                                  [
                                    ["weight", "Berat"],
                                    ["length", "Panjang"],
                                    ["width", "Lebar"],
                                    ["height", "Tinggi"],
                                  ] as const
                                ).map(([field, label]) => (
                                  <label
                                    key={field}
                                    className="flex flex-col gap-1 text-xs"
                                  >
                                    <span className="text-muted">{label}</span>
                                    <Input
                                      aria-label={`${label} ${row.combo.join(" ")}`}
                                      inputMode="decimal"
                                      value={row[field]}
                                      onChange={(event) =>
                                        setVariantField(
                                          row.combo,
                                          field,
                                          event.target.value,
                                        )
                                      }
                                      /* The PARENT's value, shown through the
                                         empty input. Never bound as the value —
                                         that is what would turn an inherited
                                         row into an override on save. */
                                      placeholder={
                                        shipping[field] || "ikut induk"
                                      }
                                      className="font-mono"
                                    />
                                  </label>
                                ))}
                                <label className="flex flex-col gap-1 text-xs">
                                  <span className="text-muted">Satuan</span>
                                  <Select
                                    value={row.weightUnit}
                                    onValueChange={(value) =>
                                      setVariantField(
                                        row.combo,
                                        "weightUnit",
                                        value,
                                      )
                                    }
                                  >
                                    <SelectTrigger
                                      aria-label={`Satuan berat ${row.combo.join(" ")}`}
                                      className="w-full"
                                    >
                                      <SelectValue
                                        placeholder={
                                          shipping.weightUnit || "ikut induk"
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="gr">gram</SelectItem>
                                      <SelectItem value="kg">kg</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </label>
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {fieldErrors.variantPrices && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {fieldErrors.variantPrices}
              </p>
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
                  onValueChange={(value) =>
                    setPricingMode(value as BundlePricingMode)
                  }
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
                    <SelectItem value="fixed">
                      Tetap — saya isi manual
                    </SelectItem>
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

          {bundleCandidates.error && (
            <Alert variant="error">{bundleCandidates.error}</Alert>
          )}

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
            berkurang — satu baris{" "}
            <span className="font-mono">bundle_consume</span> per komponen di
            kartu stok.
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

              {fieldErrors.openingWarehouse && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.openingWarehouse}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="openingWarehouse">Masuk ke gudang</Label>
                  <Select
                    value={openingWarehouseId}
                    onValueChange={setOpeningWarehouseId}
                  >
                    <SelectTrigger
                      id="openingWarehouse"
                      aria-label="Masuk ke gudang"
                      className="w-full"
                    >
                      <SelectValue placeholder="Pilih gudang" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
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
                      required
                      inputMode="decimal"
                      value={openingQty}
                      onChange={(event) => setOpeningQty(event.target.value)}
                      error={fieldErrors.openingQty}
                      placeholder="12"
                    />
                    <TextField
                      label="Harga beli per unit"
                      name="openingCost"
                      required
                      inputMode="decimal"
                      value={openingCost}
                      onChange={(event) => setOpeningCost(event.target.value)}
                      error={fieldErrors.openingCost}
                      hint="Membentuk HPP awal dan jurnal persediaan stok awal. Isi 0 untuk barang donasi."
                      placeholder="44000"
                    />
                  </>
                )}
              </div>

              {/* The lot these opening goods belong to. One code and one date
                  for the whole entry, including a family's — an opening balance
                  is entered in one sitting for goods that arrived together, and
                  a batch column per variant row would ask twelve times for the
                  same answer. */}
              {hasExpiry && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField
                    label="Kode batch"
                    name="openingBatchCode"
                    value={openingBatchCode}
                    onChange={(event) =>
                      setOpeningBatchCode(event.target.value)
                    }
                    error={fieldErrors.openingBatchCode}
                    hint="Wajib untuk produk kedaluwarsa."
                    placeholder="B-2026-08"
                    className="font-mono"
                  />
                  <TextField
                    label="Tanggal kedaluwarsa"
                    name="openingExpiryDate"
                    type="date"
                    value={openingExpiryDate}
                    onChange={(event) =>
                      setOpeningExpiryDate(event.target.value)
                    }
                    error={fieldErrors.openingExpiryDate}
                  />
                </div>
              )}

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
                        <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                          <th className="px-2 py-2 text-left font-medium">
                            Varian
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            Stok awal *
                          </th>
                          <th className="px-2 py-2 text-left font-medium">
                            Harga beli / unit *
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {variantRows.map((row) => (
                          <tr
                            key={row.combo.join("|")}
                            className="border-b border-border/60"
                          >
                            <td className="px-2 py-2 font-medium">
                              {row.combo.join(" / ")}
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                aria-label={`Stok awal ${row.combo.join(" ")}`}
                                inputMode="decimal"
                                value={row.openingQty}
                                onChange={(event) =>
                                  setVariantField(
                                    row.combo,
                                    "openingQty",
                                    event.target.value,
                                  )
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
                                  setVariantField(
                                    row.combo,
                                    "openingCost",
                                    event.target.value,
                                  )
                                }
                                placeholder="44000"
                                className="max-w-32 font-mono"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-muted">
                      Varian yang dikosongkan dibuat tanpa stok. Tidak semua
                      harus diisi — tapi minimal satu varian wajib punya jumlah,
                      dan varian yang diberi stok wajib punya harga beli, karena
                      angka itulah yang membentuk jurnal persediaan stok awal.
                    </p>
                  </div>
                ))}

              {fieldErrors.openingVariants && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.openingVariants}
                </p>
              )}

              {fieldErrors.openingCostVariants && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.openingCostVariants}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving
            ? "Menyimpan…"
            : existing
              ? "Simpan perubahan"
              : "Simpan produk"}
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
