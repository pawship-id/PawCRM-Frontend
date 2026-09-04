"use client";

import { Plus, X } from "lucide-react";

import { useState } from "react";

import {
  CheckRow,
  CheckRowGroup,
  FIELD_HEIGHT,
  SelectField,
  TextField,
  TextareaField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PetSummaryCard } from "@/features/pets";
import { formatMoney } from "@/utils/decimal";
import { AXIS_LABEL, priceForPet, variantLabelForPet } from "@/utils/serviceVariant";
import type { BusinessLine } from "@/services/businessLine.service";
import type { Pet, Service } from "@/types/api";
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
 * ─── WHY THE CARD IS PER ANIMAL AND NOT PER LINE ───────────────────────────
 *
 * It used to be per LINE: one card meant one animal having one service, so a dog
 * having a bath and a nail trim was two cards, each repeating the animal, the
 * groomer and the note. The questions a receptionist actually asks run the other
 * way — which animal, then what is being done to it — and everything from the
 * business-line filter down to the belongings list is a fact about the ANIMAL,
 * asked once here instead of once per service.
 *
 * ─── IT FETCHES NOTHING ────────────────────────────────────────────────────
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

  /*
    THE MAIN SERVICES ON OFFER, narrowed to the chosen line of business.

    ADD-ONS ARE NOT IN THIS LIST. An add-on is chosen underneath the service it
    belongs to — that is what makes it an add-on — and offering it here would let
    somebody book "Parfum" on its own, which the server then refuses. The filter
    is a convenience; the exclusion is a rule.
  */
  const mainServices = services.filter(
    (service) =>
      service.serviceType !== "addon" &&
      (group.businessLineId === "" ||
        service.businessLineId === group.businessLineId),
  );

  function updateLine(key: string, patch: Partial<ServiceDraft>) {
    onChange({
      services: group.services.map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      ),
    });
  }

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {pet?.name ?? `Hewan ${index + 1}`}
        </span>
        <span className="flex items-center gap-2">
          {hasBilled && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Sudah ditagih
            </span>
          )}
          {removable && !hasBilled && (
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
          )}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
          THE LINE OF BUSINESS IS A FILTER, NOT A FIELD. It is never sent — the
          service already names its own — and it exists because a shop running
          grooming, hotel and clinic out of one catalogue makes the service list
          long enough to scroll past what you wanted.
        */}
        <SelectField
          label="Tipe layanan"
          value={group.businessLineId}
          onChange={(value) =>
            onChange({
              businessLineId: value,
              /*
                THE CHOSEN SERVICES SURVIVE A CHANGE OF FILTER. Narrowing the
                list is not un-choosing what is already on the card, and clearing
                them would punish somebody for looking.
              */
            })
          }
          options={businessLines.map((line) => ({
            value: line._id,
            label: line.name,
          }))}
          placeholder="Semua tipe"
          disabled={disabled}
          hint="Menyaring daftar layanan di bawah. Tidak ikut tersimpan."
        />
      </div>

      {/*
        WHAT THE SHOP ALREADY KNOWS ABOUT THIS ANIMAL — FR-5 kriteria 5.13.

        ABOVE THE SERVICES, not below: a severe allergy read after the service
        has been picked is a warning that arrived too late to change anything.
      */}
      {pet && <PetSummaryCard pet={pet} className="mt-3" />}

      <div className="mt-4 flex flex-col gap-3">
        <Label>
          Layanan<span className="text-danger"> *</span>
        </Label>

        {group.services.map((line) => (
          <ServiceLine
            key={line.key}
            line={line}
            pet={pet}
            mainServices={mainServices}
            groomers={groomers}
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
        BARANG BAWAAN — checked in and out on the booking's own page, listed here.

        WRITTEN DOWN AT BOOKING TIME IS NOT THE SAME AS HANDED OVER. Nothing here
        ticks anything in: this is what the owner says they will bring, and the
        counter confirms it on arrival. That distinction is the whole reason the
        stored shape carries two dates.
      */}
      <BelongingList
        belongings={group.belongings}
        petName={pet?.name ?? `hewan ${index + 1}`}
        disabled={disabled}
        onChange={(belongings) => onChange({ belongings })}
      />

      {/* §16: the note is last, and it is about the ANIMAL on this visit. */}
      <TextareaField
        label="Catatan"
        name={`pet-notes-${group.key}`}
        className="mt-4"
        value={group.notes}
        onChange={(event) => onChange({ notes: event.target.value })}
        maxLength={NOTES_MAX_LENGTH}
        placeholder="mis. takut hairdryer, mandi duluan"
        hint="Berlaku untuk semua layanan hewan ini pada kunjungan ini."
        disabled={disabled}
      />
    </li>
  );
}

