"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Card, CheckRow, CheckRowGroup, FilterSelect, TextareaField } from "@/components";
import { money } from "@/features/grooming/components/BookingPriceControls";
import { useGroomingLine } from "@/features/grooming/hooks/useGroomingLine";
import type { useVariantQuote } from "@/features/services";
import { bookingService } from "@/services/booking.service";
import { toMinor } from "@/utils/decimal";
import type {
  CreateBookingInput,
  GroomerAvailability,
  Pet,
  Service,
  TripLeg,
  VariantChoice,
} from "@/types/api";

import { ANTAR_JEMPUT_LINE } from "../line";
import {
  arahCardOf,
  choicesForLeg,
  LEG_LABEL,
  slotAtOrAfter,
  slotAtOrBefore,
} from "../ride";
import { TimeSlotField } from "./TimeSlotField";

type VariantQuote = ReturnType<typeof useVariantQuote>;

/** What the grooming form holds for the rides it will save after itself. */
export interface RideDraft {
  legs: TripLeg[];
  serviceId: string;
  driverId: string;
  times: Record<TripLeg, string>;
  address: string;
  /** The "Dipilih staf" answers other than Arah. */
  choices: VariantChoice[];
}

export const BLANK_RIDE: RideDraft = {
  legs: [],
  serviceId: "",
  driverId: "",
  times: { pickup: "", delivery: "" },
  address: "",
  choices: [],
};

/** The Antar-Jemput line's main services, out of the list the form already read. */
export function useRideServices(services: Service[]): Service[] {
  const line = useGroomingLine(ANTAR_JEMPUT_LINE);

  return useMemo(
    () =>
      services.filter(
        (service) =>
          service.serviceType === "main" &&
          (line.line ? service.businessLineId === line.line._id : false),
      ),
    [services, line.line],
  );
}

/** Each chosen ride, quoted — for the section, the Ringkasan and the blocked reason. */
export function quoteRides(
  draft: RideDraft,
  service: Service | null,
  pet: Pet | null,
  riders: number,
  variant: VariantQuote,
) {
  const cards = variant.cardsFor([service]);

  return draft.legs.map((leg) => {
    const choices = choicesForLeg(service, cards, leg, draft.choices);
    const quote = variant.quote(service, pet, choices);
    const unit = quote.price === null ? null : toMinor(quote.price);
    const perAnimal = service?.billingUnit === "per_pet";

    return {
      leg,
      choices,
      problem: service ? variant.problemOf(service, quote) : null,
      missing: quote.missingAxis !== null || quote.inactive,
      price: unit === null ? null : perAnimal ? unit * BigInt(Math.max(1, riders)) : unit,
    };
  });
}

/** Why the rides cannot be saved yet, or null. */
export function rideBlockedReason(
  draft: RideDraft,
  quoted: ReturnType<typeof quoteRides>,
): string | null {
  if (draft.legs.length === 0) return null;
  if (!draft.serviceId) return "Layanan antar-jemput belum dipilih.";
  const missingTime = draft.legs.find((leg) => draft.times[leg] === "");
  if (missingTime) return `Jam ${LEG_LABEL[missingTime].toLowerCase()} belum dipilih.`;
  const problem = quoted.find((row) => row.problem)?.problem;
  if (problem) return `${problem}.`;
  if (quoted.some((row) => row.missing)) return "Harga antar-jemput belum bisa dihitung.";
  return null;
}

/**
 * The saves that follow the grooming's — one POST per direction, INTO THE
 * VISIT the grooming just made (`groupId`), so each lists the other under
 * Booking terkait. The grooming's first animal rides as the booking's own; the
 * others are its passengers.
 */
