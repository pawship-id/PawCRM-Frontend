"use client";

import Link from "next/link";

import { usePetOptions } from "@/hooks/usePetOptions";
import { cn } from "@/lib/utils";
import type { Pet } from "@/types/api";

import { petAgeText } from "../age";

/*
  SEX STAYS A MAP HERE — it is a closed enum on the model. Species, breed, size
  and coat do not: they are the tenant's own lists since 14 Sep 2026, and their
  words come from `usePetOptions().label()` below.
*/
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
 * ─── THE MOCKUP'S `.dl`, NOT A GRID OF STACKED PAIRS (28 September 2026) ────
 *
 * A LABEL COLUMN AND A VALUE COLUMN, one row each, separated by rules — the
 * shape `hewanDetailInfo` draws. It replaced two columns of label-above-value,
 * and the reason is that this list is READ BY LOOKING FOR ONE ROW: a groomer
 * wants the weight, and a single column of labels is one place to run an eye
 * down. Fourteen stacked pairs in two columns have four places to look.
 *
 * ON A PHONE IT COLLAPSES to label-above-value, as the mockup's own media query
 * does, and the rule moves to the label so the pair stays visibly one row.
 *
 * THE FIELD ORDER IS THE MOCKUP'S, which is not the old one: name and owner
 * first — who this is — then species and breed, then the physical details, then
 * the free text. `Nama` is repeated from the hero on purpose; the hero is the
 * heading and this is the record.
 *
 * THE BADGES AND BOTH BUTTONS MOVED TO THE SCREEN. They were here, which meant
 * "Ubah data hewan" vanished the moment somebody switched to Riwayat.
 * `PetProfileScreen` holds them now — one in the hero, one in this card's own
 * header, where the mockup puts it.
 *
 * `ownerName` ARRIVES AS A PROP: the hero says it too, and one fetch shared with
 * the screen beats two requests for one customer. `null` means it has not landed
 * yet — or did not; the row says so rather than showing an id.
 */
export function PetInfoTab({
  pet,
  ownerName,
}: {
  pet: Pet;
  ownerName: string | null;
}) {
  const { label } = usePetOptions();
  const age = petAgeText(pet.birthDate);
  const tags = pet.preferences?.tags ?? [];

  return (
    <dl className="sm:grid sm:grid-cols-[190px_1fr]">
      <Row label="Nama" value={pet.name} />
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
      <Row label="Jenis" value={label("species", pet.species) ?? "—"} />
      <Row label="Ras" value={label("breed", pet.breed) ?? "—"} />
      <Row label="Kelamin" value={SEX_LABELS[pet.sex] ?? pet.sex} />
      <Row label="Warna" value={pet.color ?? "—"} />
      <Row label="Ukuran" value={label("size", pet.size) ?? "—"} />
      <Row label="Jenis bulu" value={label("furType", pet.furType) ?? "—"} />
      <Row
        label="Tanggal lahir"
        value={
          pet.birthDate ? (
            <>
              {day(pet.birthDate)}
              {/* THE DERIVED FIGURE AS A NOTE under the stored fact, as the
                  mockup's `.note` — an age written into a record is wrong the
                  day after it is written, so the date is what is kept. */}
              {age && <span className="block text-xs text-muted">{age}</span>}
            </>
          ) : (
            "—"
          )
        }
      />
      <Row
        label="Berat"
        value={
          pet.weightKg !== null ? (
            <span className="tabular-nums">{pet.weightKg} kg</span>
          ) : (
            "—"
          )
        }
      />
      <Row
        label="Nomor microchip"
        value={
          pet.microchipNo ? (
            <span className="tabular-nums">{pet.microchipNo}</span>
          ) : (
            "—"
          )
        }
      />
      <Row
        label="Deskripsi"
        value={pet.description ?? "—"}
        /* Free text runs to paragraphs; the newlines somebody typed are the
           structure they gave it. */
        multiline
      />
      <Row
        label="Catatan internal"
        value={pet.internalNotes ?? "—"}
        multiline
      />
      {tags.length > 0 && (
        <Row
          label="Tag"
          value={
            <span className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-muted"
                >
                  {tag}
                </span>
              ))}
            </span>
          }
        />
      )}
    </dl>
  );
}

/**
 * One row of the list: a `dt` and a `dd` side by side.
 *
 * A FRAGMENT, NOT A WRAPPER `div`, because the two cells are the grid's own
 * children — a wrapper would put both in one column and the label column would
 * collapse. The rule lives on the top of each cell and comes off the first row
 * via `first-of-type`, which is why they are siblings rather than nested.
 */
function Row({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <>
      <dt className="border-t border-border pt-3 text-xs font-semibold text-muted first-of-type:border-t-0 sm:py-3">
        {label}
      </dt>
      <dd
        className={cn(
          "pb-3 text-sm text-foreground sm:border-t sm:border-border sm:py-3 sm:first-of-type:border-t-0",
          multiline && "whitespace-pre-wrap",
        )}
      >
        {value}
      </dd>
    </>
  );
}
