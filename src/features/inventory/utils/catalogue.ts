import { sumDecimals } from "@/utils/decimal";
import type { Product, ProductStockRow, VariantAxis } from "@/types/inventory";

/**
 * Pure catalogue helpers shared by the list and the form.
 *
 * Everything here works on the shapes `/api/products` returns, so neither screen
 * has to know which of the three stock-ish fields a product type carries, and
 * neither reaches into the demo store to find out.
 */

/**
 * Which locations a quantity on screen is reported for: any number of warehouse
 * ids, where EMPTY MEANS EVERY ONE OF THEM.
 *
 * Empty rather than a list of all the ids, because "all" and "these ten, which
 * happen to be all of them" are different questions once a warehouse is
 * inactive or soft-deleted: a product can still hold stock somewhere the
 * warehouse dropdown no longer offers, and an empty scope counts it while an
 * enumerated one would quietly drop it from the total.
 */
export type WarehouseScope = readonly string[];

/**
 * The rows a scope covers — every row when it is empty.
 *
 * Generic over the row, so the plain per-warehouse quantities and a bundle's
 * availability rows (which carry `limitedBy` too) both come back as themselves
 * rather than widened to the narrower shape.
 */
function rowsInScope<Row extends { warehouseId: string }>(
  rows: Row[] | undefined,
  scope: WarehouseScope,
): Row[] {
  if (scope.length === 0) return rows ?? [];

  return (rows ?? []).filter((row) => scope.includes(String(row.warehouseId)));
}

/**
 * What a per-warehouse array adds up to across the scope.
 *
 * A missing row counts as zero rather than null: absent means the product has
 * never had stock there, and a stock column showing "—" for that would read as
 * "not known" when it is known and it is none. The one place absence IS
 * meaningful — a parent whose variants have no rows at all — is the caller's.
 *
 * The total goes through sumDecimals rather than `+`, because these are decimal
 * STRINGS the backend sent precisely so they never touch a float.
 */
export function qtyIn(
  rows: ProductStockRow[] | undefined,
  scope: WarehouseScope,
): string {
  return sumDecimals(rowsInScope(rows, scope).map((row) => row.qty));
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
 *
 * A scope covering more than one warehouse sums the chosen field. For a bundle
 * that total is an UPPER BOUND rather than a plan — components cannot be pooled
 * across locations, so four buildable here and three there is not seven
 * buildable anywhere. Both screens say so beside the figure.
 */
export function stockOf(product: Product, scope: WarehouseScope): string {
  if (product.productType === "bundle") {
    return qtyIn(product.bundleAvailability, scope);
  }
  if (product.productType === "parent") {
    return qtyIn(product.variantStock, scope);
  }
  return qtyIn(product.stockByWarehouse, scope);
}

/**
 * How many warehouses the bundle's "bisa dibuat" figure is spread over.
 *
 * The backend emits one row per location where any component has stock, so this
 * is what tells a screen whether its number describes one shelf or several
 * added together — the difference between a count and an upper bound.
 */
export function availabilitySpread(
  product: Product,
  scope: WarehouseScope,
): number {
  return rowsInScope(product.bundleAvailability, scope).length;
}

/**
 * The bundle component that caps availability, when the scope leaves exactly one
 * warehouse to be capped.
 *
 * Null across several: each location has its own limiting component, and naming
 * one of them beside a total spanning all of them would be a claim about the
 * total that is not true. One row IS the whole answer, though, however the scope
 * arrived at it — so a bundle whose components only live in one warehouse names
 * its cap even under "Semua gudang".
 */
export function limitedByAt(
  product: Product,
  scope: WarehouseScope,
): string | null {
  const rows = rowsInScope(product.bundleAvailability, scope);

  return rows.length === 1 ? (rows[0].limitedBy ?? null) : null;
}

/**
 * Every combination the axes describe — the cartesian product, in axis order.
 *
 * `[{Ukuran:[1kg,3kg]},{Rasa:[Chicken]}]` becomes `[["1kg","Chicken"],
 * ["3kg","Chicken"]]`. Axes with no values contribute nothing, so a
 * half-filled-in axis produces no rows rather than a row with a hole in it.
 *
 * NONE OF THEM FILLED IN IS NO COMBINATIONS, not one empty one. The cartesian
 * product of nothing is mathematically `[[]]`, and the form rendered that
 * faithfully: a table saying "1 kombinasi" with a nameless row, a SKU of
 * "SDS-", and a refusal reading "Harga jual belum benar pada varian ." — for a
 * variant the user had not described yet.
 */
export function variantCombinations(axes: VariantAxis[]): string[][] {
  const usable = axes.filter((axis) => axis.values.length > 0);
  if (usable.length === 0) return [];

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

/**
 * What a variant row's SKU is built on.
 *
 * The parent's own SKU when it has one — but a parent NEED NOT have one, and
 * leaving the field empty is now the ordinary case rather than an oversight. So
 * the fallback is the product NAME rather than a literal, which is the only
 * other thing on the form that identifies the family: "Makanan Kucing Premium"
 * seeds `MAKANANKUCING-1KG` instead of twelve rows all called `SKU-…`.
 *
 * The name is stripped to what a SKU may contain (the API's pattern is
 * `^[A-Z0-9][A-Z0-9._-]{0,39}$`) and capped well under the 40-character limit,
 * so the combination suffix still fits. A name with nothing usable in it —
 * punctuation only — falls back to "SKU" as before.
 */
export function skuPrefix(baseSku: string, name: string): string {
  const trimmed = baseSku.trim().toUpperCase();
  if (trimmed !== "") return trimmed;

  const fromName = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);

  return fromName || "SKU";
}

/** The SKU a variant row starts with: the family's prefix, then its values. */
export function defaultVariantSku(prefix: string, combo: string[]): string {
  return `${prefix}-${combo
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
