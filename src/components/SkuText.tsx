import { SKU_WRAP_CHARS, SKU_WRAP_CLASS } from "@/lib/sku";

/**
 * An SKU in a list or picker: the full code, wrapped onto further lines when it
 * is longer than the column (see `SKU_WRAP_CLASS`).
 */
export function SkuText({
  value,
  fallback = "",
}: {
  value: string | null | undefined;
  /** Shown when there is no SKU — a parent product, a service line. */
  fallback?: string;
}) {
  if (!value) return <>{fallback}</>;
  if (value.length <= SKU_WRAP_CHARS) return <>{value}</>;

  return <span className={SKU_WRAP_CLASS}>{value}</span>;
}
