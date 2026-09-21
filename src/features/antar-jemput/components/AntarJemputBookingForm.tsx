"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Plus, Search } from "lucide-react";

import {
  Alert,
  Card,
  CheckRow,
  CheckRowGroup,
  FIELD_HEIGHT,
  FilterSelect,
  FormActionBar,
  Spinner,
  TextField,
  TextareaField,
  namedOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useVisitBookings, visitLabel } from "@/features/booking/hooks/useVisitBookings";
import { variantRefusalOf } from "@/features/booking/variantLine";
import { CustomerSearchDialog } from "@/features/customers";
import {
  BLANK_PRICE,
  blankPetDraft,
  priceLine,
  toEntry,
  type PriceDraft,
  type PricedLine,
} from "@/features/grooming/bookingCreateDraft";
import {
  badge,
  Fact,
  Initial,
  money,
  PriceRow,
  SummaryLine,
  todayValue,
  toScheduledAt,
} from "@/features/grooming/components/BookingPriceControls";
import { ChoiceCards } from "@/features/grooming/components/GroomingSettingsControls";
import { useGroomingLine } from "@/features/grooming/hooks/useGroomingLine";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { usePermissions } from "@/features/permissions";
import { PetFixLink, PetQuickAddDialog } from "@/features/pets";
// `PageHeading` is still purchasing-local, awaiting promotion (ui-rules §15).
import { PageHeading } from "@/features/purchasing";
import { useVariantQuote, VariantChoicePicker } from "@/features/services";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { toDecimalString, toMinor } from "@/utils/decimal";
import { AXIS_LABEL, variesByZone } from "@/utils/serviceVariant";
import type {
  Booking,
  BookingLocation,
  Customer,
  GroomerAvailability,
  Pet,
  Service,
  TripLeg,
  UpdateBookingInput,
  VariantChoice,
} from "@/types/api";

import { ANTAR_JEMPUT_LINE } from "../line";
import { ANTAR_JEMPUT_PATH } from "../paths";
import {
  arahCardOf,
  choicesForLeg,
  LEG_CHOICES,
  LEG_LABEL,
  legsOf,
  otherLeg,
  routeOf,
  slotAtOrAfter,
  slotAtOrBefore,
  type LegChoice,
} from "../ride";
import { TimeSlotField } from "./TimeSlotField";

/** The API's page cap. */
const FETCH_LIMIT = 100;

/** Mirrors NOTES_MAX_LENGTH in booking.model.js. */
const NOTES_MAX_LENGTH = 500;

/** Mirrors TRIP_ADDRESS_MAX_LENGTH in booking.model.js. */
const ADDRESS_MAX_LENGTH = 300;

interface Schedule {
  date: string;
  time: string;
}

/** A ride's service is done at the customer's door when it says so — else in the shop. */
function rideLocation(service: Service | null): BookingLocation {
  return (service?.serviceLocations ?? []).includes("in_home") ? "in_home" : "in_store";
}

