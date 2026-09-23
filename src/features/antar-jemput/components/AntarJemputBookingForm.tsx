"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { PetQuickAddDialog } from "@/features/pets";
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
  Branch,
  Customer,
  GroomerAvailability,
  Pet,
  Service,
  TripLeg,
  TripPoint,
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
  customerEndOf,
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

/* ─── The two ends of the trip (23 September 2026) ──────────────────────────
   Where each end came from. "map" — the Google Places picker — is offered and
   disabled: it is the reason `location` is a subdocument on the server, and it
   lands here without a change to the shape. */
type PointSource = "customer" | "branch" | "manual" | "map";

interface PointDraft {
  source: PointSource;
  address: string;
  lat: string;
  lng: string;
}

const BLANK_POINT: PointDraft = { source: "manual", address: "", lat: "", lng: "" };

const POINT_SOURCES: { value: PointSource; label: string; disabled?: boolean }[] = [
  { value: "customer", label: "Alamat pelanggan" },
  { value: "branch", label: "Alamat cabang" },
  { value: "manual", label: "Ketik manual" },
  { value: "map", label: "Pilih dari peta (segera)", disabled: true },
];

/** One journey's two ends, as the form holds them. */
interface LegPoints {
  origin: PointDraft;
  destination: PointDraft;
}

/**
 * The ends a direction fills in by itself: a pickup starts at the customer's
 * door, a delivery finishes there. Both stay editable — see `customerEndOf`.
 */
function defaultDrafts(leg: TripLeg): LegPoints {
  const customerFirst = customerEndOf(leg) === "origin";

  return {
    origin: { ...BLANK_POINT, source: customerFirst ? "customer" : "branch" },
    destination: { ...BLANK_POINT, source: customerFirst ? "branch" : "customer" },
  };
}

/** A number a person typed, or null when they have not typed one yet. */
function coordOf(typed: string): number | null {
  const value = Number(typed);
  return typed.trim() !== "" && Number.isFinite(value) ? value : null;
}

/** What an end actually resolves to — the record it points at, or what was typed. */
function resolvePoint(
  draft: PointDraft,
  customer: Customer | null,
  branch: Branch | null,
): { address: string | null; lat: number | null; lng: number | null } {
  if (draft.source === "customer") {
    return {
      address: customer?.address ?? null,
      lat: customer?.location?.lat ?? null,
      lng: customer?.location?.lng ?? null,
    };
  }

  if (draft.source === "branch") {
    return {
      address: branch?.address ?? null,
      lat: branch?.location?.lat ?? null,
      lng: branch?.location?.lng ?? null,
    };
  }

  return {
    address: draft.address.trim() || null,
    lat: coordOf(draft.lat),
    lng: coordOf(draft.lng),
  };
}

/** A saved end, back in the form as typed values — every end stays editable. */
function storedDraft(point: TripPoint | null | undefined): PointDraft {
  return {
    source: "manual",
    address: point?.address ?? "",
    lat: point?.lat == null ? "" : String(point.lat),
    lng: point?.lng == null ? "" : String(point.lng),
  };
}

/** Whether an end is where it already was — an edit sends only what moved. */
function samePoint(
  next: { address: string | null; lat: number; lng: number },
  stored: TripPoint | null | undefined,
): boolean {
  return (
    (stored?.address ?? null) === next.address &&
    (stored?.lat ?? null) === next.lat &&
    (stored?.lng ?? null) === next.lng
  );
}

type ResolvedPoint = ReturnType<typeof resolvePoint>;

interface ResolvedLeg {
  origin: ResolvedPoint;
  destination: ResolvedPoint;
}

function resolveLeg(
  leg: LegPoints,
  customer: Customer | null,
  branch: Branch | null,
): ResolvedLeg {
  return {
    origin: resolvePoint(leg.origin, customer, branch),
    destination: resolvePoint(leg.destination, customer, branch),
  };
}