/**
 * One service on one animal, with its add-ons underneath.
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
  pet,
  mainServices,
  groomers,
  disabled,
  duplicate,
  removable,
  onChange,
  onRemove,
  serviceOf,
}: {
  line: ServiceDraft;
  pet: Pet | null;
  mainServices: Service[];
  groomers: { value: string; label: string; disabled?: boolean }[];
  disabled: boolean;
  duplicate: boolean;
  removable: boolean;
  onChange: (patch: Partial<ServiceDraft>) => void;
  onRemove: () => void;
  serviceOf: (id: string) => Service | null;
}) {
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

  return (
    <div className="rounded-lg border border-border bg-surface-hover/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
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

        {groomers.length > 0 && (
          <SelectField
            label="Groomer"
            value={line.groomerUserId}
            onChange={(value) => onChange({ groomerUserId: value })}
            options={[
              { value: UNASSIGNED, label: "Belum ditentukan" },
              ...groomers,
            ]}
            disabled={disabled || locked}
          />
        )}
      </div>

      <div className="mt-3 grid items-end gap-3 sm:grid-cols-2">
        <TextField
          label="Durasi (menit)"
          name={`duration-${line.key}`}
          type="number"
          min={1}
          max={1440}
          value={line.durationMin}
          onChange={(event) => onChange({ durationMin: event.target.value })}
          placeholder={
            service?.durationMin ? `${service.durationMin} (dari layanan)` : "—"
          }
          disabled={disabled || locked}
        />

        <div className="text-sm">
          <span className="text-muted">Harga</span>
          <div className="font-medium tabular-nums text-foreground">
            {price ? (
              formatMoney(price)
            ) : missingAxis ? (
              <span className="text-xs font-semibold text-danger">
                {pet?.name ?? "Hewan ini"} belum punya {AXIS_LABEL[missingAxis]}
              </span>
            ) : (
              "—"
            )}
          </div>
          {variantLabel && price && (
            <div className="text-xs text-muted">Varian {variantLabel}</div>
          )}
          {missingAxis && (
            <p className="mt-1 text-xs text-muted">
              Harga layanan ini mengikuti {AXIS_LABEL[missingAxis]} hewannya.
              Lengkapi dulu di profil hewan.
            </p>
          )}
        </div>
      </div>

      {/*
        ADD-ONS, UNDER THE SERVICE THEY BELONG TO. Absent entirely when the
        service offers none — an empty "Add-on" heading over nothing invites
        somebody to go looking for a list that does not exist.
      */}
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
                    addonPrice.price
                      ? `${formatMoney(addonPrice.price)}${addon.durationMin ? ` · +${addon.durationMin} mnt` : ""}`
                      : addonPrice.missingAxis
                        ? `Belum bisa dihitung — ${pet?.name ?? "hewan ini"} belum punya ${AXIS_LABEL[addonPrice.missingAxis]}`
                        : "—"
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

      {locked ? (
        <p className="mt-3 text-xs text-muted">
          Sudah ditagih — tidak bisa diubah atau dihapus.
        </p>
      ) : (
        removable && (
          <div className="mt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Hapus layanan ${service?.name ?? ""}`.trim()}
              onClick={onRemove}
            >
              <X className="size-4" />
              Hapus layanan
            </Button>
          </div>
        )
      )}
    </div>
  );
}

/**
 * What the owner is handing over with this animal.
 *
 * ADD-AND-REMOVE, not a comma-separated box, for the reason the service form's
 * own list fields give: each item is ticked in and out individually on the
 * booking's page, so a separator inside the data would turn one item containing
 * a comma into two.
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
    <div className="mt-4 flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">Barang bawaan</p>
        <p className="mt-1 text-xs text-muted">
          Kalung, carrier, makanan. Dicentang masuk dan keluar di halaman
          bookingnya — booking tidak bisa diselesaikan kalau masih ada yang belum
          kembali.
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
        label, and a second visible one over the box would read as a field of
        its own rather than as the way to add to the list above.
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