/** "2026-09-22" from an instant, on the shop's clock. */
function dateOf(at: Date): string {
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function choicesKey(choices: readonly VariantChoice[]): string {
  return JSON.stringify(
    [...choices].sort((x, y) => x.optionId.localeCompare(y.optionId)),
  );
}

/**
 * Layanan › Antar-Jemput › Booking baru — and, with `bookingId`, Ubah booking.
 * From `buloo-antar-jemput-v5.html` and BO's notes of 21 September 2026.
 *
 * ─── ONE RIDE, ONE BOOKING ─────────────────────────────────────────────────
 *
 * The first animal picked is the booking's own; the others ride along as
 * passengers (decided 21 September 2026 — one trip is billed once, not once per
 * animal as two bookings would). "Pulang-pergi" saves TWO rides, the pickup
 * then the delivery, in one visit.
 *
 * ─── WHAT IT DOES THAT GROOMING'S FORM DOES THE SAME WAY ────────────────────
 *
 * The customer picker, the price rows (`BookingPriceControls`), the variant
 * picker and the grant rules on a typed price are Grooming's. The PIC is picked
 * from the drivers (note 6), and the service's options are the ones set in
 * Layanan & Harga (note 7) — the "Arah" option among them is answered from the
 * direction chosen here rather than asked twice.
 *
 * ─── WHAT IS ITS OWN ────────────────────────────────────────────────────────
 *
 * "Tautkan ke booking" (note 2) joins the ride to another booking of the same
 * customer — `groupId` on the save — so each shows the other under Booking
 * terkait. `?bookingId=` arrives from that booking's own "+ Antar-jemput" and
 * fills the customer, the animal, the branch, the day and the link. The time is
 * picked every half hour (note 8).
 *
 * ─── EDITING ────────────────────────────────────────────────────────────────
 *
 * One ride, as `PATCH /bookings/:id` takes it: the day, the direction, the
 * address, the animals, the service and its options. Prices are the catalogue's
 * — the edit route takes no typed price — and the driver is changed on the
 * booking's page, turn by turn, the way Grooming's crew is.
 */
export function AntarJemputBookingForm({
  bookingId,
  fromBookingId,
}: {
  /** Editing this ride. */
  bookingId?: string;
  /** A ride for this booking — "+ Antar-jemput" on its page. */
  fromBookingId?: string;
}) {
  const editing = bookingId !== undefined;
  const router = useRouter();
  const { can } = usePermissions();
  const mayPrice = can("bookings", "setPrice") && !editing;
  const { label: optionLabel } = usePetOptions();
  const line = useGroomingLine(ANTAR_JEMPUT_LINE);

  const scope = useBranchScope();
  const [pickedBranch, setPickedBranch] = useState("");
  const branchId = pickedBranch || scope.soleBranch;
  const branch = scope.branches.find((one) => one._id === branchId) ?? null;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [petsNonce, setPetsNonce] = useState(0);
  const [loadingPets, setLoadingPets] = useState(false);
  /** The animals in the van, in the order picked — the first is the booking's own. */
  const [riders, setRiders] = useState<string[]>([]);

  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [drivers, setDrivers] = useState<GroomerAvailability[]>([]);

  const [legChoice, setLegChoice] = useState<LegChoice>("pickup");
  const [schedules, setSchedules] = useState<Record<TripLeg, Schedule>>(() => ({
    pickup: { date: todayValue(), time: slotAtOrAfter(new Date()) },
    delivery: { date: todayValue(), time: slotAtOrAfter(new Date(Date.now() + 3 * 3_600_000)) },
  }));
  const [address, setAddress] = useState("");
  /** The booking this ride joins — its `_id`; "" is a visit of its own. */
  const [linkId, setLinkId] = useState("");

  const [serviceId, setServiceId] = useState("");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [driverId, setDriverId] = useState("");
  /** The "Dipilih staf" answers OTHER than Arah — see `choicesForLeg`. */
  const [variantChoices, setVariantChoices] = useState<VariantChoice[]>([]);
  const [mainDrafts, setMainDrafts] = useState<Record<TripLeg, PriceDraft>>({
    pickup: BLANK_PRICE,
    delivery: BLANK_PRICE,
  });
  const [addonDrafts, setAddonDrafts] = useState<Record<string, PriceDraft>>({});
  const [internalNotes, setInternalNotes] = useState("");

  const [original, setOriginal] = useState<Booking | null>(null);
  const [prefilled, setPrefilled] = useState(!editing && !fromBookingId);
  const [picking, setPicking] = useState(false);
  const [addingPet, setAddingPet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [clash, setClash] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const variant = useVariantQuote({
    branchPin: branch?.location,
    customerPin: customer?.location,
  });
  const visits = useVisitBookings(editing ? null : (customer?._id ?? null), bookingId);

  const legs: TripLeg[] = editing
    ? [legChoice === "both" ? "pickup" : legChoice]
    : legsOf(legChoice);
  const firstLeg = legs[0];

  /* ─── Reads ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    let active = true;

    serviceService
      .list({ isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (active) setServices(result.items);
      })
      .catch(() => {
        if (active) setLoadError("Daftar layanan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoadingServices(false);
      });

    return () => {
      active = false;
    };
  }, []);

  /* The drivers on the ride's day. Best effort: assignment is optional. */
  const driverDate = schedules[firstLeg].date;
  useEffect(() => {
    if (driverDate === "") return;
    let active = true;

    bookingService
      .availability(driverDate, "driver")
      .then((rows) => {
        if (active) setDrivers(rows);
      })
      .catch(() => {
        if (active) setDrivers([]);
      });

    return () => {
      active = false;
    };
  }, [driverDate]);

  useEffect(() => {
    if (!customer) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPets(true);

    petService
      .list({ customerId: customer._id, isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (active) setPets(result.items);
      })
      .catch(() => {
        if (!active) return;
        setPets([]);
        setLoadError("Daftar hewan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoadingPets(false);
      });

    return () => {
      active = false;
    };
  }, [customer, petsNonce]);

  /*
    THE BOOKING THIS STARTS FROM — the ride being edited, or the booking whose
    "+ Antar-jemput" opened the form. Read once; everything it fills stays
    editable.
  */
  useEffect(() => {
    const sourceId = bookingId ?? fromBookingId;
    if (!sourceId) return;
    let active = true;

    bookingService
      .getById(sourceId)
      .then(async (source) => {
        const owner = await customerService.getById(source.customerId);
        if (!active) return;

        const at = new Date(source.scheduledAt);
        setCustomer(owner);
        setPickedBranch(source.branchId);

        if (bookingId) {
          const leg = source.tripLeg ?? "pickup";
          setOriginal(source);
          setLegChoice(leg);
          setRiders([source.petId, ...(source.passengerPetIds ?? [])]);
          setSchedules((prev) => ({
            ...prev,
            [leg]: { date: dateOf(at), time: slotAtOrBefore(at) },
          }));
          setAddress(source.tripAddress ?? owner.address ?? "");
          setServiceId(source.service.serviceId);
          setAddonIds((source.service.addons ?? []).map((addon) => addon.serviceId));
          setVariantChoices(
            (source.service.variantChoices ?? []).map((choice) => ({
              optionId: choice.optionId,
              code: choice.code,
            })),
          );
          setInternalNotes(source.internalNotes ?? "");
        } else {
          /*
            A RIDE FOR ANOTHER BOOKING. For a grooming or a stay: both ways, the
            van leaving half an hour before it and bringing the animal home once
            the work is expected to be done. For a ride: the other direction.
          */
          const end = new Date(at.getTime() + (source.totalDurationMin ?? 60) * 60_000);
          setRiders([source.petId]);
          setLinkId(source._id);
          setAddress(owner.address ?? "");
          if (source.tripLeg) {
            const leg = otherLeg(source.tripLeg);
            setLegChoice(leg);
            setSchedules((prev) => ({
              ...prev,
              [leg]: { date: dateOf(at), time: slotAtOrAfter(leg === "delivery" ? end : at) },
            }));
          } else {
            setLegChoice("both");
            setSchedules({
              pickup: {
                date: dateOf(at),
                time: slotAtOrBefore(new Date(at.getTime() - 30 * 60_000)),
              },
              delivery: { date: dateOf(end), time: slotAtOrAfter(end) },
            });
          }
        }
        setPrefilled(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError && error.status === 404
            ? "Booking asalnya tidak ditemukan."
            : "Booking asalnya tidak bisa dimuat. Coba lagi.",
        );
        setPrefilled(true);
      });

    return () => {
      active = false;
    };
  }, [bookingId, fromBookingId]);

  const serviceOf = useCallback(
    (id: string) => services.find((service) => service._id === id) ?? null,
    [services],
  );

  /* The Antar-Jemput line's main services. Without a line, every main service. */
  const rideServices = useMemo(
    () =>
      services.filter(
        (service) =>
          service.serviceType === "main" &&
          (!line.line || service.businessLineId === line.line._id),
      ),
    [services, line.line],
  );

  /* ─── What the form comes to ──────────────────────────────────────────── */

  const service = serviceOf(serviceId);
  const primary = pets.find((pet) => pet._id === riders[0]) ?? null;
  const passengers = riders.slice(1);
  const addons = addonIds.map((id) => serviceOf(id)).filter((one): one is Service => one !== null);
  const offered = (service?.addonServiceIds ?? [])
    .map((id) => serviceOf(id))
    .filter((one): one is Service => one !== null);
  const cards = variant.cardsFor([service, ...addons]);
  const arah = arahCardOf(service, cards);
  /* Arah is answered by the direction — it is not asked as a select. */
  const askedCards = cards.filter((card) => card.axisKey !== arah?.card.axisKey);
  const perAnimal = service?.billingUnit === "per_pet";
  const riderCount = Math.max(1, riders.length);

  const priced = legs.map((leg) => {
    const choices = choicesForLeg(service, cards, leg, variantChoices);
    const quote = variant.quote(service, primary, choices);
    const unit = quote.price === null ? null : toMinor(quote.price);
    const quoted =
      unit === null ? null : toDecimalString(perAnimal ? unit * BigInt(riderCount) : unit);
    const main = priceLine(quoted, mayPrice ? mainDrafts[leg] : BLANK_PRICE);
    const addonLines = addons.map((addon) => {
      const addonQuote = variant.quote(addon, primary, choices);
      return {
        addon,
        quote: addonQuote,
        problem: variant.problemOf(addon, addonQuote),
        line: priceLine(addonQuote.price, mayPrice ? (addonDrafts[addon._id] ?? BLANK_PRICE) : BLANK_PRICE),
      };
    });
    const lines: PricedLine[] = [main, ...addonLines.map((row) => row.line)];

    return {
      leg,
      choices,
      quote,
      problem: service ? variant.problemOf(service, quote) : null,
      main,
      addons: addonLines,
      net: lines.reduce((sum, row) => sum + row.net, 0n),
    };
  });
  const total = priced.reduce((sum, row) => sum + row.net, 0n);

  const customerEnd = address.trim() || customer?.address || "Alamat pelanggan";
  const branchEnd = branch?.address || branch?.name || "Cabang";

  const unscheduled = legs.find(
    (leg) => schedules[leg].date === "" || schedules[leg].time === "",
  );
  const backwards =
    legChoice === "both" &&
    !editing &&
    `${schedules.delivery.date}T${schedules.delivery.time}` <
      `${schedules.pickup.date}T${schedules.pickup.time}`;
  const unanswered = priced
    .map((row) => row.problem ?? row.addons.find((addon) => addon.problem)?.problem ?? null)
    .find((problem): problem is string => problem !== null);

  const blockedReason = !prefilled
    ? "Memuat booking asal…"
    : !branchId
      ? "Cabang belum dipilih."
      : !customer
        ? "Pelanggan belum dipilih."
        : riders.length === 0
          ? "Hewan belum dipilih."
          : primary && !primary.size
            ? `Ukuran ${primary.name} belum diisi.`
            : !service
              ? "Layanan antar-jemput belum dipilih."
              : priced.some((row) => row.quote.missingAxis !== null)
                ? `Data ${primary?.name ?? "hewan"} belum lengkap, harganya belum bisa dihitung.`
                : unanswered
                  ? `${unanswered}.`
                  : priced.some((row) => row.quote.inactive)
                    ? "Varian layanan ini sedang nonaktif."
                    : unscheduled
                      ? `Tanggal dan jam ${LEG_LABEL[unscheduled].toLowerCase()} belum lengkap.`
                      : backwards
                        ? "Jam antar harus setelah jam jemput."
                        : null;

  function chooseCustomer(next: Customer) {
    setCustomer(next);
    setPets([]);
    setRiders([]);
    setLinkId("");
    setAddress(next.address ?? "");
    setClash(null);
    setRefusal(null);
  }

  function toggleRider(petId: string) {
    setRiders((prev) =>
      prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId],
    );
    setClash(null);
  }

  function setSchedule(leg: TripLeg, patch: Partial<Schedule>) {
    setSchedules((prev) => ({ ...prev, [leg]: { ...prev[leg], ...patch } }));
    setClash(null);
  }

  /** Tukar: a pickup becomes a delivery and back — the ends swap with it. */
  function swap() {
    if (legChoice === "both") return;
    const next = otherLeg(legChoice);
    setSchedules((prev) => ({ ...prev, [next]: prev[legChoice] }));
    setMainDrafts((prev) => ({ ...prev, [next]: prev[legChoice] }));
    setLegChoice(next);
  }

  /* ─── Saving ─────────────────────────────────────────────────────────── */

  function entryFor(leg: TripLeg) {
    const draft = {
      ...blankPetDraft(riders[0]),
      serviceId,
      addonServiceIds: addonIds,
      groomerUserId: driverId,
      internalNotes,
      main: mayPrice ? mainDrafts[leg] : BLANK_PRICE,
      addons: mayPrice ? addonDrafts : {},
      variantChoices: choicesForLeg(service, cards, leg, variantChoices),
    };

    return { ...toEntry(draft, serviceOf), tripLeg: leg, passengerPetIds: passengers };
  }

  /** Null — the customer's stored address — when it was left as it is. */
  function tripAddressValue(): string | null {
    const typed = address.trim();
    return typed === "" || typed === (customer?.address ?? "").trim() ? null : typed;
  }

  function handleError(error: unknown) {
    const refused = variantRefusalOf(error);
    if (refused) {
      setRefusal(refused.message);
    } else if (error instanceof ApiError && error.status === 409) {
      setClash(error.fullMessage);
    } else if (error instanceof ApiError) {
      setFormError(error.fullMessage);
    } else {
      setFormError("Terjadi kesalahan. Coba lagi.");
    }
  }

  async function create() {
    if (!customer) return;
    const link = visits.bookings.find((one) => one._id === linkId);
    let groupId = link?.groupId;
    const made: Booking[] = [];

    for (const leg of legs) {
      const scheduledAt = toScheduledAt(schedules[leg].date, schedules[leg].time);
      if (!scheduledAt) {
        setFormError("Tanggal dan jamnya belum lengkap.");
        break;
      }

      try {
        const result = await bookingService.create({
          customerId: customer._id,
          branchId,
          scheduledAt,
          status: "requested",
          location: rideLocation(service),
          tripAddress: tripAddressValue(),
          forceClash: clash !== null,
          ...(groupId ? { groupId } : {}),
          bookings: [entryFor(leg)],
        });
        made.push(...result.bookings);
        groupId = result.groupId;
      } catch (error) {
        if (made.length === 0) {
          handleError(error);
          setSaving(false);
          return;
        }

        /*
          THE PICKUP IS SAVED AND THE DELIVERY IS NOT. The two are two saves, so
          this can happen; the ride that exists is shown, and the missing one is
          added from its page ("+ Antar-jemput" fills everything back in).
        */
        router.push(`/dashboard/booking/${made[0]._id}`);
        try {
          swalToast(
            `${LEG_LABEL[made[0].tripLeg ?? "pickup"]} tersimpan, ${LEG_LABEL[leg].toLowerCase()} belum: ${
              error instanceof ApiError ? error.fullMessage : "coba lagi"
            }. Tambahkan dari tombol + Antar-jemput.`,
            "error",
            9000,
          );
        } catch {
          /* The page it landed on shows what exists. */
        }
        return;
      }
    }

    if (made.length === 0) {
      setSaving(false);
      return;
    }

    router.push(`/dashboard/booking/${made[0]._id}`);
    router.refresh();
    try {
      const numbers = made.map((one) => one.bookingNumber).filter(Boolean).join(" & ");
      swalToast(
        made.length > 1
          ? `2 booking pulang-pergi dibuat${numbers ? `: ${numbers}` : ""}.`
          : `Booking ${numbers || "antar-jemput"} dibuat.`,
      );
    } catch {
      /* The page it landed on already shows it. */
    }
  }

  async function update() {
    if (!original || !customer) return;
    const leg = firstLeg;
    const scheduledAt = toScheduledAt(schedules[leg].date, schedules[leg].time);
    if (!scheduledAt) {
      setFormError("Tanggal dan jamnya belum lengkap.");
      setSaving(false);
      return;
    }

    const choices = choicesForLeg(service, cards, leg, variantChoices);
    const patch: UpdateBookingInput = {};
    const originalAddress = original.tripAddress ?? null;
    const nextAddress = tripAddressValue();

    if (new Date(scheduledAt).getTime() !== new Date(original.scheduledAt).getTime()) {
      patch.scheduledAt = scheduledAt;
    }
    if (branchId !== original.branchId) patch.branchId = branchId;
    if (leg !== original.tripLeg) patch.tripLeg = leg;
    if (nextAddress !== originalAddress) patch.tripAddress = nextAddress;
    if (riders[0] !== original.petId) patch.petId = riders[0];
    if (!sameSet(passengers, original.passengerPetIds ?? [])) patch.passengerPetIds = passengers;
    if (serviceId !== original.service.serviceId) patch.serviceId = serviceId;
    if (!sameSet(addonIds, (original.service.addons ?? []).map((addon) => addon.serviceId))) {
      patch.addonServiceIds = addonIds;
    }
    if (
      choicesKey(choices) !==
      choicesKey(
        (original.service.variantChoices ?? []).map(({ optionId, code }) => ({ optionId, code })),
      )
    ) {
      patch.variantChoices = choices;
    }
    if ((internalNotes.trim() || null) !== (original.internalNotes ?? null)) {
      patch.internalNotes = internalNotes.trim() || null;
    }
    if (clash !== null) patch.forceClash = true;

    if (Object.keys(patch).filter((key) => key !== "forceClash").length === 0) {
      router.push(`/dashboard/booking/${original._id}`);
      return;
    }

    try {
      await bookingService.update(original._id, patch);
      router.push(`/dashboard/booking/${original._id}`);
      router.refresh();
      try {
        swalToast("Booking antar-jemput diperbarui.");
      } catch {
        /* The page shows it. */
      }
    } catch (error) {
      handleError(error);
      setSaving(false);
    }
  }

  async function save() {
    if (saving || blockedReason) return;
    setSaving(true);
    setFormError(null);
    setRefusal(null);

    if (editing) await update();
    else await create();
  }

  const cancelHref = editing
    ? `/dashboard/booking/${bookingId}`
    : fromBookingId
      ? `/dashboard/booking/${fromBookingId}`
      : ANTAR_JEMPUT_PATH;

  const submitLabel = editing
    ? "Simpan booking"
    : legs.length > 1
      ? "Simpan 2 booking"
      : "Simpan booking";

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        crumbs={[
          { label: "Layanan" },
          { label: "Antar-Jemput", href: ANTAR_JEMPUT_PATH },
          { label: editing ? "Ubah booking" : "Booking baru" },
        ]}
        title={editing ? `Ubah ${original?.bookingNumber ?? "booking"}` : "Booking antar-jemput baru"}
      >
        {editing
          ? "Satu perjalanan satu booking. Driver diganti di halaman booking."
          : "Satu perjalanan satu booking — hewan lain ikut di perjalanan yang sama. Pulang-pergi disimpan jadi dua booking dalam satu kunjungan."}
      </PageHeading>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        <FormActionBar
          submitLabel={submitLabel}
          submitting={saving}
          disabled={blockedReason !== null}
          blockedReason={blockedReason}
          onCancel={() => {
            if (!saving) router.push(cancelHref);
          }}
        />

        {loadError && <Alert variant="error">{loadError}</Alert>}
        {formError && <Alert variant="error">{formError}</Alert>}
        {refusal && <Alert variant="error">{refusal}</Alert>}
        {line.missing && (
          <Alert variant="warning">
            Belum ada lini bisnis bernama Antar-Jemput, jadi semua layanan utama
            ditawarkan di sini.
          </Alert>
        )}
        {clash && (
          <Alert variant="warning">
            {clash} — tekan Simpan lagi kalau memang mau dijadwalkan bersamaan.
          </Alert>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* ─── PELANGGAN ─── */}
            <Card title="Pelanggan">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>
                    Pelanggan<span className="text-danger"> *</span>
                  </Label>
                  <Button
                    type="button"
                    variant="secondary"
                    className={`${FIELD_HEIGHT} justify-start font-normal`}
                    disabled={saving || editing}
                    onClick={() => setPicking(true)}
                  >
                    <Search className="size-4 text-muted" aria-hidden />
                    {customer ? (
                      <span className="truncate text-foreground">
                        {customer.name}
                        {customer.phone && (
                          <span className="tabular-nums text-muted"> · {customer.phone}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">Cari nama atau nomor WhatsApp</span>
                    )}
                  </Button>
                </div>

                {customer && (
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <Fact label="WhatsApp">
                      <span className="tabular-nums">{customer.phone ?? "—"}</span>
                    </Fact>
                    <Fact label="Alamat">{customer.address ?? "—"}</Fact>
                    <Fact label="Zona">
                      <span className={variant.zone.ok ? "tabular-nums" : "font-normal text-muted"}>
                        {variant.zoneText}
                      </span>
                    </Fact>
                  </dl>
                )}
              </div>
            </Card>

            {/* ─── HEWAN ─── */}
            <Card
              title="Hewan"
              action={
                <span className={`${badge} bg-tint-neutral text-muted tabular-nums`}>
                  {riders.length} ikut
                </span>
              }
            >
              {!customer ? (
                <p className="text-sm text-muted">
                  Pilih pelanggannya dulu — daftar hewan mengikuti pemiliknya.
                </p>
              ) : loadingPets ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Memuat hewan…
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {pets.length === 0 ? (
                    <p className="text-sm text-muted">{customer.name} belum punya hewan terdaftar.</p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {pets.map((pet) => {
                        const index = riders.indexOf(pet._id);
                        const on = index >= 0;
                        return (
                          <li key={pet._id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              disabled={saving}
                              onClick={() => toggleRider(pet._id)}
                              className={`flex min-h-11 w-full items-center gap-3 rounded-lg border-[1.5px] px-3 py-2.5 text-left transition focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
                                on
                                  ? "border-primary bg-navy-100"
                                  : "border-border bg-surface hover:bg-surface-hover"
                              }`}
                            >
                              <Initial name={pet.name} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-foreground">
                                  {pet.name}
                                </span>
                                <span className="block truncate text-xs text-muted">
                                  {[optionLabel("breed", pet.breed), optionLabel("size", pet.size)]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </span>
                              </span>
                              {index === 0 && (
                                <span className={`${badge} bg-tint-brand text-primary`}>Utama</span>
                              )}
                              {index > 0 && (
                                <span className={`${badge} bg-tint-neutral text-muted`}>Ikut</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="text-xs text-muted">
                    Hewan pertama yang dipilih jadi hewan utama booking. Yang lain
                    ikut di perjalanan yang sama
                    {perAnimal ? " — tarif layanan ini dihitung per hewan." : "."}
                  </p>
                  {primary && !primary.size && (
                    <Alert variant="warning">
                      {primary.name} belum punya ukuran — ukuran wajib diisi untuk
                      booking. <PetFixLink pet={primary} axis="sizeCategory" />
                    </Alert>
                  )}
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => setAddingPet(true)}
                    >
                      <Plus className="size-4" aria-hidden />
                      Daftarkan hewan baru
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* ─── TAUTKAN ─── */}
            {!editing && (
              <Card title="Tautkan ke booking">
                <FilterSelect
                  layout="form"
                  label="Booking"
                  ariaLabel="Tautkan ke booking"
                  value={linkId}
                  onChange={setLinkId}
                  options={[
                    { value: "", label: "Tidak ditautkan — kunjungan sendiri" },
                    ...visits.bookings.map((booking) => ({
                      value: booking._id,
                      label: visitLabel(booking),
                    })),
                  ]}
                  active={false}
                  placeholder="Tidak ditautkan"
                  searchable
                  closeOnScroll
                  disabled={saving || !customer || visits.loading}
                  hint={
                    !customer
                      ? "Pilih pelanggannya dulu."
                      : visits.failed
                        ? "Daftar booking pelanggan ini tidak bisa dimuat."
                        : "Antar-jemput ini jadi satu kunjungan dengan booking itu — keduanya saling muncul di Booking terkait."
                  }
                />
              </Card>
            )}

            {/* ─── PERJALANAN ─── */}
            <Card title="Perjalanan">
              <div className="flex flex-col gap-5">
                <ChoiceCards
                  legend="Arah"
                  value={legChoice}
                  onChange={(next) => {
                    setLegChoice(next);
                    setClash(null);
                  }}
                  options={(editing
                    ? LEG_CHOICES.filter((choice) => choice.value !== "both")
                    : LEG_CHOICES
                  ).map((choice) => ({
                    value: choice.value,
                    label: choice.label,
                    description: choice.hint,
                  }))}
                  disabled={saving}
                />

                {scope.branches.length > 1 && (
                  <FilterSelect
                    layout="form"
                    label="Cabang"
                    ariaLabel="Cabang"
                    value={branchId}
                    options={namedOptions(scope.branches)}
                    active={false}
                    required
                    placeholder="Pilih cabang"
                    disabled={saving}
                    onChange={setPickedBranch}
                  />
                )}

                <TextareaField
                  label="Alamat pelanggan"
                  name="ride-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  maxLength={ADDRESS_MAX_LENGTH}
                  rows={2}
                  placeholder={customer?.address ?? "Alamat jemput / antar"}
                  hint="Terisi dari alamat pelanggan — ubah kalau kali ini ke alamat lain. Zona tetap dihitung dari titik pelanggan."
                  disabled={saving}
                />

                {legs.map((leg) => {
                  const route = routeOf(leg, customerEnd, branchEnd);
                  return (
                    <div
                      key={leg}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`${badge} ${leg === "pickup" ? "bg-tint-info text-info" : "bg-tint-brand text-primary"}`}>
                          {LEG_LABEL[leg]}
                        </span>
                        {legChoice !== "both" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="ml-auto"
                            disabled={saving}
                            onClick={swap}
                          >
                            <ArrowUpDown className="size-4" aria-hidden />
                            Tukar arah
                          </Button>
                        )}
                      </div>
                      <dl className="grid gap-2 text-sm">
                        <div className="flex gap-3">
                          <dt className="w-16 flex-none text-muted">Asal</dt>
                          <dd className="min-w-0 font-medium text-foreground">{route.from}</dd>
                        </div>
                        <div className="flex gap-3">
                          <dt className="w-16 flex-none text-muted">Tujuan</dt>
                          <dd className="min-w-0 font-medium text-foreground">{route.to}</dd>
                        </div>
                      </dl>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField
                          label={legs.length > 1 ? `Tanggal ${LEG_LABEL[leg].toLowerCase()}` : "Tanggal"}
                          name={`ride-date-${leg}`}
                          type="date"
                          value={schedules[leg].date}
                          onChange={(event) => setSchedule(leg, { date: event.target.value })}
                          disabled={saving}
                          required
                        />
                        <TimeSlotField
                          label={legs.length > 1 ? `Jam ${LEG_LABEL[leg].toLowerCase()}` : "Jam"}
                          value={schedules[leg].time}
                          onChange={(time) => setSchedule(leg, { time })}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* ─── LAYANAN & HARGA ─── */}
            <Card title="Layanan & harga">
              {loadingServices ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Memuat layanan…
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FilterSelect
                      layout="form"
                      label="Layanan"
                      value={serviceId}
                      onChange={(value) => {
                        setServiceId(value);
                        setAddonIds([]);
                        setAddonDrafts({});
                        setMainDrafts({ pickup: BLANK_PRICE, delivery: BLANK_PRICE });
                        setVariantChoices([]);
                      }}
                      options={rideServices.map((one) => ({ value: one._id, label: one.name }))}
                      active={false}
                      placeholder="Pilih layanan…"
                      closeOnScroll
                      disabled={saving}
                      required
                    />
                    {!editing ? (
                      <FilterSelect
                        layout="form"
                        label="Driver"
                        value={driverId}
                        onChange={setDriverId}
                        options={[
                          { value: "", label: "Belum ditugaskan" },
                          ...drivers.map((driver) => ({
                            value: driver._id,
                            label: driver.offReason
                              ? `${driver.fullName} — ${driver.offReason}`
                              : driver.fullName,
                            disabled: Boolean(driver.offReason),
                          })),
                        ]}
                        active={false}
                        placeholder="Belum ditugaskan"
                        hint={
                          drivers.length === 0
                            ? "Belum ada staf yang ditandai Driver di Master Data › Staf."
                            : "Diisikan ke semua tahapan. Bisa diganti per tahapan di halaman booking."
                        }
                        closeOnScroll
                        disabled={saving}
                      />
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <Label>Driver</Label>
                        <p className={`flex ${FIELD_HEIGHT} items-center rounded-md border border-border bg-background px-3 text-sm text-muted`}>
                          {original?.groomerName ?? "Belum ditentukan"}
                        </p>
                        <p className="text-xs text-muted">Diganti lewat Ganti PIC di halaman booking.</p>
                      </div>
                    )}
                  </div>

                  <VariantChoicePicker
                    cards={askedCards}
                    value={variantChoices}
                    onChange={setVariantChoices}
                    disabled={saving}
                  />
                  {arah && (
                    <p className="text-xs text-muted">
                      {arah.card.name} mengikuti arah di atas —{" "}
                      {legs
                        .map((leg) => {
                          const code = arah.codes[leg];
                          return `${LEG_LABEL[leg]}: ${arah.card.values.find((value) => value.code === code)?.label ?? code}`;
                        })
                        .join(" · ")}
                      .
                    </p>
                  )}

                  {service && (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">Harga &amp; diskon per item</p>
                      {priced.map((row) => (
                        <PriceRow
                          key={row.leg}
                          name={`${service.name} · ${LEG_LABEL[row.leg]}${perAnimal && riderCount > 1 ? ` · ${riderCount} hewan` : ""}`}
                          line={row.main}
                          draft={mainDrafts[row.leg]}
                          missing={
                            row.quote.missingAxis ? (
                              <>
                                {primary?.name ?? "Hewan"} belum punya {AXIS_LABEL[row.quote.missingAxis]} — harga
                                layanan ini mengikutinya.{" "}
                                <PetFixLink pet={primary} axis={row.quote.missingAxis} />
                              </>
                            ) : (
                              row.problem
                            )
                          }
                          note={variesByZone(service) && variant.zone.ok ? `Zona: ${variant.zoneText}` : null}
                          inactive={row.quote.inactive}
                          mayPrice={mayPrice}
                          disabled={saving}
                          onChange={(next) =>
                            setMainDrafts((prev) => ({ ...prev, [row.leg]: next }))
                          }
                        />
                      ))}
                      {priced[0]?.addons.map((addonRow) => (
                        <PriceRow
                          key={addonRow.addon._id}
                          name={
                            legs.length > 1
                              ? `${addonRow.addon.name} · tiap arah`
                              : addonRow.addon.name
                          }
                          line={addonRow.line}
                          draft={addonDrafts[addonRow.addon._id] ?? BLANK_PRICE}
                          missing={addonRow.problem}
                          inactive={addonRow.quote.inactive}
                          mayPrice={mayPrice}
                          disabled={saving}
                          onRemove={() => {
                            setAddonIds((prev) => prev.filter((id) => id !== addonRow.addon._id));
                            setAddonDrafts((prev) => {
                              const next = { ...prev };
                              delete next[addonRow.addon._id];
                              return next;
                            });
                          }}
                          onChange={(next) =>
                            setAddonDrafts((prev) => ({ ...prev, [addonRow.addon._id]: next }))
                          }
                        />
                      ))}
                    </div>
                  )}

                  {offered.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm font-medium">Add-on</p>
                      <CheckRowGroup>
                        {offered.map((addon) => {
                          const addonQuote = variant.quote(addon, primary, priced[0]?.choices ?? variantChoices);
                          const checked = addonIds.includes(addon._id);
                          return (
                            <CheckRow
                              key={addon._id}
                              label={addon.name}
                              description={
                                addonQuote.inactive
                                  ? "Varian nonaktif — tidak bisa dipilih."
                                  : addonQuote.price
                                    ? money(toMinor(addonQuote.price) ?? 0n)
                                    : (variant.problemOf(addon, addonQuote) ?? "—")
                              }
                              checked={checked}
                              disabled={saving || (addonQuote.inactive && !checked)}
                              onCheckedChange={(next) => {
                                setAddonIds((prev) =>
                                  next ? [...prev, addon._id] : prev.filter((id) => id !== addon._id),
                                );
                              }}
                            />
                          );
                        })}
                      </CheckRowGroup>
                    </div>
                  )}

                  <TextareaField
                    label="Catatan internal"
                    name="ride-notes"
                    value={internalNotes}
                    onChange={(event) => setInternalNotes(event.target.value)}
                    maxLength={NOTES_MAX_LENGTH}
                    placeholder="Dibaca driver dan staf — patokan rumah, jam pelanggan bisa dihubungi"
                    disabled={saving}
                  />
                </div>
              )}
            </Card>
          </div>

          {/* ─── RINGKASAN ─── */}
          <aside className="lg:sticky lg:top-20">
            <Card title="Ringkasan">
              <div className="flex flex-col gap-1 text-sm">
                <div className="border-b border-border pb-3">
                  <p className="font-bold text-foreground">{customer?.name ?? "Belum ada pelanggan"}</p>
                  <p className="text-xs text-muted">
                    {riders.length
                      ? riders
                          .map((id) => pets.find((pet) => pet._id === id)?.name)
                          .filter(Boolean)
                          .join(", ")
                      : "Belum ada hewan"}
                  </p>
                </div>

                {!service ? (
                  <p className="py-2 text-muted">Belum ada layanan dipilih.</p>
                ) : (
                  <ul className="flex flex-col gap-2 pt-2">
                    {priced.map((row) => (
                      <li key={row.leg} className="flex flex-col">
                        <SummaryLine
                          label={`${LEG_LABEL[row.leg]} · ${service.name}`}
                          detail={`${schedules[row.leg].date || "—"} · ${schedules[row.leg].time.replace(":", ".") || "—"}${perAnimal && riderCount > 1 ? ` · ${riderCount} hewan` : ""}`}
                          value={row.main.price === null ? "—" : money(row.main.price)}
                        />
                        {row.main.discount > 0n && (
                          <SummaryLine tone="discount" label="Diskon" value={`− ${money(row.main.discount)}`} />
                        )}
                        {row.addons.map((addonRow) => (
                          <SummaryLine
                            key={addonRow.addon._id}
                            tone="sub"
                            label={`+ ${addonRow.addon.name}`}
                            value={addonRow.line.price === null ? "—" : money(addonRow.line.price)}
                          />
                        ))}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex items-baseline justify-between gap-3 border-t-2 border-foreground pt-2">
                  <span className="font-extrabold">Total</span>
                  <span className="text-xl font-extrabold tabular-nums">{money(total)}</span>
                </div>
                {legs.length > 1 && (
                  <p className="mt-2 text-xs text-muted">Jemput dan antar ditagih sebagai dua booking.</p>
                )}
                {!mayPrice && (
                  <p className="mt-2 text-xs text-muted">
                    {editing
                      ? "Harga mengikuti katalog. Harga ketikan tidak bisa diubah dari form ubah."
                      : "Harga mengikuti katalog. Mengubah harga atau memberi diskon butuh izin dari Owner atau Admin."}
                  </p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </form>

      <CustomerSearchDialog open={picking} onOpenChange={setPicking} onSelect={chooseCustomer} />

      {customer && (
        <PetQuickAddDialog
          customerId={customer._id}
          customerName={customer.name}
          open={addingPet}
          onOpenChange={setAddingPet}
          requireTraits
          onCreated={(pet) => {
            setAddingPet(false);
            setPetsNonce((n) => n + 1);
            setRiders((prev) => [...prev, pet._id]);
          }}
        />
      )}
    </div>
  );
}
