"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { customerService } from "@/services/customer.service";
import type { Pet } from "@/types/api";

import { PetSpeciesBadge, PetStatusBadge } from "./PetBadges";

const SEX_LABELS: Record<string, string> = {
  male: "Jantan",
  female: "Betina",
  unknown: "Tidak diketahui",
};

/** A date somebody reads. */
function day(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";
}

/**
 * How old the animal is TODAY, computed from the birth date.
 *
 * THE DATE IS WHAT IS STORED, and this is why: an age written down is wrong the
 * day after it is written. Shown beside the date rather than instead of it, so
 * the fact and the derived figure are both visible.
 */
function age(iso: string | null): string | null {
  if (!iso) return null;

  const months = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );

  if (months < 1) return "belum 1 bulan";
  if (months < 24) return `${months} bulan`;

  return `${Math.floor(months / 12)} tahun`;
}

/**
 * The pet's own details — READ, not edit.
 *
 * WHY IT IS NOT THE FORM. This tab used to mount `PetForm`, so "look at the
 * animal" and "change the animal" were the same screen. Two things went wrong
 * with that, and the second is the reason it changed:
 *
 *   A FORM ANSWERS IN FIELD VALUES. The owner rendered as a disabled select
 *   holding a customer id, because that is what a form field holds. Somebody
 *   opening a profile to see whose dog this is read `6a9797bacc28e96138ba7764`.
 *
 *   AND IT ASKS FOR A PERMISSION IT DOES NOT NEED. Three of this page's four
 *   tabs are things to LOOK at; a groomer who may not edit an animal still has
 *   to know it is allergic to something. Mounting an edit form on the landing
 *   tab meant the whole page was gated on `update`.
 *
 * Editing has its own route now — `/dashboard/master/pets/:id/edit` — behind its
 * own gate, and the button to it is hidden from anybody who cannot use it.
 */
export function PetInfoTab({ pet }: { pet: Pet }) {
  const [ownerName, setOwnerName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    customerService
      .getById(pet.customerId)
      .then((customer) => {
        if (active) setOwnerName(customer.name);
      })
      /* The row below falls back to saying so rather than showing an id. */
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [pet.customerId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PetSpeciesBadge species={pet.species} />
          <PetStatusBadge isActive={pet.isActive} deleted={pet.deletedAt !== null} />
        </div>

        <Can feature="pets" action="update">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/dashboard/master/pets/${pet._id}/edit`}>
              Ubah data hewan
            </Link>
          </Button>
        </Can>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Row
          label="Pemilik"
          value={
            ownerName ? (
              /* A LINK, because "whose dog is this" is usually followed by
                 "what else do they have" or "what do they owe". */
              <Link
                href={`/dashboard/master/customers/${pet.customerId}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {ownerName}
              </Link>
            ) : (
              "Memuat…"
            )
          }
        />
        <Row label="Ras" value={pet.breed ?? "—"} />
        <Row label="Kelamin" value={SEX_LABELS[pet.sex] ?? pet.sex} />
        <Row
          label="Lahir"
          value={
            pet.birthDate
              ? `${day(pet.birthDate)}${age(pet.birthDate) ? ` · ${age(pet.birthDate)}` : ""}`
              : "—"
          }
        />
        <Row
          label="Berat"
          value={pet.weightKg !== null ? `${pet.weightKg} kg` : "—"}
        />
        <Row label="Warna" value={pet.color ?? "—"} />
        <Row label="Microchip" value={pet.microchipNo ?? "—"} />
      </dl>

      {pet.notes && (
        <div>
          <dt className="text-xs text-muted">Catatan</dt>
          {/*
            THE FREE-TEXT HALF, and it stays free text: temperament is a
            sentence, and the note that saves a groomer's hand is the one that
            was easy to write. What is structured lives under Medis.
          */}
          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
            {pet.notes}
          </dd>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}
