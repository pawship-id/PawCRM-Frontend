import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { PetSpecies } from "@/types/api";

/**
 * Badges for a pet row.
 *
 * A pet has TWO independent axes, so they are two badges rather than one: it is
 * either still in the tenant's care or retired (`isActive`), and separately
 * either live or soft-deleted (`deletedAt`). See the Pet type for why one flag
 * could not say both.
 *
 * EVERY BADGE CARRIES A WORD — ui-rules §1.3. Status is never communicated by
 * colour alone, which is also why the species badge spells the species out
 * rather than tinting a dot.
 *
 * NOT the shared `<StatusBadge tone label>` ui-rules §9 calls for, because that
 * component is specified and not yet built. Building it belongs to whoever
 * migrates the fifteen existing feature-local badges, not to this module in
 * passing — but this file is deliberately small so it folds into that migration
 * cleanly.
 */

/** Indonesian labels — the visible word is copy, not the API's value. §12. */
const SPECIES_LABELS: Record<PetSpecies, string> = {
  cat: "Kucing",
  dog: "Anjing",
};

/** The pet's species, spelled out. */
export function PetSpeciesBadge({ species }: { species: PetSpecies }) {
  return (
    <Badge variant="outline" className="border-transparent bg-navy-100 text-primary">
      {SPECIES_LABELS[species]}
    </Badge>
  );
}

/** Plain label for the species — for a picker or a sentence, where a badge would be noise. */
export function speciesLabel(species: PetSpecies): string {
  return SPECIES_LABELS[species];
}

/**
 * The two facts that decide a grooming price, spelled out.
 *
 * HERE BESIDE `speciesLabel` because they are the same kind of thing and were
 * being retyped: `PetInfoTab` had its own copies, and so did the booking form's
 * variant editor. Three spellings of "Berbulu panjang" is how one screen ends up
 * disagreeing with another about the animal in front of them.
 */
const SIZE_LABELS: Record<string, string> = {
  small: "Kecil",
  medium: "Sedang",
  large: "Besar",
};

const FUR_LABELS: Record<string, string> = {
  "long hair": "Bulu panjang",
  "short hair": "Bulu pendek",
};

/** `"large"` → `"Besar"`. Unknown values pass through rather than blanking. */
export function sizeLabel(size: string | null | undefined): string | null {
  return size ? (SIZE_LABELS[size] ?? size) : null;
}

/** `"long hair"` → `"Bulu panjang"`. */
export function furTypeLabel(furType: string | null | undefined): string | null {
  return furType ? (FUR_LABELS[furType] ?? furType) : null;
}

/**
 * Whether the pet is live, retired, or soft-deleted.
 *
 * Deleted wins over retired when both are true: a record that should not exist
 * is a more urgent thing to say than one that is merely no longer in care.
 */
export function PetStatusBadge({
  isActive,
  deleted,
}: {
  isActive: boolean;
  deleted: boolean;
}) {
  const { label, className } = deleted
    ? { label: "Terhapus", className: "bg-muted/40 text-muted" }
    : isActive
      ? { label: "Dirawat", className: "bg-success/12 text-success" }
      : { label: "Tidak aktif", className: "bg-muted/40 text-muted" };

  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}