const pinOf = (point: ResolvedPoint) =>
  point.lat !== null && point.lng !== null ? { lat: point.lat, lng: point.lng } : null;

/**
 * ONE STEP OF THE FORM, inside the one card (23 September 2026, on request).
 *
 * The screen used to be five cards; a ride is filled in as ONE sequence —
 * customer, animals, bookings, service, journey, addresses, price, clock — and
 * five boxes made a sequence look like five choices.
 */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * ONE END OF THE TRIP — where it is, and where that came from.
 *
 * The two registers a shop already keeps (the customer's address and the
 * branch's) are offered before the keyboard, because they carry a pin somebody
 * has already checked. Typing one means typing its coordinates too: the fare
 * is measured between the ends, so an address with no point has no price.
 */
function PointFields({
  label,
  draft,
  point,
  customer,
  branch,
  disabled,
  onChange,
}: {
  label: string;
  draft: PointDraft;
  point: ResolvedPoint;
  customer: Customer | null;
  branch: Branch | null;
  disabled: boolean;
  onChange: (next: PointDraft) => void;
}) {
  const typed = draft.source === "manual";
  const missingPin = point.lat === null || point.lng === null;
  const from =
    draft.source === "customer"
      ? (customer?.name ?? "pelanggan")
      : (branch?.name ?? "cabang");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <FilterSelect
        layout="form"
        label={label}
        ariaLabel={`Sumber ${label.toLowerCase()}`}
        value={draft.source}
        onChange={(next) => onChange({ ...draft, source: next as PointSource })}
        options={POINT_SOURCES}
        active={false}
        placeholder="Pilih sumber alamat"
        disabled={disabled}
      />

      {typed ? (
        <>
          <TextareaField
            label="Alamat"
            name={`${label}-address`}
            value={draft.address}
            onChange={(event) => onChange({ ...draft, address: event.target.value })}
            maxLength={ADDRESS_MAX_LENGTH}
            rows={2}
            placeholder="Nama jalan, nomor, patokan"
            disabled={disabled}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Latitude"
              name={`${label}-lat`}
              value={draft.lat}
              onChange={(event) => onChange({ ...draft, lat: event.target.value })}
              placeholder="-6.2088"
              disabled={disabled}
              required
            />
            <TextField
              label="Longitude"
              name={`${label}-lng`}
              value={draft.lng}
              onChange={(event) => onChange({ ...draft, lng: event.target.value })}
              placeholder="106.8456"
              disabled={disabled}
              required
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-foreground">{point.address ?? "Belum ada alamat tersimpan"}</p>
          <p className="text-xs text-muted">
            Dari data {from}.{" "}
            {missingPin
              ? "Titik lokasinya belum ada — pilih Ketik manual, atau lengkapi di data itu."
              : `Titik: ${point.lat}, ${point.lng}`}
          </p>
        </div>
      )}

      {missingPin && (
        <p className="text-xs font-semibold text-danger" role="alert">
          Titik lokasi wajib diisi.
        </p>
      )}
    </div>
  );
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
 * animal as two bookings would). "Antar Jemput" saves TWO rides, the pickup
 * then the delivery, in one visit.
 *
 * ─── AND ONE RIDE SERVES MANY (23 September 2026) ──────────────────────────
 *
 * Two dogs fetched together for two separate grooming bookings are ONE ride
 * that both of them point at. "Tautkan ke booking" is therefore a list, not a
 * choice, and it is what a `per_pet` fare is multiplied by — one booking is one
 * animal, so an animal riding along without one is not billed for the seat.
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
 * "Tautkan ke booking" (note 2) names the bookings this ride serves —
 * `linkedBookingIds` on the save, written on the ride alone, so nobody else's
 * visit moves and bookings made days apart can share one van. THE ANIMALS ARE
 * PICKED FIRST and the list offers only their bookings, never another ride.
 * `?bookingId=` arrives from that booking's own "+ Antar-jemput" and fills the
 * customer, the animal, the branch, the day and the link. The time is picked
 * every half hour (note 8).
 *
 * ─── THE ORDER OF THE CARDS ────────────────────────────────────────────────
 *
 * Pelanggan → Hewan → Tautkan → Layanan & harga → **Perjalanan**, and the last
 * one is not on screen until a service is picked (23 September 2026). The
 * service is what gives a direction a meaning and a price — its "Arah" option
 * is answered from the direction rather than asked twice — so asking the
 * direction and the clock first was asking in the order the form was built.
 * CABANG MOVED UP TO PELANGGAN with it: the zone is measured from the branch
 * and the zone is a price, so a branch picked below the price rows would have
 * changed numbers already on screen.
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
  /**
   * EACH DIRECTION HAS ITS OWN TWO ENDS (23 September 2026, on request). An
   * Antar Jemput is two journeys, not one driven backwards: the van may collect
   * from the house in the morning and take the animal to the owner's office in
   * the afternoon, and a fare measured on the pickup would be the wrong one.
   */
  const [points, setPoints] = useState<Record<TripLeg, LegPoints>>(() => ({
    pickup: defaultDrafts("pickup"),
    delivery: defaultDrafts("delivery"),
  }));
  /** The bookings this ride serves — empty is a visit of its own. */
  const [linkIds, setLinkIds] = useState<string[]>([]);

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

  /*
    THE FARE IS A BAND OF THE DISTANCE THE VAN DRIVES (23 September 2026), so
    the zone is measured between that journey's OWN two ends rather than
    between the branch and whatever pin the customer's record holds. The server
    re-measures the same two points and is what the line stores.

    BOTH DIRECTIONS ARE QUOTED ON EVERY RENDER, whichever are being saved: a
    hook cannot be called conditionally, and there are only ever two.
  */
  const resolved: Record<TripLeg, ResolvedLeg> = {
    pickup: resolveLeg(points.pickup, customer, branch),
    delivery: resolveLeg(points.delivery, customer, branch),
  };

  const pickupVariant = useVariantQuote({
    branchPin: pinOf(resolved.pickup.origin),
    customerPin: pinOf(resolved.pickup.destination),
  });
  const deliveryVariant = useVariantQuote({
    branchPin: pinOf(resolved.delivery.origin),
    customerPin: pinOf(resolved.delivery.destination),
  });
  const variantFor: Record<TripLeg, typeof pickupVariant> = {
    pickup: pickupVariant,
    delivery: deliveryVariant,
  };
  /*
    THE ANIMALS DECIDE WHAT MAY BE LINKED (23 September 2026): only bookings of
    the animals in the van, and never another ride — a ride cannot serve a ride.
  */
  const visits = useVisitBookings(editing ? null : (customer?._id ?? null), bookingId, {
    petIds: riders,
    excludeRides: true,
  });

  const legs: TripLeg[] = editing
    ? [legChoice === "both" ? "pickup" : legChoice]
    : legsOf(legChoice);
  const firstLeg = legs[0];
  /* The cards a service declares are the same whichever way the van goes. */
  const variant = variantFor[firstLeg];

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
          /* THE VAN IS ONE LIST (23 September 2026) — a ride has no animal of
             its own to put at the front of it. */
          setRiders(source.passengerPetIds ?? []);
          /* Not editable here, but the price preview is multiplied by them. */
          setLinkIds(source.linkedBookingIds ?? []);
          setSchedules((prev) => ({
            ...prev,
            [leg]: { date: dateOf(at), time: slotAtOrBefore(at) },
          }));
          /* What it was saved with, as typed values — every end stays editable. */
          setPoints((prev) => ({
            ...prev,
            [leg]: {
              origin: storedDraft(source.tripOrigin),
              destination: storedDraft(source.tripDestination),
            },
          }));
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
          /* From a grooming booking, its animal; from a ride, everybody in it. */
          setRiders(
            source.petId ? [source.petId] : (source.passengerPetIds ?? []),
          );
          /* A ride cannot serve a ride — "+ Antar-jemput" on one only copies its ends. */
          setLinkIds(source.tripLeg ? [] : [source._id]);
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

  /*
    The Antar-Jemput line's main services, AT THE CHOSEN BRANCH (23 September
    2026, on request). Filtered here rather than re-fetched per branch: the
    catalogue is already loaded, and `allBranches` means every branch as new
    ones open, so it is never listed in `branchIds`.
  */
  const rideServices = useMemo(
    () =>
      services.filter(
        (service) =>
          service.serviceType === "main" &&
          (!line.line || service.businessLineId === line.line._id) &&
          (!branchId || service.allBranches || service.branchIds.includes(branchId)),
      ),
    [services, line.line, branchId],
  );

  /* ─── What the form comes to ──────────────────────────────────────────── */

  const service = serviceOf(serviceId);
  /*
    ⚠️ NO "PRIMARY" ANIMAL (23 September 2026). The form used to send `riders[0]`
    as `petId` and `riders.slice(1)` as the passengers, then reassemble the two
    for display — a split that existed only because the document demanded one
    animal above the rest. The van is the list, and the quote is asked with NO
    animal: a ride priced by an animal has several, so the SERVER refuses it and
    `missingAxis` below says so.
  */
  const passengers = riders;
  const addons = addonIds.map((id) => serviceOf(id)).filter((one): one is Service => one !== null);
  const offered = (service?.addonServiceIds ?? [])
    .map((id) => serviceOf(id))
    .filter((one): one is Service => one !== null);
  const cards = variant.cardsFor([service, ...addons]);
  const arah = arahCardOf(service, cards);
  /* Arah is answered by the direction — it is not asked as a select. */
  const askedCards = cards.filter((card) => card.axisKey !== arah?.card.axisKey);
  const perAnimal = service?.billingUnit === "per_pet";
  /*
    WHAT A per_pet FARE IS MULTIPLIED BY — the bookings this ride serves, since
    one booking is one animal. Mirrors `chargedRidersOf` on the server; an
    animal riding along with no booking of its own is not counted here.
  */
  const chargedPets = Math.max(1, linkIds.length);

  /* EACH DIRECTION IS QUOTED IN ITS OWN ZONE — it has its own two addresses. */
  const priced = legs.map((leg) => {
    const legVariant = variantFor[leg];
    const choices = choicesForLeg(service, cards, leg, variantChoices);
    const quote = legVariant.quote(service, null, choices);
    const unit = quote.price === null ? null : toMinor(quote.price);
    const quoted =
      unit === null ? null : toDecimalString(perAnimal ? unit * BigInt(chargedPets) : unit);
    const main = priceLine(quoted, mayPrice ? mainDrafts[leg] : BLANK_PRICE);
    const addonLines = addons.map((addon) => {
      const addonQuote = legVariant.quote(addon, null, choices);
      return {
        addon,
        quote: addonQuote,
        problem: legVariant.problemOf(addon, addonQuote),
        line: priceLine(addonQuote.price, mayPrice ? (addonDrafts[addon._id] ?? BLANK_PRICE) : BLANK_PRICE),
      };
    });
    const lines: PricedLine[] = [main, ...addonLines.map((row) => row.line)];

    return {
      leg,
      choices,
      quote,
      zone: legVariant,
      problem: service ? legVariant.problemOf(service, quote) : null,
      main,
      addons: addonLines,
      net: lines.reduce((sum, row) => sum + row.net, 0n),
    };
  });
  const total = priced.reduce((sum, row) => sum + row.net, 0n);

  /* The first end still missing its pin, in the order they are filled in. */
  const unpinned = legs
    .flatMap((leg) =>
      (["origin", "destination"] as const).map((end) => ({ leg, end })),
    )
    .find(({ leg, end }) => !pinOf(resolved[leg][end]));

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
          : !service
              ? "Layanan antar-jemput belum dipilih."
              : /* Before the price problems: a fare is measured between the two ends. */
                unpinned
                ? `Titik lokasi alamat ${unpinned.end === "origin" ? "asal" : "tujuan"}${
                    legs.length > 1 ? ` ${LEG_LABEL[unpinned.leg].toLowerCase()}` : ""
                  } belum ada — isi lat & lng-nya.`
                : priced.some((row) => row.quote.missingAxis !== null)
                  ? 'Layanan ini dihargai per hewan, sedangkan satu perjalanan mengangkut beberapa hewan \u2014 pakai varian zona atau harga tunggal.'
                  : unanswered
                    ? `${unanswered}.`
                    : priced.some((row) => row.quote.inactive)
                      ? "Varian layanan ini sedang nonaktif."
                      : unscheduled
                        ? `Tanggal dan jam ${LEG_LABEL[unscheduled].toLowerCase()} belum lengkap.`
                        : backwards
                          ? "Jam antar harus setelah jam jemput."
                          : null;

  function setEnd(leg: TripLeg, end: "origin" | "destination", next: PointDraft) {
    setPoints((prev) => ({ ...prev, [leg]: { ...prev[leg], [end]: next } }));
    setClash(null);
  }

  /** A service not sold at the new branch cannot stay chosen for it. */
  function chooseBranch(next: string) {
    setPickedBranch(next);
    const kept = services.find((one) => one._id === serviceId);
    if (kept && !kept.allBranches && !kept.branchIds.includes(next)) setServiceId("");
    setClash(null);
  }

  function chooseCustomer(next: Customer) {
    setCustomer(next);
    setPets([]);
    setRiders([]);
    setLinkIds([]);
    setClash(null);
    setRefusal(null);
  }

  function toggleRider(petId: string) {
    const next = riders.includes(petId)
      ? riders.filter((id) => id !== petId)
      : [...riders, petId];

    setRiders(next);
    /* A booking of an animal that left the van cannot be served by it. */
    setLinkIds((prev) =>
      prev.filter((id) => {
        const booking = visits.bookings.find((one) => one._id === id);
        /* A linked booking always has an animal — only a ride has none, and a
           ride is never offered for linking. */
        return !booking || booking.petId === null || next.includes(booking.petId);
      }),
    );
    setClash(null);
  }

  function toggleLink(id: string) {
    setLinkIds((prev) =>
      prev.includes(id) ? prev.filter((one) => one !== id) : [...prev, id],
    );
    setClash(null);
  }

  function setSchedule(leg: TripLeg, patch: Partial<Schedule>) {
    setSchedules((prev) => ({ ...prev, [leg]: { ...prev[leg], ...patch } }));
    setClash(null);
  }

  /** Tukar: the van drives the same two doors the other way round. */
  function swap() {
    if (legChoice === "both") return;
    const next = otherLeg(legChoice);

    setSchedules((prev) => ({ ...prev, [next]: prev[legChoice] }));
    setMainDrafts((prev) => ({ ...prev, [next]: prev[legChoice] }));
    setPoints((prev) => ({
      ...prev,
      [next]: { origin: prev[legChoice].destination, destination: prev[legChoice].origin },
    }));
    setLegChoice(next);
  }

  /**
   * Flipping between the two single directions TURNS THE VAN ROUND — it keeps
   * the journey and reverses it — rather than forgetting where it was going.
   * Every other change just switches which directions are being saved; each one
   * keeps its own pair of addresses.
   */
  function chooseLeg(next: LegChoice) {
    if (next === legChoice) return;

    if (legChoice !== "both" && next === otherLeg(legChoice)) {
      swap();
      return;
    }

    setLegChoice(next);
    setClash(null);
  }

  /* ─── Saving ─────────────────────────────────────────────────────────── */

  function entryFor(leg: TripLeg) {
    const draft = {
      /* The draft's own `petId` is dropped below — a ride card sends none. */
      ...blankPetDraft(""),
      serviceId,
      addonServiceIds: addonIds,
      groomerUserId: driverId,
      internalNotes,
      main: mayPrice ? mainDrafts[leg] : BLANK_PRICE,
      addons: mayPrice ? addonDrafts : {},
      variantChoices: choicesForLeg(service, cards, leg, variantChoices),
    };

    /*
      THE KEY IS REMOVED, NOT SET TO UNDEFINED (23 September 2026). The server
      refuses a ride card that carries `petId` at all, and a key whose value is
      undefined survives every path but `JSON.stringify` — which is a rule about
      the transport, not about what this form means to send.
    */
    const entry = toEntry(draft, serviceOf);
    delete entry.petId;

    return {
      ...entry,
      tripLeg: leg,
      passengerPetIds: passengers,
      linkedBookingIds: linkIds,
    };
  }

  /** Null — the customer's stored address — when it was left as it is. */
  /**
   * THE TWO ENDS OF ONE JOURNEY, as the API takes them. Each direction carries
   * its own pair (23 September 2026, on request), so an Antar Jemput sends two
   * different journeys rather than one driven backwards.
   */
  function endsFor(leg: TripLeg) {
    const { origin: from, destination: to } = resolved[leg];

    return {
      tripOrigin: { address: from.address, lat: from.lat as number, lng: from.lng as number },
      tripDestination: { address: to.address, lat: to.lat as number, lng: to.lng as number },
    };
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
    /*
      ONLY THE SECOND LEG OF A PULANG-PERGI JOINS A GROUP — the first one's.
      Serving a booking no longer moves anybody's visit: that is
      `linkedBookingIds`, written on the ride alone (23 September 2026).
    */
    let groupId: string | undefined;
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
          /*
            A RIDE IS BORN A DRAFT (23 September 2026). `requested` is not one
            of its four rungs — a van is either written down or it is on — and
            the server refuses a ride asked for as one.
          */
          status: "draft",
          location: rideLocation(service),
          ...endsFor(leg),
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
          ? `2 booking antar jemput dibuat${numbers ? `: ${numbers}` : ""}.`
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
    const ends = endsFor(leg);

    if (new Date(scheduledAt).getTime() !== new Date(original.scheduledAt).getTime()) {
      patch.scheduledAt = scheduledAt;
    }
    if (branchId !== original.branchId) patch.branchId = branchId;
    if (leg !== original.tripLeg) patch.tripLeg = leg;
    if (!samePoint(ends.tripOrigin, original.tripOrigin)) patch.tripOrigin = ends.tripOrigin;
    if (!samePoint(ends.tripDestination, original.tripDestination)) {
      patch.tripDestination = ends.tripDestination;
    }
    /* `petId` is never patched on a ride — it has none, and sending one is
       refused. The whole van moves through `passengerPetIds`. */
    if (!sameSet(passengers, original.passengerPetIds ?? [])) {
      patch.passengerPetIds = passengers;
    }
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
          : "Satu perjalanan satu booking — hewan lain ikut di perjalanan yang sama. Antar Jemput disimpan jadi dua booking dalam satu kunjungan."}
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
          <Card title={editing ? "Ubah perjalanan" : "Booking antar-jemput"}>
            <div className="flex flex-col gap-5">
              {/* ─── 1 · PELANGGAN & CABANG ─── */}
              <Section title="Pelanggan & cabang">
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
                      onChange={chooseBranch}
                      hint="Layanan dan alamat cabang di bawah mengikuti pilihan ini."
                    />
                  )}

                  {customer && (
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                      <Fact label="WhatsApp">
                        <span className="tabular-nums">{customer.phone ?? "—"}</span>
                      </Fact>
                      <Fact label="Alamat tersimpan">{customer.address ?? "—"}</Fact>
                    </dl>
                  )}
                </div>
              </Section>

              {/* ─── 2 · HEWAN ─── */}
              <Section
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
                      <p className="text-sm text-muted">
                        {customer.name} belum punya hewan terdaftar.
                      </p>
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
                                {on && (
                                  <span className={`${badge} bg-tint-brand text-primary`}>Ikut</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="text-xs text-muted">
                      Semua hewan yang dipilih ikut di perjalanan yang sama
                      {perAnimal
                        ? " — yang ditagih tarif per hewan adalah booking yang ditautkan di bawah."
                        : "."}
                    </p>
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
              </Section>

              {/* ─── 3 · TAUTKAN ─── */}
              {!editing && (
                <Section
                  title="Tautkan ke booking"
                  action={
                    linkIds.length > 0 ? (
                      <span className={`${badge} bg-tint-neutral text-muted tabular-nums`}>
                        {linkIds.length} booking
                      </span>
                    ) : null
                  }
                >
                  {!customer ? (
                    <p className="text-sm text-muted">
                      Pilih pelanggannya dulu — daftar booking mengikuti pemiliknya.
                    </p>
                  ) : riders.length === 0 ? (
                    <p className="text-sm text-muted">
                      Pilih hewannya dulu — yang muncul di sini cuma booking hewan
                      yang ikut.
                    </p>
                  ) : visits.loading ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Spinner /> Memuat booking…
                    </p>
                  ) : visits.failed ? (
                    <Alert variant="error">
                      Daftar booking pelanggan ini tidak bisa dimuat.
                    </Alert>
                  ) : visits.bookings.length === 0 ? (
                    <p className="text-sm text-muted">
                      Belum ada booking untuk hewan yang dipilih. Antar-jemput ini
                      jalan sebagai kunjungan sendiri.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <CheckRowGroup>
                        {visits.bookings.map((booking) => (
                          <CheckRow
                            key={booking._id}
                            label={visitLabel(booking)}
                            checked={linkIds.includes(booking._id)}
                            disabled={saving}
                            onCheckedChange={() => toggleLink(booking._id)}
                          />
                        ))}
                      </CheckRowGroup>
                      <p className="text-xs text-muted">
                        Satu antar-jemput bisa menangani beberapa booking sekaligus
                        — semuanya menunjuk ke perjalanan yang sama
                        {perAnimal
                          ? ", dan tarifnya dihitung per booking yang ditautkan."
                          : ", dan tarifnya tetap sekali per perjalanan."}
                      </p>
                    </div>
                  )}
                </Section>
              )}

              {/* ─── 4 · LAYANAN & DRIVER ─── */}
              <Section title="Layanan & driver">
                {loadingServices ? (
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <Spinner /> Memuat layanan…
                  </p>
                ) : (
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
                      hint={
                        rideServices.length === 0 && branchId
                          ? "Belum ada layanan antar-jemput yang dijual di cabang ini."
                          : "Hanya layanan yang dijual di cabang yang dipilih."
                      }
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
                            ? "Belum ada staf yang ditandai Driver di Pengaturan › Pengguna."
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
                )}
              </Section>

              {/* ─── 5 · PERJALANAN ─── */}
              {service && (
                <Section
                  title="Perjalanan"
                  action={
                    legChoice !== "both" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={swap}
                      >
                        <ArrowUpDown className="size-4" aria-hidden />
                        Tukar arah
                      </Button>
                    )
                  }
                >
                  <ChoiceCards
                    legend="Arah"
                    value={legChoice}
                    onChange={chooseLeg}
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
                </Section>
              )}

              {/* ─── 6 · ALAMAT, SATU PASANG PER ARAH ─── */}
              {service && (
                <Section title="Alamat">
                  <div className="flex flex-col gap-5">
                    {legs.map((leg) => {
                      const zone = variantFor[leg];
                      const priced = pinOf(resolved[leg].origin) && pinOf(resolved[leg].destination);

                      return (
                        <div key={leg} className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {legs.length > 1 && (
                              <span
                                className={`${badge} ${leg === "pickup" ? "bg-tint-info text-info" : "bg-tint-brand text-primary"}`}
                              >
                                Alamat {LEG_LABEL[leg].toLowerCase()}
                              </span>
                            )}
                            <span
                              className={`${badge} ml-auto ${zone.zone.ok ? "bg-tint-success text-success" : "bg-tint-neutral text-muted"}`}
                            >
                              {priced ? zone.zoneText : "Zona belum terhitung"}
                            </span>
                          </div>
                          <div className="grid gap-4 lg:grid-cols-2">
                            <PointFields
                              label="Alamat asal"
                              draft={points[leg].origin}
                              point={resolved[leg].origin}
                              customer={customer}
                              branch={branch}
                              disabled={saving}
                              onChange={(next) => setEnd(leg, "origin", next)}
                            />
                            <PointFields
                              label="Alamat tujuan"
                              draft={points[leg].destination}
                              point={resolved[leg].destination}
                              customer={customer}
                              branch={branch}
                              disabled={saving}
                              onChange={(next) => setEnd(leg, "destination", next)}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted">
                      Titik lokasi (lat &amp; lng) wajib diisi — tarif zona tiap arah
                      dihitung dari jarak antara kedua alamatnya sendiri.
                      {legs.length > 1 &&
                        " Jemput dan antar punya alamatnya masing-masing, jadi hewan bisa diantar ke tempat lain."}
                    </p>
                  </div>
                </Section>
              )}

              {/* ─── 7 · HARGA & ADD-ON ─── */}
              {service && (
                <Section title="Harga">
                  <div className="flex flex-col gap-4">
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

                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">Harga &amp; diskon per item</p>
                      {priced.map((row) => (
                        <PriceRow
                          key={row.leg}
                          name={`${service.name} · ${LEG_LABEL[row.leg]}${perAnimal && chargedPets > 1 ? ` · ${chargedPets} hewan` : ""}`}
                          line={row.main}
                          draft={mainDrafts[row.leg]}
                          missing={
                            /*
                              A RIDE IS NOT PRICED BY AN ANIMAL (23 September
                              2026). It carries several, so there is nobody to
                              name here and nothing to go and fix on a profile —
                              the catalogue is what has to change. The server
                              refuses such a save with the same reason.
                            */
                            row.quote.missingAxis ? (
                              <>
                                Layanan ini dihargai per {AXIS_LABEL[row.quote.missingAxis]} hewan,
                                sedangkan satu perjalanan mengangkut beberapa hewan sekaligus — pakai
                                varian zona atau harga tunggal.
                              </>
                            ) : (
                              row.problem
                            )
                          }
                          note={variesByZone(service) && row.zone.zone.ok ? `Zona: ${row.zone.zoneText}` : null}
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

                    {offered.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-medium">Add-on</p>
                        <CheckRowGroup>
                          {offered.map((addon) => {
                            const addonQuote = variant.quote(addon, null, priced[0]?.choices ?? variantChoices);
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
                  </div>
                </Section>
              )}

              {/* ─── 8 · JADWAL ─── */}
              {service && (
                <Section title="Jadwal">
                  <div className="flex flex-col gap-4">
                    {legs.map((leg) => (
                      <div key={leg} className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
                        <span
                          className={`${badge} mb-2.5 w-fit ${leg === "pickup" ? "bg-tint-info text-info" : "bg-tint-brand text-primary"}`}
                        >
                          {LEG_LABEL[leg]}
                        </span>
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
                    ))}
                  </div>
                </Section>
              )}

              {/* ─── 9 · CATATAN ─── */}
              <Section title="Catatan">
                <TextareaField
                  label="Catatan internal"
                  name="ride-notes"
                  value={internalNotes}
                  onChange={(event) => setInternalNotes(event.target.value)}
                  maxLength={NOTES_MAX_LENGTH}
                  placeholder="Dibaca driver dan staf — patokan rumah, jam pelanggan bisa dihubungi"
                  disabled={saving}
                />
              </Section>
            </div>
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
                          detail={`${schedules[row.leg].date || "—"} · ${schedules[row.leg].time.replace(":", ".") || "—"}${perAnimal && chargedPets > 1 ? ` · ${chargedPets} hewan` : ""}`}
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