export function rideRequests({
  draft,
  quoted,
  service,
  date,
  base,
  petIds,
  customerAddress,
}: {
  draft: RideDraft;
  quoted: ReturnType<typeof quoteRides>;
  service: Service;
  date: string;
  base: Pick<CreateBookingInput, "customerId" | "branchId" | "groupId">;
  petIds: string[];
  customerAddress: string | null;
}): { leg: TripLeg; input: CreateBookingInput }[] {
  const typed = draft.address.trim();
  const tripAddress = typed === "" || typed === (customerAddress ?? "").trim() ? null : typed;

  return quoted.map((row) => ({
    leg: row.leg,
    input: {
      ...base,
      scheduledAt: new Date(`${date}T${draft.times[row.leg]}`).toISOString(),
      status: "requested",
      location: (service.serviceLocations ?? []).includes("in_home") ? "in_home" : "in_store",
      tripAddress,
      bookings: [
        {
          petId: petIds[0],
          serviceId: service._id,
          groomerUserId: draft.driverId || null,
          tripLeg: row.leg,
          passengerPetIds: petIds.slice(1),
          ...(row.choices.length > 0 ? { variantChoices: row.choices } : {}),
        },
      ],
    },
  }));
}

/**
 * "Antar-jemput" on Grooming's Booking baru — BO's note 4 (21 September 2026):
 * a service switched to "Bisa antar-jemput" offers the van here, so the ride is
 * booked with the grooming instead of on a second form afterwards.
 *
 * JEMPUT AND ANTAR ARE TICKED APART — a dog dropped off by its owner may still
 * be taken home. Ticking one fills its time from the grooming's: the van leaves
 * half an hour before, and brings the dog back once the work is expected done.
 * Prices are the catalogue's; the ride form is where a price is typed.
 *
 * CONTROLLED: the grooming form holds the draft, because the Ringkasan and the
 * save are the form's.
 */
