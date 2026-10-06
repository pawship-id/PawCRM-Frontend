import { shortSku } from "@/lib/sku";

/**
 * An SKU, shortened for a list or picker. The full code is the hover title, so a
 * truncated one can still be read. Short codes render exactly as before.
 *
 * Not for the product detail page, which shows the whole code.
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

  const short = shortSku(value);
  if (short === value) return <>{value}</>;

  return <span title={value}>{short}</span>;
}
