"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus, X } from "lucide-react";

import {
  CheckRow,
  CheckRowGroup,
  FIELD_HEIGHT,
  SelectField,
  TextareaField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PetSummaryCard } from "@/features/pets";
import { formatMoney } from "@/utils/decimal";
import { AXIS_LABEL, priceForPet, variantLabelForPet } from "@/utils/serviceVariant";
import type { BusinessLine } from "@/services/businessLine.service";
import type { Pet, Service, ServiceVariantAxis } from "@/types/api";
import { blankService, UNASSIGNED } from "../bookingDraft";
import type { PetGroupDraft, ServiceDraft } from "../bookingDraft";

/** Mirrors NOTES_MAX_LENGTH / BELONGING_NAME_MAX_LENGTH in the models. */
const NOTES_MAX_LENGTH = 500;
const BELONGING_NAME_MAX_LENGTH = 120;

/** The pet vocabulary, for naming which variant an animal falls into. */
const VARIANT_VALUE_LABELS: Record<string, Record<string, string>> = {
  petType: { cat: "Kucing", dog: "Anjing" },
  sizeCategory: { small: "Kecil", medium: "Sedang", large: "Besar" },
  furType: { "long hair": "Bulu panjang", "short hair": "Bulu pendek" },
};

/**
 * ONE ANIMAL ON THE BOOKING — its services, its add-ons, its note and what it
 * brought with it.
 *
 * ─── THE CARD IS TITLED BY ITS ANIMAL, AND THAT IS THE WHOLE LAYOUT ────────
 *
 * The first version put every control on one flat card under a small grey
 * caption, and the first question it produced from somebody using it was "ini
 * input buat hewan 1 atau hewan 2?". A form somebody has to keep their place in
 * is a form that gets filled in wrong.
 *
 * So the animal's name is a HEADER STRIP with a numbered badge, tinted, running
 * the full width of the card; everything belonging to that animal sits under it
 * and nothing else does. The number survives an empty card — "Hewan ke-2" still
 * answers which one this is — and becomes the name the moment one is chosen.
 * The services sit behind a left rail, so the indent says "these belong to the
 * animal named above" without repeating it on every row.
 *
 * ─── WHAT IS HIDDEN UNTIL IT IS WANTED ────────────────────────────────────
 *
 * A visit is usually one animal, one service, the catalogue's duration, no note
 * and nothing handed over. Showing eight controls for that is what made the card
 * hard to read, so the three usually left alone — the duration override, the
 * note and the belongings — are folded away, and each fold says when it holds
 * something. Nothing is removed; it stops being in the way.
 *
 * ─── IT FETCHES NOTHING ───────────────────────────────────────────────────
 *
 * Pets, services, business lines and groomers are loaded once by the form and
 * handed down. A card that fetched its own would ask four times over for a
 * customer with four dogs.
 */
