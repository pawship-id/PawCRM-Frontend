import type { SupplierAddress } from "@/types/api";

/**
 * A supplier's address as ONE readable line — "Jl. Rungkut Industri 21,
 * Surabaya, Jawa Timur 60293, Indonesia".
 *
 * WHY THIS EXISTS AT ALL, when the address is stored as parts. The parts are
 * stored because software needs them apart: a shipping integration wants the
 * postcode alone and a tax report groups by province. A HUMAN reading a supplier
 * row wants the opposite — one line they can scan — and every screen that
 * assembled it inline would pick its own separators and its own answer to "what
 * if only the city is filled in".
 *
 * BUILT FROM WHATEVER IS PRESENT, never with placeholders for the rest. A vendor
 * known only by its city renders as "Surabaya", not as ", Surabaya, , ," — an
 * address is completed over time and a half-filled one is the ordinary case, not
 * an error state.
 *
 * THE POSTCODE JOINS THE PROVINCE with a space rather than a comma, because that
 * is how a postal address is written: "Jawa Timur 60293" is one field to a
 * postal service, and ", 60293" on its own line reads as a separate entry.
 *
 * Returns `null` when nothing is recorded, so callers choose their own em dash
 * rather than being handed a string that looks like content.
 */
export function formatSupplierAddress(
  address: SupplierAddress | null | undefined,
): string | null {
  if (!address) return null;

  const provinceAndPostal = [address.province, address.postalCode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  const line = [
    address.street?.trim(),
    address.city?.trim(),
    provinceAndPostal,
    address.country?.trim(),
  ]
    .filter(Boolean)
    .join(", ");

  return line === "" ? null : line;
}