export function RideForGroomingSection({
  value,
  onChange,
  services,
  variant,
  pet,
  riders,
  date,
  time,
  minutes,
  customerAddress,
  disabled,
}: {
  value: RideDraft;
  onChange: (next: RideDraft) => void;
  /** Every active service the form read — narrowed to the Antar-Jemput line here. */
  services: Service[];
  variant: VariantQuote;
  /** The grooming's first animal — the ride's own. */
  pet: Pet | null;
  /** Every animal on the grooming. */
  riders: number;
  /** The grooming's date and start, and how long its work is expected to take. */
  date: string;
  time: string;
  minutes: number;
  customerAddress: string | null;
  disabled: boolean;
}) {
  const rideServices = useRideServices(services);
  const [drivers, setDrivers] = useState<GroomerAvailability[]>([]);
  const service = rideServices.find((one) => one._id === value.serviceId) ?? null;
  const cards = variant.cardsFor([service]);
  const arah = arahCardOf(service, cards);
  const asked = cards.filter((card) => card.axisKey !== arah?.card.axisKey);
  const quoted = quoteRides(value, service, pet, riders, variant);

  useEffect(() => {
    if (date === "") return;
    let active = true;

    bookingService
      .availability(date, "driver")
      .then((rows) => {
        if (active) setDrivers(rows);
      })
      .catch(() => {
        if (active) setDrivers([]);
      });

    return () => {
      active = false;
    };
  }, [date]);

  /* The only ride service there is, chosen for them. */
  const sole = rideServices.length === 1 ? rideServices[0]._id : "";
  useEffect(() => {
    if (sole && value.serviceId === "" && value.legs.length > 0) {
      onChange({ ...value, serviceId: sole });
    }
  }, [sole, value, onChange]);

  function defaultTime(leg: TripLeg): string {
    const start = new Date(`${date}T${time || "09:00"}`);
    if (Number.isNaN(start.getTime())) return "";
    return leg === "pickup"
      ? slotAtOrBefore(new Date(start.getTime() - 30 * 60_000))
      : slotAtOrAfter(new Date(start.getTime() + Math.max(minutes, 30) * 60_000));
  }

  function toggle(leg: TripLeg, on: boolean) {
    const legs = on
      ? (["pickup", "delivery"] as TripLeg[]).filter((one) => one === leg || value.legs.includes(one))
      : value.legs.filter((one) => one !== leg);

    onChange({
      ...value,
      legs,
      address: value.address || customerAddress || "",
      times: on ? { ...value.times, [leg]: value.times[leg] || defaultTime(leg) } : value.times,
    });
  }

  return (
    <Card
      title="Antar-jemput"
      description="Layanan ini bisa dijemput dan diantar. Centang yang dibutuhkan — tersimpan sebagai booking antar-jemput yang terkait dengan grooming ini."
    >
      <div className="flex flex-col gap-4">
        <CheckRowGroup>
          <CheckRow
            label="Jemput"
            description="Dari rumah pelanggan ke cabang, sebelum grooming"
            checked={value.legs.includes("pickup")}
            disabled={disabled}
            onCheckedChange={(on) => toggle("pickup", on)}
          />
          <CheckRow
            label="Antar pulang"
            description="Dari cabang ke rumah pelanggan, setelah grooming"
            checked={value.legs.includes("delivery")}
            disabled={disabled}
            onCheckedChange={(on) => toggle("delivery", on)}
          />
        </CheckRowGroup>

        {value.legs.length > 0 && (
          <>
            {rideServices.length === 0 && (
              <Alert variant="warning">
                Belum ada layanan di lini Antar-Jemput. Tambahkan dulu di Layanan ›
                Antar-Jemput › Layanan &amp; Harga.
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FilterSelect
                layout="form"
                label="Layanan antar-jemput"
                value={value.serviceId}
                onChange={(serviceId) => onChange({ ...value, serviceId, choices: [] })}
                options={rideServices.map((one) => ({ value: one._id, label: one.name }))}
                active={false}
                placeholder="Pilih layanan…"
                closeOnScroll
                required
                disabled={disabled}
              />
              <FilterSelect
                layout="form"
                label="Driver"
                value={value.driverId}
                onChange={(driverId) => onChange({ ...value, driverId })}
                options={[
                  { value: "", label: "Belum ditugaskan" },
                  ...drivers.map((driver) => ({
                    value: driver._id,
                    label: driver.offReason ? `${driver.fullName} — ${driver.offReason}` : driver.fullName,
                    disabled: Boolean(driver.offReason),
                  })),
                ]}
                active={false}
                placeholder="Belum ditugaskan"
                closeOnScroll
                disabled={disabled}
              />
              {value.legs.map((leg) => (
                <TimeSlotField
                  key={leg}
                  label={`Jam ${leg === "pickup" ? "jemput" : "antar pulang"}`}
                  value={value.times[leg]}
                  onChange={(next) => onChange({ ...value, times: { ...value.times, [leg]: next } })}
                  disabled={disabled}
                />
              ))}
            </div>

            {asked.map((card) => {
              const current = value.choices.find((choice) => choice.optionId === card.axisKey)?.code ?? "";
              return (
                <FilterSelect
                  key={card._id}
                  layout="form"
                  label={card.name}
                  value={current}
                  onChange={(code) =>
                    onChange({
                      ...value,
                      choices: [
                        ...value.choices.filter((choice) => choice.optionId !== card.axisKey),
                        { optionId: card.axisKey, code },
                      ],
                    })
                  }
                  options={card.values
                    .filter((option) => option.isActive)
                    .map((option) => ({ value: option.code, label: option.label }))}
                  active={false}
                  placeholder={`Pilih ${card.name.toLowerCase()}`}
                  required
                  disabled={disabled}
                />
              );
            })}

            <TextareaField
              label="Alamat jemput / antar"
              name="grooming-ride-address"
              value={value.address}
              onChange={(event) => onChange({ ...value, address: event.target.value })}
              rows={2}
              maxLength={300}
              hint="Terisi dari alamat pelanggan — ubah kalau kali ini ke alamat lain."
              disabled={disabled}
            />

            {service && (
              <ul className="flex flex-col gap-1 rounded-md bg-background px-3 py-2.5 text-sm">
                {quoted.map((row) => (
                  <li key={row.leg} className="flex justify-between gap-3">
                    <span className="text-muted">
                      {LEG_LABEL[row.leg]} · {service.name}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {row.price === null ? (row.problem ?? "—") : money(row.price)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
