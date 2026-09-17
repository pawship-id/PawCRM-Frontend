import type { VariantChoiceSnapshot, ZoneSnapshot } from "@/types/api";

/**
 * What a sold service line was priced on beyond the animal, as one muted line —
 * "Lokasi: Di Rumah · Zona A" (17 September 2026).
 *
 * READ FROM THE LINE'S OWN SNAPSHOT, never from the catalogue: a card renamed
 * or a zone redrawn after the sale must not change what the basket says it was
 * sold as.
 *
 * NULL when there is nothing beyond the pet — the ordinary grooming carries no
 * extra caption.
 */
export function variantDetailOf(line: {
  variantChoices?: Pick<VariantChoiceSnapshot, "name" | "label">[] | null;
  zone?: Pick<ZoneSnapshot, "name"> | null;
}): string | null {
  const parts = (line.variantChoices ?? []).map(
    (choice) => `${choice.name}: ${choice.label}`,
  );

  if (line.zone?.name) parts.push(line.zone.name);

  return parts.length > 0 ? parts.join(" · ") : null;
}
