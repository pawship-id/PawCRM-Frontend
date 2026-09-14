"use client";

import { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

import {
  Alert,
  CheckRow,
  CheckRowGroup,
  FIELD_HEIGHT,
  SelectField,
  TextareaField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PetFixLink, PetSummaryCard } from "@/features/pets";
import { usePetOptions } from "@/hooks/usePetOptions";
import { formatMoney } from "@/utils/decimal";
import {
  AXIS_LABEL,
  priceForPet,
  variantLabelForPet,
} from "@/utils/serviceVariant";
import type { BusinessLine } from "@/services/businessLine.service";
import type { Pet, Service } from "@/types/api";
import { petServiceKey, UNASSIGNED } from "../bookingDraft";
import type { BelongingDraft, BookingCardDraft } from "../bookingDraft";

/** Mirrors NOTES_MAX_LENGTH / BELONGING_NAME_MAX_LENGTH in the model. */
const NOTES_MAX_LENGTH = 500;
const BELONGING_NAME_MAX_LENGTH = 120;

/** Shared empty set for a card with no stored booking behind it. */
const NO_STORED_KEYS: ReadonlySet<string> = new Set();

/**
 * ONE BOOKING ON THE FORM — its animal, its one main service, the add-ons under
 * it, and what is special about it today.
 *
 * ─── THE CARD IS TITLED BY ITS ANIMAL, AND THAT IS THE WHOLE LAYOUT ────────
 *
 * The first version put every control on one flat card under a small grey
 * caption, and the first question it produced from somebody using it was "ini
 * input buat hewan 1 atau hewan 2?". A form somebody has to keep their place in
 * is a form that gets filled in wrong.
 *
 * So the animal's name is a HEADER STRIP with a numbered badge, tinted, running
 * the full width of the card; everything belonging to that booking sits under it
 * and nothing else does. The number survives an empty card — "Booking ke-2"
 * still answers which one this is — and becomes the name the moment an animal
 * is chosen. The service sits behind a left rail, so the indent says "this
 * belongs to the animal named above" without repeating it.
 *
 * ─── THE SAME ANIMAL MAY BE ON TWO CARDS ───────────────────────────────────
 *
 * One booking is one main service. Mochi having a bath and a hotel stay is two
 * cards naming Mochi, and only the same service twice for the same animal is
 * refused — see `duplicateCardKeys`.
 *
 * ─── WHAT IS HIDDEN UNTIL IT IS WANTED ────────────────────────────────────
 *
 * A booking is usually one animal, one service, the catalogue's duration, no
 * note and nothing handed over. The three usually left alone — the duration
 * override, the notes and the belongings — are folded away, and each fold says
 * when it holds something.
 *
 * ─── IT FETCHES NOTHING ───────────────────────────────────────────────────
 *
 * Pets, services, business lines and groomers are loaded once by the form and
 * handed down. A card that fetched its own would ask four times over for a
 * customer with four dogs.
 */
export function BookingCard({
  card,
  index,
  pets,
  services,
  businessLines,
  groomers,
  disabled,
  removable,
  duplicate,
  storedKeys = NO_STORED_KEYS,
  onChange,
  onRemove,
}: {
  card: BookingCardDraft;
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
  /** False on the last remaining card, and on the edit form's only card. */
  removable: boolean;
  /** This animal already has this main service on another card. */
  duplicate: boolean;
  /**
   * The (animal, service) pairs the stored booking already held, by
   * `petServiceKey` — empty on a new booking. A pair in here may keep an
   * inactive variant; see `storedPetServiceKeys`.
   */
  storedKeys?: ReadonlySet<string>;
  onChange: (next: Partial<BookingCardDraft>) => void;
  onRemove: () => void;
}) {
  /* Open when a duration was already typed, so an edit shows what it holds. */
  const [editingDuration, setEditingDuration] = useState(
    card.durationMin !== "",
  );
  // The tenant's words for the variant — "Anjing · Ekstra besar", as it named them.
  const { label: petOptionLabel } = usePetOptions();

  const pet = pets.find((item) => item._id === card.petId) ?? null;
  const serviceOf = (id: string) =>
    services.find((item) => item._id === id) ?? null;
  const wasStored = (serviceId: string) =>
    storedKeys.has(petServiceKey(card.petId, serviceId));

  const locked = card.locked;
  const service = serviceOf(card.serviceId);
  const quote = priceForPet(service, pet);
  const { price, missingAxis } = quote;
  const variantLabel = variantLabelForPet(service, pet, petOptionLabel);
  /*
    THE ANIMAL'S VARIANT IS SWITCHED OFF, and this pair is new (13 September
    2026). It is not priceable: the server refuses a new line for it, so the
    card says so in words instead of showing a figure somebody would quote. A
    pair already on the stored booking is allowed through by the server, and
    keeps its price here — with the fact said beside it.
  */
  const inactive = quote.inactive && !wasStored(card.serviceId);

  /*
    THE ADD-ONS THIS SERVICE OFFERS — its own list, not the whole catalogue. The
    server refuses anything outside it, so offering more here would be a tick
    that fails on save.
  */
  const offeredAddons = (service?.addonServiceIds ?? [])
    .map((id) => serviceOf(id))
    .filter((addon): addon is Service => addon !== null);

  /*
    THE ANIMAL'S LENGTH, not the service's. A variant-priced service has no
    `durationMin` of its own since 13 September 2026 — each variant carries one.
  */
  const catalogueDuration = quote.durationMin;

  /*
    THE MAIN SERVICES ON OFFER, narrowed by the chosen type.

    ADD-ONS ARE NOT IN THIS LIST. An add-on is chosen underneath the service it
    belongs to — that is what makes it an add-on — and offering it here would let
    somebody book "Parfum" on its own, which the server then refuses. The filter
    is a convenience; the exclusion is a rule.
  */
  const mainServices = services.filter(
    (entry) =>
      entry.serviceType !== "addon" &&
      (card.businessLineId === "" ||
        entry.businessLineId === card.businessLineId),
  );

  /*
    EACH NOTE COUNTS AS ONE. The badge is what tells a reader the fold holds
    something — counting the pair as one would hide the fact that a customer
    note was written and an internal one was not.
  */
  const extrasCount =
    card.belongings.length +
    (card.internalNotes.trim() === "" ? 0 : 1) +
    (card.customerNotes.trim() === "" ? 0 : 1);

  const cardName = pet?.name ?? `booking ${index + 1}`;

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/*
        THE HEADER STRIP. Tinted and full width, so the eye finds where one
        booking ends and the next begins without counting borders.
      */}
      <div className="flex items-center gap-3 bg-navy-100 px-4 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold tabular-nums text-primary-foreground">
          {index + 1}
        </span>

        <span className="min-w-0 flex-1">
          {/*
            A REAL HEADING, not a styled span — a screen reader should be able to
            jump between bookings the way an eye does.
          */}
          <h3 className="truncate text-sm font-bold text-foreground">
            {pet?.name ?? `Booking ke-${index + 1}`}
          </h3>
          {service && (
            <span className="block truncate text-xs text-muted">
              {service.name}
            </span>
          )}
        </span>

        {locked ? (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
            Sudah ditagih
          </span>
        ) : (
          removable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Hapus ${cardName}`}
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
            value={card.petId}
            onChange={(value) => onChange({ petId: value })}
            options={pets.map((item) => ({
              value: item._id,
              label: item.name,
            }))}
            placeholder="Pilih hewan…"
            disabled={disabled || locked}
            required
          />

          {/*
            ONE GROOMER PER BOOKING, AND IT IS A DEFAULT. It is written onto the
            booking's sessions, and the booking's own page is where a session gets
            handed to somebody else or gains a second pair of hands.

            NO STAFF LIST, NO SELECT. Reading staff takes a permission a
            receptionist who books all day has no other reason to hold;
            assignment is optional and the server names an empty slot.
          */}
          {groomers.length > 0 && (
            <SelectField
              label="Groomer"
              value={card.groomerUserId}
              onChange={(value) => onChange({ groomerUserId: value })}
              options={[
                { value: UNASSIGNED, label: "Belum ditentukan" },
                ...groomers,
              ]}
              disabled={disabled || locked}
              hint="Berlaku untuk semua sesi booking ini. Bisa diganti per sesi di halaman bookingnya."
            />
          )}
        </div>

        {/*
          NO SIZE, NO BOOKING — since 13 September 2026 commission is read
          against it, and the server refuses the save. Said on the animal rather
          than under the service: it is true whatever is booked.
        */}
        {pet && !pet.size && (
          <Alert variant="warning">
            {pet.name} belum punya ukuran — ukuran wajib diisi untuk booking.{" "}
            <PetFixLink pet={pet} axis="sizeCategory" />
          </Alert>
        )}

        {/*
          WHAT THE SHOP ALREADY KNOWS ABOUT THIS ANIMAL — FR-5 kriteria 5.13.
          ABOVE THE SERVICE, not below: a severe allergy read after the service
          has been picked is a warning that arrived too late to change anything.
        */}
        {pet && <PetSummaryCard pet={pet} />}

        <div className="flex flex-col gap-3 border-l-2 border-border pl-3">
          <span className="text-sm font-medium">
            Layanan utama<span className="text-danger"> *</span>
          </span>

          {/*
            INSET, not another white panel. The card behind it is white, so the
            service takes the page's own tint to separate from it.
          */}
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {businessLines.length > 0 && (
                <SelectField
                  label="Tipe layanan"
                  value={card.businessLineId}
                  onChange={(value) =>
                    /* The chosen service may not be of the new type; clearing it
                       is kinder than leaving a name the list no longer offers. */
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
                value={card.serviceId}
                onChange={(value) =>
                  /* A different service offers different add-ons; keeping the
                     old ticks would send ones the new service does not offer. */
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
                    ? `${pet?.name ?? "Hewan ini"} sudah punya layanan yang sama di kartu lain.`
                    : undefined
                }
                required
              />
            </div>

            {/* The price sits with the service it belongs to. */}
            {service && (
              <p className="mt-2 text-sm">
                {inactive ? (
                  /* A WORD, NOT A COLOUR — §1.3. The blocked Simpan names the
                     service and the animal; this says what to do about it. */
                  <>
                    <span className="rounded-full bg-tint-danger px-2 py-0.5 text-xs font-medium text-danger">
                      Varian nonaktif
                    </span>
                    <span className="text-xs text-muted">
                      {" "}
                      Pilih layanan lain atau aktifkan variannya di katalog.
                    </span>
                  </>
                ) : price ? (
                  <>
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMoney(price)}
                    </span>
                    {variantLabel && (
                      <span className="text-muted"> · varian {variantLabel}</span>
                    )}
                    {quote.inactive && (
                      <span className="text-muted">
                        {" "}
                        · varian nonaktif, tetap berlaku di booking ini
                      </span>
                    )}
                  </>
                ) : missingAxis === "sizeCategory" && pet ? (
                  /* The animal's own warning above already names it and links
                     out; a second link with the same words would be one too many. */
                  <span className="text-xs text-muted">
                    Harganya menunggu ukuran {pet.name}.
                  </span>
                ) : missingAxis ? (
                  <span className="text-xs font-semibold text-danger">
                    {pet?.name ?? "Hewan ini"} belum punya{" "}
                    {AXIS_LABEL[missingAxis]} — harga layanan ini mengikutinya.{" "}
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
                    const checked = card.addonServiceIds.includes(addon._id);
                    /*
                      AN ADD-ON ON A SWITCHED-OFF VARIANT cannot be ticked for a
                      new pair (13 September 2026). One already ticked stays
                      UNTICKABLE, though: a disabled box left checked would be a
                      refusal with no way out but removing the service.
                    */
                    const addonInactive =
                      addonPrice.inactive && !wasStored(addon._id);

                    return (
                      <CheckRow
                        key={addon._id}
                        label={addon.name}
                        description={
                          addonInactive ? (
                            `Varian nonaktif — tidak bisa dipilih untuk ${pet?.name ?? "hewan ini"}.`
                          ) : addonPrice.price ? (
                            `${formatMoney(addonPrice.price)}${addonPrice.durationMin ? ` · +${addonPrice.durationMin} mnt` : ""}`
                          ) : addonPrice.missingAxis === "sizeCategory" && pet ? (
                            `Harganya menunggu ukuran ${pet.name}.`
                          ) : addonPrice.missingAxis ? (
                            <span className="text-danger">
                              Belum bisa dihitung — {pet?.name ?? "hewan ini"}{" "}
                              belum punya {AXIS_LABEL[addonPrice.missingAxis]}.{" "}
                              <PetFixLink
                                pet={pet}
                                axis={addonPrice.missingAxis}
                              />
                            </span>
                          ) : (
                            "—"
                          )
                        }
                        checked={checked}
                        disabled={
                          disabled || locked || (addonInactive && !checked)
                        }
                        onCheckedChange={(next) =>
                          onChange({
                            addonServiceIds: next
                              ? [...card.addonServiceIds, addon._id]
                              : card.addonServiceIds.filter(
                                  (id) => id !== addon._id,
                                ),
                          })
                        }
                      />
                    );
                  })}
                </CheckRowGroup>
              </div>
            )}

            {/*
              THE DURATION OVERRIDE is behind a button showing the catalogue's
              number: a receptionist disagreeing with the catalogue is the
              exception, and a box asking them to is one more thing to read past.
            */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {editingDuration ? (
                <span className="flex items-center gap-2">
                  <Input
                    aria-label="Durasi (menit)"
                    type="number"
                    min={1}
                    max={1440}
                    className={`w-28 ${FIELD_HEIGHT}`}
                    value={card.durationMin}
                    onChange={(event) =>
                      onChange({ durationMin: event.target.value })
                    }
                    placeholder={
                      catalogueDuration ? String(catalogueDuration) : "—"
                    }
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
                  Durasi {catalogueDuration ? `${catalogueDuration} mnt` : "—"}{" "}
                  · ubah
                </Button>
              )}

              {locked && (
                <span className="text-xs text-muted">
                  Sudah ditagih — layanannya tidak bisa diubah.
                </span>
              )}
            </div>
          </div>
        </div>

        {/*
          THE TWO THINGS MOST BOOKINGS DO NOT HAVE, behind one fold. The summary
          counts what is inside, so nothing a reader needs is out of sight.
        */}
        <Disclosure
          label="Catatan & barang bawaan"
          count={extrasCount}
          cardName={cardName}
        >
          <div className="flex flex-col gap-4 pt-3">
            {/*
              ─── TWO NOTES, AND THE LABELS ARE THE WHOLE POINT ──────────────

              The person typing decides where a sentence lands, so the labels
              have to answer "who reads this" before the cursor gets there.

              THE INTERNAL ONE IS FIRST because it is the one almost every visit
              has, and the one a groomer needs. The customer's is the exception.
            */}
            <TextareaField
              label="Catatan internal"
              name={`card-internal-notes-${card.key}`}
              value={card.internalNotes}
              onChange={(event) =>
                onChange({ internalNotes: event.target.value })
              }
              maxLength={NOTES_MAX_LENGTH}
              placeholder="mis. takut hairdryer, mandi duluan"
              hint="Hanya untuk staf — tidak pernah ditampilkan ke pelanggan."
              disabled={disabled}
            />

            <TextareaField
              label="Catatan untuk pelanggan"
              name={`card-customer-notes-${card.key}`}
              value={card.customerNotes}
              onChange={(event) =>
                onChange({ customerNotes: event.target.value })
              }
              maxLength={NOTES_MAX_LENGTH}
              placeholder="mis. bulunya kusut parah, disarankan grooming tiap 3 minggu"
              /*
                IT SAYS WHERE THIS DOES *NOT* APPEAR YET. Nothing prints it on a
                struk or sends it over WhatsApp today, and a field that looks
                like it reaches the owner but does not is worse than one that is
                honest about it.
              */
              hint="Ditulis untuk pemilik hewan. Belum tampil otomatis di struk atau WhatsApp — sampaikan sendiri saat serah terima."
              disabled={disabled}
            />

            {/*
              BARANG BAWAAN — ticked in and out on the booking's own page, listed
              here. Nothing here ticks anything in: this is what the owner says
              they will bring, and the counter confirms it on arrival.
            */}
            <BelongingList
              belongings={card.belongings}
              cardName={cardName}
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
  cardName,
  children,
}: {
  label: string;
  count: number;
  cardName: string;
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
        aria-label={`${label} ${cardName}`}
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
  cardName,
  disabled,
  onChange,
}: {
  belongings: BelongingDraft[];
  cardName: string;
  disabled: boolean;
  onChange: (next: BelongingDraft[]) => void;
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
          {belongings.map((belonging, position) => (
            <li
              key={belonging._id ?? `${belonging.name}-${position}`}
              className="flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm"
            >
              {belonging.name}
              <button
                type="button"
                aria-label={`Hapus ${belonging.name}`}
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
        cardName={cardName}
        disabled={disabled}
        onAdd={(name) => onChange([...belongings, { name }])}
      />
    </div>
  );
}

function BelongingInput({
  cardName,
  disabled,
  onAdd,
}: {
  cardName: string;
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
        aria-label={`Tambah barang bawaan ${cardName}`}
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