export function BookingPetGroupCard({
  group,
  index,
  pets,
  services,
  businessLines,
  groomers,
  disabled,
  removable,
  duplicateKeys,
  onChange,
  onRemove,
}: {
  group: PetGroupDraft;
  index: number;
  pets: Pet[];
  services: Service[];
  businessLines: BusinessLine[];
  /**
   * `disabled` CARRIES THE REASON — FR-4 kriteria 4.3. A greyed name with no
   * explanation tells a receptionist to phone somebody; "Libur setiap Rabu"
   * tells them to offer Thursday.
   */
  groomers: { value: string; label: string; disabled?: boolean }[];
  disabled: boolean;
  /** False on the last remaining card — a booking with no animals is not one. */
  removable: boolean;
  /** Line keys that repeat an animal-and-service already on the booking. */
  duplicateKeys: Set<string>;
  onChange: (next: Partial<PetGroupDraft>) => void;
  onRemove: () => void;
}) {
  const pet = pets.find((item) => item._id === group.petId) ?? null;
  const serviceOf = (id: string) =>
    services.find((item) => item._id === id) ?? null;

  /* A billed line may not be removed, and nor may the card holding one. */
  const hasBilled = group.services.some((line) => line.locked);

  function updateLine(key: string, patch: Partial<ServiceDraft>) {
    onChange({
      services: group.services.map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      ),
    });
  }

  const extrasCount =
    group.belongings.length + (group.notes.trim() === "" ? 0 : 1);

  return (
    /*
      `bg-surface` — a WHITE card, not the page's tint showing through a border.
      The pet cards sit inside another card now, and an unfilled panel on a
      filled one reads as a gap rather than as a thing.
    */
    <li className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/*
        THE HEADER STRIP. Tinted and full width, so the eye finds where one
        animal ends and the next begins without counting borders — which is the
        thing the flat version could not do.
      */}
      <div className="flex items-center gap-3 bg-navy-100 px-4 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold tabular-nums text-primary-foreground">
          {index + 1}
        </span>

        <span className="min-w-0 flex-1">
          {/*
            A REAL HEADING, not a styled span. It is the card's title in the
            sense a reader means — "whose fields are these" — so a screen reader
            should be able to jump between animals the way an eye does.
          */}
          <h3 className="truncate text-sm font-bold text-foreground">
            {pet?.name ?? `Hewan ke-${index + 1}`}
          </h3>
          {group.services.length > 1 && (
            <span className="block text-xs text-muted">
              {group.services.length} layanan
            </span>
          )}
        </span>

        {hasBilled ? (
          <span className="rounded bg-surface px-2 py-0.5 text-xs text-muted">
            Sudah ditagih
          </span>
        ) : (
          removable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Hapus ${pet?.name ?? `hewan ${index + 1}`}`}
              onClick={onRemove}
            >
              <X className="size-4" />
            </Button>
          )
        )}
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Hewan"
            value={group.petId}
            onChange={(value) => onChange({ petId: value })}
            options={pets.map((item) => ({ value: item._id, label: item.name }))}
            placeholder="Pilih hewan…"
            disabled={disabled || hasBilled}
            required
          />

          {/*
            ONE GROOMER PER ANIMAL, AND IT IS A DEFAULT.

            It used to be asked once per service, which is the wrong number of
            times: at booking a shop says "Sinta is doing Bruno today", not one
            name per line. It is written onto every one of this animal's
            sessions, and the booking's own page is where a session gets handed
            to somebody else or gains a second pair of hands — there, with the
            day running, in front of the person who knows.

            NO STAFF LIST, NO SELECT. Reading staff takes a permission a
            receptionist who books all day has no other reason to hold;
            assignment is optional and the server names an empty slot, so a
            missing list costs a convenience rather than a rule.
          */}
          {groomers.length > 0 && (
            <SelectField
              label="Groomer"
              value={group.groomerUserId}
              onChange={(value) => onChange({ groomerUserId: value })}
              options={[
                { value: UNASSIGNED, label: "Belum ditentukan" },
                ...groomers,
              ]}
              disabled={disabled || hasBilled}
              hint="Berlaku untuk semua sesi hewan ini. Bisa diganti per sesi di halaman bookingnya."
            />
          )}
        </div>

        {/*
          WHAT THE SHOP ALREADY KNOWS ABOUT THIS ANIMAL — FR-5 kriteria 5.13.

          ABOVE THE SERVICES, not below: a severe allergy read after the service
          has been picked is a warning that arrived too late to change anything.
        */}
        {pet && <PetSummaryCard pet={pet} />}

        <div className="flex flex-col gap-3 border-l-2 border-border pl-3">
          {/*
            ONE LABEL FOR THE LIST, and the lines inside number themselves. The
            first version put "Layanan" here AND on the select inside every line,
            so the same word appeared twice a few pixels apart with different
            meanings — the list, and one entry of it.
          */}
          <span className="text-sm font-medium">
            Daftar layanan<span className="text-danger"> *</span>
          </span>

          {group.services.map((line, position) => (
            <ServiceLine
              key={line.key}
              line={line}
              position={position}
              pet={pet}
              services={services}
              businessLines={businessLines}
              disabled={disabled}
              duplicate={duplicateKeys.has(line.key)}
              removable={group.services.length > 1}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() =>
                onChange({
                  services: group.services.filter(
                    (other) => other.key !== line.key,
                  ),
                })
              }
              serviceOf={serviceOf}
            />
          ))}

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange({ services: [...group.services, blankService()] })
              }
            >
              <Plus className="size-4" />
              Tambah layanan
            </Button>
          </div>
        </div>

        {/*
          THE TWO THINGS MOST VISITS DO NOT HAVE, behind one fold. The summary
          counts what is inside, so nothing a reader needs is out of sight.
        */}
        <Disclosure
          label="Catatan & barang bawaan"
          count={extrasCount}
          petName={pet?.name ?? `hewan ${index + 1}`}
        >
          <div className="flex flex-col gap-4 pt-3">
            <TextareaField
              label="Catatan"
              name={`pet-notes-${group.key}`}
              value={group.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              maxLength={NOTES_MAX_LENGTH}
              placeholder="mis. takut hairdryer, mandi duluan"
              hint="Berlaku untuk semua layanan hewan ini pada kunjungan ini."
              disabled={disabled}
            />

            {/*
              BARANG BAWAAN — ticked in and out on the booking's own page, listed
              here. Nothing here ticks anything in: this is what the owner says
              they will bring, and the counter confirms it on arrival.
            */}
            <BelongingList
              belongings={group.belongings}
              petName={pet?.name ?? `hewan ${index + 1}`}
              disabled={disabled}
              onChange={(belongings) => onChange({ belongings })}
            />
          </div>
        </Disclosure>
      </div>
    </li>
  );
}

/**
 * One service on one animal, with its add-ons underneath.
 *
 * TWO CONTROLS BY DEFAULT — the service, and who does it. The duration override
 * is behind a button showing the catalogue's number: a receptionist disagreeing
 * with the catalogue is the exception, and a box asking them to is one more
 * thing to read past on every booking that does not need it.
 *
 * THE PRICE SHOWN IS RESOLVED FROM THE ANIMAL when the service is priced per
 * variant — the same lookup the server does, mirrored so the card can show a
 * number before the save. When the animal's own record is missing the fact the
 * price varies by, it says WHICH fact rather than showing a guess: the server
 * would refuse the save, and a number on screen that the save contradicts is
 * worse than no number.
 */
function ServiceLine({
  line,
  position,
  pet,
  services,
  businessLines,
  disabled,
  duplicate,
  removable,
  onChange,
  onRemove,
  serviceOf,
}: {
  line: ServiceDraft;
  /** Its place in the animal's list, for the numbered caption. */
  position: number;
  pet: Pet | null;
  services: Service[];
  businessLines: BusinessLine[];
  disabled: boolean;
  duplicate: boolean;
  removable: boolean;
  onChange: (patch: Partial<ServiceDraft>) => void;
  onRemove: () => void;
  serviceOf: (id: string) => Service | null;
}) {
  /* Open when a duration was already typed, so an edit shows what it holds. */
  const [editingDuration, setEditingDuration] = useState(
    line.durationMin !== "",
  );

  const service = serviceOf(line.serviceId);
  const locked = line.locked;
  const { price, missingAxis } = priceForPet(service, pet);
  const variantLabel = variantLabelForPet(service, pet, VARIANT_VALUE_LABELS);

  /*
    THE ADD-ONS THIS SERVICE OFFERS — its own list, not the whole catalogue. The
    server refuses anything outside it, so offering more here would be a tick
    that fails on save.
  */
  const offeredAddons = (service?.addonServiceIds ?? [])
    .map((id) => serviceOf(id))
    .filter((addon): addon is Service => addon !== null);

  const catalogueDuration = service?.durationMin ?? null;

  /*
    THE MAIN SERVICES ON OFFER, narrowed by THIS line's type.

    ADD-ONS ARE NOT IN THIS LIST. An add-on is chosen underneath the service it
    belongs to — that is what makes it an add-on — and offering it here would let
    somebody book "Parfum" on its own, which the server then refuses. The filter
    is a convenience; the exclusion is a rule.
  */
  const mainServices = services.filter(
    (entry) =>
      entry.serviceType !== "addon" &&
      (line.businessLineId === "" ||
        entry.businessLineId === line.businessLineId),
  );

  return (
    /*
      INSET, not another white panel. The card behind it is white, so a service
      line takes the page's own tint to separate from it — the inverse of the
      usual card-on-background, and the only way to nest twice without the
      borders doing all the work.
    */
    <div className="rounded-lg border border-border bg-background p-3">
      {/*
        ONE LINE READS TOP TO BOTTOM IN THE ORDER IT IS ANSWERED: which type,
        then which service of that type, then what is added to it. The caption
        numbers it so two lines on one animal are told apart the way two animals
        are — and it carries the remove button, off the footer where it sat below
        add-ons it was not about.
      */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums text-muted">
          Layanan {position + 1}
        </span>
        {locked ? (
          <span className="text-xs text-muted">Sudah ditagih</span>
        ) : (
          removable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Hapus layanan ${service?.name ?? position + 1}`}
              onClick={onRemove}
            >
              <X className="size-4" />
            </Button>
          )
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {businessLines.length > 0 && (
          <SelectField
            label="Tipe layanan"
            value={line.businessLineId}
            onChange={(value) =>
              /* The chosen service may not be of the new type; clearing it is
                 kinder than leaving a name the list below no longer offers. */
              onChange({
                businessLineId: value,
                serviceId: "",
                addonServiceIds: [],
              })
            }
            options={businessLines.map((entry) => ({
              value: entry._id,
              label: entry.name,
            }))}
            placeholder="Semua tipe"
            disabled={disabled || locked}
          />
        )}

        <SelectField
          label="Layanan"
          value={line.serviceId}
          onChange={(value) =>
            /* A different service offers different add-ons; keeping the old
               ticks would send ones the new parent does not offer. */
            onChange({ serviceId: value, addonServiceIds: [] })
          }
          options={mainServices.map((item) => ({
            value: item._id,
            label: item.name,
          }))}
          placeholder="Pilih layanan…"
          disabled={disabled || locked}
          error={
            duplicate
              ? `${pet?.name ?? "Hewan ini"} sudah punya layanan yang sama di booking ini.`
              : undefined
          }
          required
        />
      </div>

      {/* The price sits with the service it belongs to, not in a column of its own. */}
      {service && (
        <p className="mt-2 text-sm">
          {price ? (
            <>
              <span className="font-medium tabular-nums text-foreground">
                {formatMoney(price)}
              </span>
              {variantLabel && (
                <span className="text-muted"> · varian {variantLabel}</span>
              )}
            </>
          ) : missingAxis ? (
            <span className="text-xs font-semibold text-danger">
              {pet?.name ?? "Hewan ini"} belum punya {AXIS_LABEL[missingAxis]} —
              harga layanan ini mengikutinya.{" "}
              <PetFixLink pet={pet} axis={missingAxis} />
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </p>
      )}

      {offeredAddons.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted">Add-on</p>
          <CheckRowGroup>
            {offeredAddons.map((addon) => {
              const addonPrice = priceForPet(addon, pet);

              return (
                <CheckRow
                  key={addon._id}
                  label={addon.name}
                  description={
                    addonPrice.price ? (
                      `${formatMoney(addonPrice.price)}${addon.durationMin ? ` · +${addon.durationMin} mnt` : ""}`
                    ) : addonPrice.missingAxis ? (
                      <span className="text-danger">
                        Belum bisa dihitung — {pet?.name ?? "hewan ini"} belum
                        punya {AXIS_LABEL[addonPrice.missingAxis]}.{" "}
                        <PetFixLink pet={pet} axis={addonPrice.missingAxis} />
                      </span>
                    ) : (
                      "—"
                    )
                  }
                  checked={line.addonServiceIds.includes(addon._id)}
                  disabled={disabled || locked}
                  onCheckedChange={(checked) =>
                    onChange({
                      addonServiceIds: checked
                        ? [...line.addonServiceIds, addon._id]
                        : line.addonServiceIds.filter((id) => id !== addon._id),
                    })
                  }
                />
              );
            })}
          </CheckRowGroup>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {editingDuration ? (
          <span className="flex items-center gap-2">
            <Input
              aria-label="Durasi (menit)"
              type="number"
              min={1}
              max={1440}
              className={`w-28 ${FIELD_HEIGHT}`}
              value={line.durationMin}
              onChange={(event) => onChange({ durationMin: event.target.value })}
              placeholder={catalogueDuration ? String(catalogueDuration) : "—"}
              disabled={disabled || locked}
            />
            <span className="text-xs text-muted">menit</span>
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || locked}
            onClick={() => setEditingDuration(true)}
          >
            Durasi {catalogueDuration ? `${catalogueDuration} mnt` : "—"} · ubah
          </Button>
        )}

        {locked && (
          <span className="text-xs text-muted">
            Tidak bisa diubah atau dihapus.
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * THE WAY OUT OF A PRICE THAT CANNOT BE WORKED OUT.
 *
 * A refusal that names the missing fact is better than "Validation failed", and
 * still leaves somebody to find the animal themselves — through a menu, a
 * search, and a form they have never opened. The fix is one field away; this is
 * the door to it.
 *
 * ─── A NEW TAB, AND THAT IS THE WHOLE REASON IT IS A LINK AND NOT A ROUTE ───
 *
 * The booking form is a page holding unsaved state and no draft: navigating away
 * loses the customer, the animals, every service ticked so far. So it opens
 * beside the booking, exactly as `ProductForm` links out to the product holding
 * a taken barcode — fill the coat length in, come back to the tab that still has
 * the booking in it, and re-pick the service to reprice it.
 *
 * ABSENT WHEN NO ANIMAL IS CHOSEN. There is nothing to open, and a dead link is
 * worse than a sentence that stops.
 */
function PetFixLink({
  pet,
  axis,
}: {
  pet: Pet | null;
  axis: ServiceVariantAxis;
}) {
  if (!pet) return <>Pilih hewannya dulu.</>;

  return (
    <Link
      href={`/dashboard/master/pets/${pet._id}/edit`}
      className="underline underline-offset-2"
      target="_blank"
    >
      Lengkapi {AXIS_LABEL[axis]} {pet.name} →
    </Link>
  );
}

/**
 * One fold, with a summary that says whether anything is inside.
 *
 * A BUTTON AND STATE RATHER THAN `<details>`: the open state has to survive the
 * re-render that typing in a sibling field causes, and `<details>` keeps that in
 * the DOM where React will fight it.
 *
 * OPEN WHEN IT ALREADY HOLDS SOMETHING, so editing a booking never hides what
 * was written last time behind a fold nobody knows to open.
 */
function Disclosure({
  label,
  count,
  petName,
  children,
}: {
  label: string;
  count: number;
  petName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);

  return (
    <div className="border-t border-border pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-label={`${label} ${petName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          className={`size-4 transition ${open ? "" : "-rotate-90"}`}
          aria-hidden
        />
        {label}
        {count > 0 && (
          <span className="rounded-full bg-secondary/25 px-2 text-xs font-medium tabular-nums text-secondary-foreground">
            {count}
          </span>
        )}
      </Button>

      {open && children}
    </div>
  );
}

/**
 * What the owner is handing over with this animal.
 *
 * ADD-AND-REMOVE, not a comma-separated box: each item is ticked in and out
 * individually on the booking's page, so a separator inside the data would turn
 * one item containing a comma into two.
 */
function BelongingList({
  belongings,
  petName,
  disabled,
  onChange,
}: {
  belongings: string[];
  petName: string;
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">Barang bawaan</p>
        <p className="mt-1 text-xs text-muted">
          Kalung, carrier, makanan. Dicentang masuk dan keluar di halaman
          bookingnya.
        </p>
      </div>

      {belongings.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {belongings.map((name, position) => (
            <li
              key={`${name}-${position}`}
              className="flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm"
            >
              {name}
              <button
                type="button"
                aria-label={`Hapus ${name}`}
                className="rounded-full p-0.5 text-muted transition hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50"
                disabled={disabled}
                onClick={() =>
                  onChange(belongings.filter((_, index) => index !== position))
                }
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <BelongingInput
        petName={petName}
        disabled={disabled}
        onAdd={(name) => onChange([...belongings, name])}
      />
    </div>
  );
}

function BelongingInput({
  petName,
  disabled,
  onAdd,
}: {
  petName: string;
  disabled: boolean;
  onAdd: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const trimmed = draft.trim();
    if (trimmed === "") return;
    onAdd(trimmed);
    setDraft("");
  }

  return (
    <div className="flex items-start gap-2">
      {/*
        An `aria-label` rather than a `TextField`: the list's own heading is the
        label, and a second visible one over the box would read as a field of its
        own rather than as the way to add to the list above.
      */}
      <Input
        aria-label={`Tambah barang bawaan ${petName}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter adds the item instead of submitting the form — a half-typed
          // list is not a saved booking.
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        placeholder="mis. Carrier biru"
        maxLength={BELONGING_NAME_MAX_LENGTH}
        disabled={disabled}
        className={`flex-1 ${FIELD_HEIGHT}`}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || draft.trim() === ""}
        onClick={add}
      >
        <Plus className="size-4" aria-hidden />
        Tambah
      </Button>
    </div>
  );
}
