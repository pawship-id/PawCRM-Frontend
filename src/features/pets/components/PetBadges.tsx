"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { usePetOptions } from "@/hooks/usePetOptions";
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

/**
 * The pet's species, in the tenant's own word.
 *
 * NO LABEL MAP HERE, and there used to be three. Species, breeds, sizes and
 * coats became tenant data on 14 September 2026 (`petoptions`), so the word for
 * `dog` is whatever this shop calls it — `usePetOptions().label()` is the one
 * place that knows, falling back to the seeded word and then the code. A
 * sentence that needs the word (the print card, the booking work screen) calls
 * the same hook rather than a helper exported from here.
 */
export function PetSpeciesBadge({ species }: { species: PetSpecies }) {
  const { label } = usePetOptions();

  return (
    <Badge variant="outline" className="border-transparent bg-navy-100 text-primary">
      {label("species", species)}
    </Badge>
  );
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
