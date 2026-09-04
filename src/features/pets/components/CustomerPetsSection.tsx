"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { Pet } from "@/types/api";

import { usePets } from "../hooks/usePets";
import { PetSpeciesBadge, PetStatusBadge } from "./PetBadges";
import { PetQuickAddDialog } from "./PetQuickAddDialog";

/**
 * One customer's animals, for the customer detail screen.
 *
 * LIVES IN THE PETS FEATURE, not in customers, even though only the customer
 * screen renders it. It reads pet data, calls pet services and gates on the
 * `pets` permission — putting it under customers would mean that feature
 * importing a hook, a service and two badges from this one, which is the whole
 * dependency pointed the wrong way. The customers feature imports one component
 * from this feature's public surface instead.
 *
 * A LIST, NOT A TABLE. The full register at Master Data → Hewan is the table;
 * here the question is only "who lives with this person", and six columns of
 * grooming detail would push the customer's own fields off the screen.
 *
 * RETIRED PETS ARE SHOWN. `isActive: false` means the animal is no longer in the
 * shop's care, but it still belongs to this owner and its history is still filed
 * under them — hiding it here would make the section disagree with the delete
 * guard, which counts them and refuses to remove the customer.
 */

/** One page of pets is what this section shows. See the note below the list. */
function PetRow({ pet }: { pet: Pet }) {
  return (
    <li className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{pet.name}</span>
          <PetSpeciesBadge species={pet.species} />
          {/* Only when it is NOT the ordinary state — a "Dirawat" badge on every
              row would be noise on a list where that is true of almost all. */}
          {!pet.isActive && <PetStatusBadge isActive={false} deleted={false} />}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {[
            pet.breed,
            pet.weightKg === null ? null : `${pet.weightKg} kg`,
          ]
            .filter(Boolean)
            .join(" · ") || "Ciri-cirinya belum dilengkapi"}
        </p>
      </div>
      <Can feature="pets" action="update">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/dashboard/master/pets/${pet._id}`}>
            <Pencil className="size-4" />
            Ubah
          </Link>
        </Button>
      </Can>
    </li>
  );
}

export function CustomerPetsSection({
  customerId,
  customerName,
  /** True when the customer is soft-deleted — no point offering to add to it. */
  disabled = false,
}: {
  customerId: string;
  customerName?: string;
  disabled?: boolean;
}) {
  const { pets, pagination, loading, error, refetch } = usePets(customerId);
  const [adding, setAdding] = useState(false);

  const hidden = pagination.total - pets.length;

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}

      {loading && pets.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Spinner /> Memuat daftar hewan…
        </div>
      ) : pets.length === 0 ? (
        /* §12's empty state: say what is missing and offer the next step, never
           "No data available". */
        <p className="py-6 text-sm text-muted">
          Belum ada hewan terdaftar atas nama pelanggan ini.
        </p>
      ) : (
        <ul className={loading ? "opacity-60" : undefined}>
          {pets.map((pet) => (
            <PetRow key={pet._id} pet={pet} />
          ))}
        </ul>
      )}

      {/*
        A breeder with more than one page of animals is rare but real. The count
        is stated rather than paged here — this section is a summary, and the
        register is where a long list belongs. No "lihat semua" link, because the
        register screen does not read a customer filter from the URL yet; a link
        that quietly showed every animal in the shop would be worse than none.
      */}
      {hidden > 0 && (
        <p className="text-xs text-muted">
          {hidden} hewan lainnya tidak ditampilkan di sini. Semuanya ada di
          Master Data → Hewan.
        </p>
      )}

      {!disabled && (
        <Can feature="pets" action="create">
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" />
              Tambah hewan
            </Button>
          </div>
        </Can>
      )}

      <PetQuickAddDialog
        customerId={customerId}
        customerName={customerName}
        open={adding}
        onOpenChange={setAdding}
        // Refetch rather than splicing the new pet in: the list is server-ordered
        // (newest first) and a local insert would be a second ordering rule to
        // keep in step with the repository's.
        onCreated={refetch}
      />
    </div>
  );
}
