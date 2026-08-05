import type {
  Product,
  ProductStockRow,
  VariantAxis,
} from "@/types/inventory";

/**
 * Pure catalogue helpers shared by the list and the form.
 *
 * Everything here works on the shapes `/api/products` returns, so neither screen
 * has to know which of the three stock-ish fields a product type carries, and
 * neither reaches into the demo store to find out.
 */

/**
 * One warehouse's quantity out of a per-warehouse array.
 *
 * A missing row is `"0"` rather than null: absent means the product has never
 * had stock there, and a stock column showing "—" for that would read as "not
 * known" when it is known and it is none. The one place absence IS meaningful —
 * a parent whose variants have no rows at all — is handled by the caller.
 */
export function qtyAt(
  rows: ProductStockRow[] | undefined,
  warehouseId: string,
): string {
  return (
    rows?.find((row) => String(row.warehouseId) === warehouseId)?.qty ?? "0"
  );
}

/**
 * What the Stok column shows, which is a different question per type:
 *
 *   parent — its VARIANTS' total (`variantStock`), because it holds none itself;
 *   bundle — how many can be BUILT (`bundleAvailability`), since it keeps none;
 *   others — what is actually on the shelf (`stockByWarehouse`).
 *
 * All three come from the backend already computed. The screen picks the field
 * that answers the question its row is asking.
 */
export function stockOf(product: Product, warehouseId: string): string {
  if (product.productType === "bundle") {
    return qtyAt(product.bundleAvailability, warehouseId);
  }
  if (product.productType === "parent") {
    return qtyAt(product.variantStock, warehouseId);
  }
  return qtyAt(product.stockByWarehouse, warehouseId);
}

/** The bundle component that caps availability at this warehouse, if any. */
export function limitedByAt(
  product: Product,
  warehouseId: string,
): string | null {
  return (
    product.bundleAvailability?.find(
      (row) => String(row.warehouseId) === warehouseId,
    )?.limitedBy ?? null
  );
}

/**
 * Every combination the axes describe — the cartesian product, in axis order.
 *
 * `[{Ukuran:[1kg,3kg]},{Rasa:[Chicken]}]` becomes `[["1kg","Chicken"],
 * ["3kg","Chicken"]]`. Axes with no values contribute nothing, so a
 * half-filled-in axis produces no rows rather than a row with a hole in it.
 */
export function variantCombinations(axes: VariantAxis[]): string[][] {
  const usable = axes.filter((axis) => axis.values.length > 0);

  return usable.reduce<string[][]>(
    (combos, axis) =>
      combos.flatMap((combo) => axis.values.map((value) => [...combo, value])),
    [[]],
  );
}

/**
 * The `variantAttributes` object for one combination.
 *
 * Keyed by axis NAME, which is what the API matches against the parent's axes —
 * the positional array is only how the form carries it around.
 */
export function attributesFor(
  axes: VariantAxis[],
  combo: string[],
): Record<string, string> {
  const usable = axes.filter((axis) => axis.values.length > 0);

  return Object.fromEntries(
    usable.map((axis, index) => [axis.name.trim(), combo[index]]),
  );
}

/** The SKU a variant row starts with: the parent's, then its values. */
export function defaultVariantSku(baseSku: string, combo: string[]): string {
  const base = (baseSku || "SKU").toUpperCase();
  return `${base}-${combo
    .map((value) => value.toUpperCase().replace(/\s+/g, ""))
    .join("-")}`;
}

/** Match an existing variant to a combination by its stored attributes. */
export function matchVariant(
  variants: Product[],
  axes: VariantAxis[],
  combo: string[],
): Product | undefined {
  const wanted = attributesFor(axes, combo);
  const keys = Object.keys(wanted);

  return variants.find((variant) => {
    const attributes = variant.variantAttributes ?? {};
    return (
      Object.keys(attributes).length === keys.length &&
      keys.every((key) => attributes[key] === wanted[key])
    );
  });
}
