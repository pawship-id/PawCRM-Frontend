"use client";

import { X } from "lucide-react";

import { SelectField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import type { Pet, Service } from "@/types/api";

/**
 * The groomer select's "nobody yet" row.
 *
 * A REAL VALUE, not `""`: Radix refuses an empty `SelectItem`, and an empty root
 * value is how "nothing chosen" is spelled — which is not what this means. It is
 * a deliberate answer (FR-3's "Belum ditentukan") and is sent to the API as
 * `null`.
 */
export const UNASSIGNED = "belum-ditentukan";

/** One line of the form: this animal, having this service. */
export interface PetRowDraft {
  /** Local only — React's key and the remove target. Never sent. */
  key: string;
  petId: string;
  serviceId: string;
  groomerUserId: string;
  /** As typed. Empty means "use the catalogue's", which the parent resolves. */
  durationMin: string;
  notes: string;
}

/**
 * One animal on a booking (FR-2 / PCR-041).
 *
 * WHY A CARD AND NOT A ROW IN A TABLE. Five controls per animal, two of them
 * selects that need room for a name — a table would either scroll sideways on
 * the phone the receptionist is holding or shrink every label to an abbreviation.
 * The card also gives the alert below somewhere to sit.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: fetch anything. Pets, services and groomers
 * are loaded once by the dialog and handed down, because a card that fetched its
 * own would ask three times over for a customer with three dogs.
 */
export function BookingPetRowCard({
  row,
  index,
  pets,
  services,
  groomers,
  disabled,
  removable,
  duplicate,
  onChange,
  onRemove,
}: {
  row: PetRowDraft;
  index: number;
  pets: Pet[];
  services: Service[];
  groomers: { value: string; label: string }[];
  disabled: boolean;
  /** False on the last remaining card — a booking with no animals is not one. */
  removable: boolean;
  /** Set when this exact animal + service is already on the booking. */
  duplicate: boolean;
  onChange: (next: Partial<PetRowDraft>) => void;
  onRemove: () => void;
}) {
  const service = services.find((item) => item._id === row.serviceId) ?? null;
  const pet = pets.find((item) => item._id === row.petId) ?? null;

  /*
    THE CATALOGUE'S DURATION, shown when nothing was typed over it. The field is
    left EMPTY rather than pre-filled with the number, so what the receptionist
    sees is "90 menit (dari layanan)" until they choose to disagree — and an
    untouched form sends no duration at all, which is what lets the server keep
    following the catalogue if it changes before the appointment.
  */
  const catalogueDuration = service?.durationMin ?? null;

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {pet?.name ?? `Hewan ${index + 1}`}
        </span>
        {removable && (
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Hewan"
          value={row.petId}
          onChange={(value) => onChange({ petId: value })}
          options={pets.map((item) => ({ value: item._id, label: item.name }))}
          placeholder="Pilih hewan…"
          disabled={disabled}
          required
        />

        <SelectField
          label="Layanan"
          value={row.serviceId}
          onChange={(value) => onChange({ serviceId: value })}
          options={services.map((item) => ({
            value: item._id,
            label: `${item.name} · ${formatMoney(item.price)}`,
          }))}
          placeholder="Pilih layanan…"
          disabled={disabled}
          required
        />

        {/*
          ASSIGNMENT IS OPTIONAL AND THE SELECT SIMPLY DOES NOT APPEAR when the
          staff list could not be read — reading /api/users takes a permission a
          receptionist who books all day has no other reason to hold. A red
          banner over a working form would be the wrong answer to that.
        */}
        {groomers.length > 0 && (
          <SelectField
            label="Groomer"
            value={row.groomerUserId}
            onChange={(value) => onChange({ groomerUserId: value })}
            options={[
              { value: UNASSIGNED, label: "Belum ditentukan" },
              ...groomers,
            ]}
            disabled={disabled}
          />
        )}

        <TextField
          label="Durasi (menit)"
          name={`row-duration-${row.key}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          value={row.durationMin}
          onChange={(event) => onChange({ durationMin: event.target.value })}
          placeholder={catalogueDuration ? String(catalogueDuration) : "—"}
          hint={
            catalogueDuration
              ? `Dari layanan: ${catalogueDuration} menit. Isi kalau hewan ini butuh lebih lama.`
              : "Layanan ini belum punya durasi."
          }
          disabled={disabled}
        />
      </div>

      <div className="mt-3">
        <TextField
          label="Catatan"
          name={`row-notes-${row.key}`}
          value={row.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          maxLength={500}
          placeholder="mis. mandi duluan, jangan blow keras"
          disabled={disabled}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm tabular-nums text-muted">
          {service ? formatMoney(service.price) : "—"}
        </span>
        {/*
          THE DUPLICATE IS NAMED, not reported as "one of these is wrong". With
          four cards on screen a message that does not say WHICH animal is a
          message somebody has to solve rather than read (PRD 2.7).
        */}
        {duplicate && (
          <p role="alert" className="text-xs font-semibold text-danger">
            {pet?.name ?? "Hewan ini"} sudah punya layanan yang sama di booking
            ini.
          </p>
        )}
      </div>
    </li>
  );
}
