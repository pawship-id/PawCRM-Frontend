"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { usePetOptions } from "@/hooks/usePetOptions";
import type { PetOptionId } from "@/types/api";

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
 * `dog` is whatever this shop calls it. A sentence that needs the word (the
 * print card, the booking work screen) resolves it the same two ways.
 *
 * `label` IS THE SERVER'S ANSWER AND IS PREFERRED (25 September 2026). A pet
 * stores the option's `_id` now, and `usePetOptions().label()` cannot name one
 * until the tenant's list has loaded — which would leave this badge empty on
 * first paint, where a code used to at least read as itself. The response
 * carries the resolved word, so the hook is the fallback rather than the
 * source.
 */
export function PetSpeciesBadge({
  species,
  label: resolved,
}: {
  /** The option's `_id`. */
  species: PetOptionId;
  /** `pet.speciesLabel` — what the server resolved on read. */
  label?: string | null;
}) {
  const { label } = usePetOptions();
  const word = resolved ?? label("species", species);

  if (!word) return null;

  return (
    <Badge variant="outline" className="border-transparent bg-navy-100 text-primary">
      {word}
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
