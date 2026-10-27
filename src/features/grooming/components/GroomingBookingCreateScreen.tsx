"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { BookingBenefitField } from "@/features/booking/components/BookingBenefitField";
import { OtherBenefitsInfo } from "@/features/booking/components/OtherBenefitsInfo";
import { otherBenefitsOf } from "@/features/booking/otherBenefits";
import { VisitAddressCard } from "@/features/booking/components/VisitAddressCard";
import {
  addonBenefitsOf,
  benefitRefusalOf,
  bookingQuoteInput,
  cardBenefitView,
  effectivePlan,
  toPlan,
  visitFeeDiscountOf,
  type BenefitCardState,
} from "@/features/booking/benefitQuote";
import { useBookingBenefitQuote } from "@/features/booking/hooks/useBookingBenefitQuote";
import {
  DEFAULT_VISIT_DRAFT,
  visitFeeOf,
  visitInputOf,
  visitPinOf,
  visitPointOf,
  visitProblem,
} from "@/features/booking/visitAddress";
import { variantRefusalOf, type VariantRefusal } from "@/features/booking/variantLine";
import { CustomerSearchDialog } from "@/features/customers";
import { useCustomerMemberships } from "@/features/memberships/hooks/useCustomerMemberships";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { usePermissions } from "@/features/permissions";
import { PetFixLink, PetQuickAddDialog, PetSummaryCard } from "@/features/pets";
import type { PointDraft } from "@/features/antar-jemput/components/TripPointFields";
// `PageHeading` is still purchasing-local, awaiting promotion (ui-rules §15).
import { PageHeading } from "@/features/purchasing";
import { useVariantQuote, VariantChoicePicker } from "@/features/services";
import { useHomeVisitFees } from "@/features/booking/hooks/useHomeVisitFees";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { formatMoney, isPositive, toDecimalString, toMinor } from "@/utils/decimal";
import {
  AXIS_LABEL,
  staffAxesOf,
  variantLabelForPet,
  variesByZone,
} from "@/utils/serviceVariant";
import { GROOMER_LEVEL_LABELS } from "@/types/api";
import type {
  BookingLocation,
  Customer,
  GroomerAvailability,
  Pet,
  Service,
  ServiceVariantAxis,
} from "@/types/api";
import type { PetMembership } from "@/types/membership";

import {
  BLANK_PRICE,
  blankPetDraft,
  priceLine,
  splitBookingDiscount,
  toEntry,
  typedDiscount,
  type DiscountMode,
  type PetDraft,
  type PricedLine,
} from "../bookingCreateDraft";
import {
  BLANK_RIDE,
  quoteRides,
  rideBlockedReason,
  RideForGroomingSection,
  rideRequests,
  type RideDraft,
} from "@/features/antar-jemput/components/RideForGroomingSection";
import { LEG_LABEL } from "@/features/antar-jemput/ride";

import { GROOMING_LINE } from "../line";
import {
  badge,
  discountWords,
  DiscountInput,
  Fact,
  Initial,
  money,
  nextHalfHourValue,
  offeredAt,
  PriceRow,
  SummaryLine,
  todayValue,
  toScheduledAt,
} from "./BookingPriceControls";
import { GROOMING_BOOKINGS_PATH, GROOMING_PATH } from "../paths";

/** The API's page cap. */
const FETCH_LIMIT = 100;

/** Mirrors NOTES_MAX_LENGTH in booking.model.js. */
const NOTES_MAX_LENGTH = 500;

/**
 * "Snoopy · Tes Explorer" / "Semua hewan · Keluarga" — one chip per live card
 * the customer holds, for the "Member" fact. A customer's card covers every
 * animal, so it says so instead of naming one.
 */
function memberChipText(card: PetMembership, pets: readonly Pet[]): string {
  const plan = card.plan?.name ?? "Membership";
  const who =
    card.attachTo === "customer"
      ? "Semua hewan"
      : (pets.find((pet) => pet._id === card.petId)?.name ?? card.petName ?? "Hewan");
  return `${who} · ${plan}${card.status === "paused" ? " (dijeda)" : ""}`;
}

/** How the summary names a variant: coat, then size, then species. */
const VARIANT_ORDER = ["furType", "sizeCategory", "petType"] as const satisfies readonly ServiceVariantAxis[];

/**
 * Layanan › Grooming › Booking baru — "Booking baru" from `buloo-booking-v2.html`,
 * without the mockup's other two tabs.
 *
 * ─── ONE ANIMAL, ONE BOOKING ───────────────────────────────────────────────
 *
 * The animals are picked as chips; each gets a card with its service, groomer,
 * prices and add-ons, and saving makes one numbered booking per animal in one
 * group (`POST /bookings`). `/dashboard/booking/new` stays for every other line.
 *
 * ─── PRICE AND DISCOUNT ARE A GRANT ────────────────────────────────────────
 *
 * "Harga dasar − Diskon = Efektif" per line and "Diskon seluruh booking" are
 * editable only for somebody holding `bookings:setPrice` — the server refuses
 * them otherwise, because the till and the invoice bill this price. Without it
 * the catalogue's price is shown, read-only. The figures are previewed with the
 * server's own rules (`bookingCreateDraft.ts`).
 *
 * ─── WHAT THE MOCKUP ASKS FOR THAT IS NOT BUILT ────────────────────────────
 *
 * A house call is an explicit switch (10 October 2026), with a pinned visit
 * address and a server-owned "Biaya kunjungan" line. A service priced by Zona or by a "Dipilih staf" card is quoted here since 17
 * September 2026 — `useVariantQuote`, and a select per card under the service. The schedule is a date and a time, as the API stores it, not the
 * mockup's Pagi/Siang blocks. Saving ASKS for the appointment (`requested`), as
 * the booking form does — confirming it is the shop's separate act.
 */
export function GroomingBookingCreateScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const mayPrice = can("bookings", "setPrice");
  const { label: optionLabel } = usePetOptions();

  const scope = useBranchScope();
  const [pickedBranch, setPickedBranch] = useState("");
  const branchId = pickedBranch || scope.soleBranch;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [petsNonce, setPetsNonce] = useState(0);
  const [loadingPets, setLoadingPets] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PetDraft>>({});

  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [groomers, setGroomers] = useState<GroomerAvailability[]>([]);

  const [date, setDate] = useState(todayValue);
  const [time, setTime] = useState(nextHalfHourValue);
  const [bookingDiscount, setBookingDiscount] = useState<{
    mode: DiscountMode;
    value: string;
  }>({ mode: "amount", value: "" });

  /* The van, when a chosen service offers one — BO's note 4 (21 Sep 2026). */
  const [ride, setRide] = useState<RideDraft>(BLANK_RIDE);

  /*
    WHERE THE WORK HAPPENS IS ASKED, NOT DERIVED (10 October 2026). It used to
    be read off the chosen services' `serviceLocations`; the switch is what
    filters the services now, so the answer comes first.
  */
  const [home, setHome] = useState(false);
  const location: BookingLocation = home ? "in_home" : "in_store";
  /* The visit address: the customer's own until somebody picks another. */
  const [visitDraft, setVisitDraft] = useState<PointDraft>(DEFAULT_VISIT_DRAFT);
  /* The server's refusal about the address, kept beside the address card. */
  const [visitError, setVisitError] = useState<string | null>(null);
  /* What flipping the switch took off the form, said by name. */
  const [dropped, setDropped] = useState<string[]>([]);

  const [picking, setPicking] = useState(false);
  const [addingPet, setAddingPet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /* The clash the server refused, kept so saving again overrides it. */
  const [clash, setClash] = useState<string | null>(null);
  /*
    A LINE THE SERVER REFUSED OVER ITS CHOICES OR ITS ZONE, by animal — shown on
    that animal's card, under the select it is about when it names one.
  */
  const [refusal, setRefusal] = useState<(VariantRefusal & { petId: string }) | null>(null);
  /*
    A MEMBERSHIP BENEFIT THE SERVER REFUSED ON SAVE (membership-v1 §8), by
    animal — shown under that animal's "Benefit membership".
  */
  const [benefitErrors, setBenefitErrors] = useState<Record<string, string>>({});

  /*
    PRICED BEYOND THE PET (17 September 2026): the zone is the customer's pin
    measured from the chosen branch; the "Dipilih staf" values are per animal.
  */
  const branch = scope.branches.find((entry) => entry._id === branchId) ?? null;
  const visitPoint = visitPointOf(visitDraft, customer, branch);
  const visitPin = visitPinOf(visitPoint);

  /*
    A HOUSE CALL IS MEASURED TO THE VISIT ADDRESS, not to the customer's own
    pin (10 October 2026) — the server prices zone variants from branch -> the
    pinned visit address, so the preview does too.
  */
  const variant = useVariantQuote({
    branchPin: branch?.location,
    customerPin: home ? visitPin : customer?.location,
  });

  /*
    WHAT A HOUSE CALL COSTS, and how a fee is counted — the shop's home-grooming
    settings, read behind the booking grants (not `tenants:read`, which a
    cashier may lack). Only read once the switch is on.
  */
  const homeFees = useHomeVisitFees(home);
  const visitUnit = homeFees?.unit ?? null;

  /* What is still offered — a retired service is not something to promise. */
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

  /* Who may be booked on the day. Best effort: assignment is optional. */
  useEffect(() => {
    if (date === "") return;

    let active = true;

    bookingService
      .availability(date)
      .then((rows) => {
        if (active) setGroomers(rows);
      })
      .catch(() => {
        if (active) setGroomers([]);
      });

    return () => {
      active = false;
    };
  }, [date]);

  /* The customer's animals, re-asked after a quick-add. */
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

  /**
   * The variant the price was read from — "Long Hair · Small · Anjing" —
   * always in that order: coat, size, species. Only the axes the service is
   * priced by; a flat-priced service has no variant and gets no line.
   */
  const variantWords = (service: Service | null, pet: Pet): string | undefined => {
    if (!service?.hasVariants) return undefined;

    const facts: Record<(typeof VARIANT_ORDER)[number], string | null> = {
      furType: optionLabel("furType", pet.furType),
      sizeCategory: optionLabel("size", pet.size),
      petType: optionLabel("species", pet.species),
    };

    const words = VARIANT_ORDER.filter((axis) => service.variantAxes.includes(axis))
      .map((axis) => facts[axis])
      .filter(Boolean)
      .join(" · ");

    return words || undefined;
  };

  const serviceOf = useCallback(
    (id: string) => services.find((service) => service._id === id) ?? null,
    [services],
  );

  /*
    The grooming services — BY KIND, NOT BY LINE (30 September 2026, on request).
    `serviceKind` is a fixed word the service carries; a lini bisnis is a free
    label, and a tenant that reports everything under one line was being offered
    every main service it sells, van rides and hotel stays among them.
  */
  const mainServices = useMemo(
    () =>
      services.filter(
        (service) =>
          service.serviceType === "main" &&
          service.serviceKind === GROOMING_LINE.serviceKind &&
          offeredAt(service, location),
      ),
    [services, location],
  );

  function chooseCustomer(next: Customer) {
    setCustomer(next);
    setPets([]);
    setDrafts({});
    setBookingDiscount({ mode: "amount", value: "" });
    setClash(null);
    setRefusal(null);
    setBenefitErrors({});
    /* Another customer, another address to start from. */
    setVisitDraft(DEFAULT_VISIT_DRAFT);
    setVisitError(null);
    setDropped([]);
  }

  /**
   * THE SWITCH. What no longer fits the new place is taken off — by name, said
   * on the form — rather than kept for the server to refuse on save.
   */
  function switchHome(next: boolean) {
    if (next === home) return;

    const where: BookingLocation = next ? "in_home" : "in_store";
    const lost: string[] = [];
    const kept: Record<string, PetDraft> = { ...drafts };

    for (const { pet, draft } of picked) {
      const main = serviceOf(draft.serviceId);

      if (draft.serviceId !== "" && !offeredAt(main, where)) {
        lost.push(`${main?.name ?? "Layanan"} (${pet.name})`);
        kept[pet._id] = {
          ...draft,
          serviceId: "",
          addonServiceIds: [],
          main: BLANK_PRICE,
          addons: {},
          variantChoices: [],
        };
        continue;
      }

      const stay = draft.addonServiceIds.filter((id) => offeredAt(serviceOf(id), where));
      if (stay.length === draft.addonServiceIds.length) continue;

      for (const id of draft.addonServiceIds) {
        if (!stay.includes(id)) lost.push(`${serviceOf(id)?.name ?? "Add-on"} (${pet.name})`);
      }
      kept[pet._id] = {
        ...draft,
        addonServiceIds: stay,
        addons: Object.fromEntries(
          Object.entries(draft.addons).filter(([id]) => stay.includes(id)),
        ),
      };
    }

    setHome(next);
    setDrafts(kept);
    setDropped(lost);
    /* A house call has no van, and the address starts from the customer's. */
    setRide(BLANK_RIDE);
    setVisitDraft(DEFAULT_VISIT_DRAFT);
    setVisitError(null);
    setClash(null);
    setRefusal(null);
  }

  function togglePet(petId: string) {
    setDrafts((prev) => {
      if (prev[petId]) {
        const next = { ...prev };
        delete next[petId];
        return next;
      }
      return { ...prev, [petId]: blankPetDraft(petId) };
    });
    setClash(null);
    setRefusal(null);
  }

  function patchDraft(petId: string, patch: Partial<PetDraft>) {
    setDrafts((prev) =>
      prev[petId] ? { ...prev, [petId]: { ...prev[petId], ...patch } } : prev,
    );
    setClash(null);
    setRefusal(null);
    setBenefitErrors((prev) => {
      if (!(petId in prev)) return prev;
      const next = { ...prev };
      delete next[petId];
      return next;
    });
  }

  /* ─── WHAT THE FORM COMES TO ───────────────────────────────────────────── */

  const picked = pets
    .filter((pet) => drafts[pet._id])
    .map((pet) => ({ pet, draft: drafts[pet._id] }));

  const priced = picked.map(({ pet, draft }) => {
    const service = serviceOf(draft.serviceId);
    const quote = variant.quote(service, pet, draft.variantChoices);
    const main = priceLine(quote.price, draft.main);
    const addons = draft.addonServiceIds.map((addonId) => {
      const addon = serviceOf(addonId);
      const addonQuote = variant.quote(addon, pet, draft.variantChoices);
      return {
        addonId,
        addon,
        quote: addonQuote,
        /* The zone or the choice this add-on is still waiting for, as a sentence. */
        problem: addon ? variant.problemOf(addon, addonQuote) : null,
        line: priceLine(addonQuote.price, draft.addons[addonId] ?? BLANK_PRICE),
      };
    });

    const lines: PricedLine[] = [main, ...addons.map((row) => row.line)];

    return {
      pet,
      draft,
      service,
      quote,
      problem: service ? variant.problemOf(service, quote) : null,
      main,
      addons,
      gross: lines.reduce((sum, row) => sum + (row.price ?? 0n), 0n),
      own: lines.reduce((sum, row) => sum + row.discount, 0n),
      net: lines.reduce((sum, row) => sum + row.net, 0n),
      minutes:
        (quote.durationMin ?? 0) +
        addons.reduce((sum, row) => sum + (row.quote.durationMin ?? 0), 0),
    };
  });

  const split = splitBookingDiscount(
    priced.map((row) => row.net),
    bookingDiscount.mode,
    mayPrice ? bookingDiscount.value : "",
  );

  /*
    THE VISIT FEE — a line of its own, from the zone of the visit address. It is
    added to the total and is NOT part of what a discount is taken from: the
    server owns the row, and nobody types or discounts it.
  */
  const visitZone = variant.zone;
  const feeMinor = home ? visitFeeOf(visitZone, homeFees, priced.length) : 0n;
  const visitReason =
    home && customer ? visitProblem({ customer, point: visitPoint, zone: visitZone }) : null;
  const servicesSubtotal = priced.reduce((sum, row) => sum + row.net, 0n);
  const subtotal = servicesSubtotal + feeMinor;

  /*
    ─── MEMBERSHIP (Promosi V1) ─────────────────────────────────────────────

    THE SAME QUESTION `BookingForm` ASKS, through the same pure file
    (`benefitQuote.ts`): one quote for the whole save, one entry per animal
    keyed by the animal, the booking's own date and time, the visit fee once on
    a house call, and each animal's pick. The animals compete for the same
    jatah, which only the server can settle.

    THE AMOUNT IS THE MAIN SERVICE'S EFEKTIF — after the line's own discount —
    because that is what the till measures a planned benefit against
    (`#applyPlannedBenefits`: "the booking's own discount comes off first").
    Add-ons go with no pick, each at its own Efektif: the quote recommends a
    benefit per add-on, shown on its row and counted below — never saved.
  */
  const benefitCards: BenefitCardState[] = priced.map(({ pet, draft }) => ({
    key: pet._id,
    petId: pet._id,
    serviceId: draft.serviceId,
    benefitPicked: draft.benefitPicked,
    plannedBenefit: draft.plannedBenefit,
    noMemberAddonIds: draft.noMemberAddonIds ?? [],
  }));
  const feeShown = home && feeMinor > 0n ? toDecimalString(feeMinor) : null;
  const benefitQuoteState = useBookingBenefitQuote(
    bookingQuoteInput({
      cards: benefitCards,
      customerId: customer?._id ?? null,
      date: date !== "" && time !== "" ? toScheduledAt(date, time) : null,
      visitFee: feeShown,
      pricesOf: (card) => {
        const row = priced.find((entry) => entry.pet._id === card.key);
        if (!row || row.quote.inactive || row.main.price === null) return null;
        return {
          amount: toDecimalString(row.main.net),
          addons: row.addons
            .filter((addon) => !addon.quote.inactive && addon.line.price !== null)
            .map((addon) => ({ serviceId: addon.addonId, amount: toDecimalString(addon.line.net) })),
        };
      },
    }),
  );
  const benefitQuote = benefitQuoteState.quote;
  const benefitViews = benefitCards.map((card) => cardBenefitView(card, benefitQuote));
  /* Per animal, in minor units, never more than what is left of its main line. */
  const memberOffs = priced.map((row, index) => {
    const off = toMinor(benefitViews[index]?.discount ?? "0") ?? 0n;
    return off > row.main.net ? row.main.net : off;
  });
  /*
    EACH TICKED ADD-ON'S BENEFIT (22 October 2026) — applied automatically, no
    radio; the till applies the add-on lines itself when the booking is billed.
    "Tanpa member" on an add-on (`noMemberAddonIds`) takes it out of the totals
    and is saved on the booking, so the till does not apply it either. In minor
    units, never more than the add-on's own Efektif.
  */
  const addonMembers = priced.map((row, index) => {
    const found = addonBenefitsOf(benefitCards[index], benefitQuote, benefitQuoteState.asked);
    const out: Record<string, { label: string; off: bigint; quota: boolean; optedOut: boolean }> =
      {};
    for (const addonRow of row.addons) {
      const hit = found[addonRow.addonId];
      if (!hit || addonRow.quote.inactive || addonRow.line.price === null) continue;
      const raw = toMinor(hit.discount) ?? 0n;
      const off = raw > addonRow.line.net ? addonRow.line.net : raw;
      if (off > 0n || hit.optedOut) {
        out[addonRow.addonId] = { label: hit.label, off, quota: hit.quota, optedOut: hit.optedOut };
      }
    }
    return out;
  });
  const addonOffs = addonMembers.map((found) =>
    Object.values(found).reduce((sum, item) => sum + item.off, 0n),
  );
  const memberDiscount =
    memberOffs.reduce((sum, off) => sum + off, 0n) +
    addonOffs.reduce((sum, off) => sum + off, 0n);
  /* The fee is waived when the visit line says so — never more than the fee shown. */
  const feeWaived = feeShown && isPositive(visitFeeDiscountOf(benefitQuote)) ? feeMinor : 0n;

  /*
    WHAT THE CUSTOMER PAYS. The Ringkasan's Subtotal is AFTER the membership
    (each animal's "Potongan member" line sits above it, like its own item
    discount, and a waived fee is struck in its row), so the lines it shows add
    up; the booking discount is still the one the server resolves on the nets
    before any membership — it is fixed at create, the benefit at the till.
  */
  const memberSubtotal = subtotal - memberDiscount - feeWaived;
  const total = memberSubtotal - split.total;
  const totalBeforeMember = subtotal - split.total;

  /* The "Member" fact — every live card the customer holds, in one request. */
  const memberCards = useCustomerMemberships(customer?._id ?? null);

  /* WHERE THE WORK HAPPENS — every booking of one save shares it. */
  const chosenServices = priced.map((row) => row.service).filter(Boolean) as Service[];
  /*
    ANTAR-JEMPUT FOR THIS VISIT — offered when a chosen service is switched to
    "Bisa antar-jemput" and the work is in the shop (a house call has no van).
  */
  const rideOffered =
    !home && chosenServices.some((service) => service.pickupDeliveryAvailable);
  const rideService = serviceOf(ride.serviceId);
  const quotedRides = rideOffered
    ? quoteRides(ride, rideService, priced[0]?.pet ?? null, priced.length, variant)
    : [];
  const rideTotal = quotedRides.reduce((sum, row) => sum + (row.price ?? 0n), 0n);
  const rideBlocked = rideOffered ? rideBlockedReason(ride, quotedRides) : null;
  /* Whether anything chosen — a service or a ticked add-on — is priced by Zona. */
  const zoneAsked = variant.needsZone(
    priced.flatMap((row) => [row.service, ...row.addons.map((addon) => addon.addon)]),
  );

  const withoutService = priced.find((row) => !row.service);
  const sizeless = priced.find((row) => !row.pet.size);
  const unpriceable = priced.find(
    (row) =>
      row.quote.missingAxis !== null ||
      row.addons.some((addon) => addon.quote.missingAxis !== null),
  );
  const inactive = priced.find(
    (row) => row.quote.inactive || row.addons.some((addon) => addon.quote.inactive),
  );
  /* A ZONE NOBODY CAN MEASURE, OR A "DIPILIH STAF" VALUE NOBODY CHOSE. */
  const unanswered = priced
    .map((row) => row.problem ?? row.addons.find((addon) => addon.problem)?.problem ?? null)
    .find((problem): problem is string => problem !== null);

  const blockedReason = !branchId
    ? "Cabang belum dipilih."
    : !customer
      ? "Pelanggan belum dipilih."
      : priced.length === 0
        ? "Hewan belum dipilih."
        : withoutService
          ? `Layanan ${withoutService.pet.name} belum dipilih.`
          : sizeless
            ? `Ukuran ${sizeless.pet.name} belum diisi.`
            : unpriceable
              ? `Data ${unpriceable.pet.name} belum lengkap, harganya belum bisa dihitung.`
              : unanswered
                ? `${unanswered}.`
                : inactive
                ? `Varian layanan untuk ${inactive.pet.name} sedang nonaktif.`
                : visitReason
                  ? visitReason
                  : date === "" || time === ""
                    ? "Tanggal dan jamnya belum lengkap."
                    : rideBlocked;

  async function save() {
    if (saving || !customer || blockedReason) return;

    const scheduledAt = toScheduledAt(date, time);
    if (!scheduledAt) {
      setFormError("Tanggal dan jamnya belum lengkap.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setRefusal(null);
    setBenefitErrors({});

    /*
      THE BENEFIT EACH ANIMAL SAVES — what its radio shows, read off a quote for
      THIS form's question (awaited, or asked again, when the last answer was
      for a date or a service somebody has since changed).
    */
    const latestQuote = await benefitQuoteState.latest();
    const entries = picked.map(({ pet, draft }) =>
      toEntry(
        {
          ...draft,
          plannedBenefit: effectivePlan(
            {
              key: pet._id,
              petId: pet._id,
              serviceId: draft.serviceId,
              benefitPicked: draft.benefitPicked,
              plannedBenefit: draft.plannedBenefit,
            },
            latestQuote,
          ),
        },
        serviceOf,
      ),
    );

    try {
      const result = await bookingService.create({
        customerId: customer._id,
        branchId,
        scheduledAt,
        status: "requested",
        location,
        ...(home ? { visitAddress: visitInputOf(visitPoint) } : {}),
        forceClash: clash !== null,
        bookingDiscount: mayPrice
          ? typedDiscount(bookingDiscount.mode, bookingDiscount.value)
          : null,
        bookings: entries,
      });

      const made = result.bookings;
      const numbers = made
        .map((booking) => booking.bookingNumber)
        .filter(Boolean)
        .join(", ");

      /*
        THE RIDES, AFTER THE GROOMING AND INTO ITS VISIT. Two saves, so one can
        fail on its own: the grooming stands, and what did not save is said —
        it is booked from the Antar-Jemput module.

        ⚠️ THE MESSAGE USED TO NAME "+ Antar-jemput" on the booking's own page,
        removed 24 September 2026. Nothing is added to a booking from there any
        more, so the sentence had to stop sending people to look for it.
      */
      const rideMisses: string[] = [];
      if (rideOffered && ride.legs.length > 0 && rideService) {
        for (const request of rideRequests({
          draft: ride,
          quoted: quotedRides,
          service: rideService,
          date,
          base: { customerId: customer._id, branchId, groupId: result.groupId },
          petIds: picked.map(({ pet }) => pet._id),
          customerAddress: customer.address ?? null,
        })) {
          try {
            await bookingService.create(request.input);
          } catch (rideError) {
            rideMisses.push(
              `${LEG_LABEL[request.leg]}: ${
                rideError instanceof ApiError ? rideError.fullMessage : "gagal"
              }`,
            );
          }
        }
      }

      router.push(
        made.length === 1 ? `/dashboard/booking/${made[0]._id}` : GROOMING_BOOKINGS_PATH,
      );
      router.refresh();

      /* Last, and outside the save's try — see BookingForm for why. */
      try {
        if (rideMisses.length > 0) {
          swalToast(
            `Grooming tersimpan, antar-jemput belum — ${rideMisses.join("; ")}. Buat antar-jemputnya dari Layanan › Antar-Jemput.`,
            "error",
            9000,
          );
        } else {
          swalToast(
            numbers
              ? `${made.length} booking dibuat: ${numbers}${ride.legs.length && rideOffered ? " + antar-jemput" : ""}`
              : `${made.length} booking dibuat.`,
          );
        }
      } catch {
        /* The page it landed on already shows it. */
      }
    } catch (error) {
      /*
        A MEMBERSHIP BENEFIT REFUSED (membership-v1 §8) — 409 for the card's
        state (jatah habis, held by another booking, paused), 400 for a pick
        that does not fit. Checked BEFORE the clash, exactly as `BookingForm`
        does: a 409 naming `plannedBenefit` is not a clash. A toast says it,
        the animal it is about says it again, and the quote is asked again.
      */
      const benefitRefused = benefitRefusalOf(error);
      if (benefitRefused) {
        const about =
          (benefitRefused.index !== null ? picked[benefitRefused.index] : undefined) ?? picked[0];
        if (about) setBenefitErrors({ [about.pet._id]: benefitRefused.message });
        benefitQuoteState.refresh();
        try {
          swalToast(benefitRefused.message, "error", 6000);
        } catch {
          /* The animal's card shows it too. */
        }
        setSaving(false);
        return;
      }

      /*
        THE ADDRESS REFUSED — beside the address card, in the server's own
        Indonesian. The phone's refusal is filed under `customerId` there.
      */
      if (home && error instanceof ApiError && error.status === 400) {
        const fields = error.fieldErrors;
        const about = fields.visitAddress ?? fields.customerId;
        if (about) {
          setVisitError(about);
          setSaving(false);
          return;
        }
      }

      const refused = variantRefusalOf(error);
      /*
        WHICH ANIMAL: the entry the path names, else the first whose service
        declares the card — or varies by zone — the refusal is about.
      */
      const refusedRow = refused
        ? ((refused.index !== null ? picked[refused.index] : undefined) ??
          picked.find(({ draft }) =>
            [draft.serviceId, ...draft.addonServiceIds].some((id) =>
              refused.optionId
                ? staffAxesOf(serviceOf(id)).includes(refused.optionId)
                : variesByZone(serviceOf(id)),
            ),
          ) ??
          picked[0])
        : undefined;

      if (refused && refusedRow) {
        setRefusal({ ...refused, petId: refusedRow.pet._id });
      } else if (error instanceof ApiError && error.status === 409) {
        setClash(error.fullMessage);
      } else if (error instanceof ApiError) {
        setFormError(error.fullMessage);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  const count = priced.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Bare text: `PageHeading` wraps its children in a <p> already. */}
      <PageHeading
        crumbs={[
          { label: "Layanan" },
          { label: "Grooming", href: GROOMING_PATH },
          { label: "Booking baru" },
        ]}
        title="Booking baru"
      >
        Satu hewan satu nomor booking. Semua yang disimpan bersama tercatat
        sebagai satu kunjungan.
      </PageHeading>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        {/* No title — the page heading already names the document (§16). */}
        <FormActionBar
          submitLabel={count > 1 ? `Simpan ${count} booking` : "Simpan booking"}
          submitting={saving}
          disabled={blockedReason !== null}
          blockedReason={blockedReason}
          onCancel={() => {
            if (!saving) router.push(GROOMING_BOOKINGS_PATH);
          }}
        />

        {loadError && <Alert variant="error">{loadError}</Alert>}
        {formError && <Alert variant="error">{formError}</Alert>}
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
                  {/*
                    THE TILL'S PICKER, dressed as the mockup's search box. It
                    searches on the server and registers a new customer without
                    leaving the form — a second searchable picker is what §2 rules out.
                  */}
                  <Button
                    type="button"
                    variant="secondary"
                    className={`${FIELD_HEIGHT} justify-start font-normal`}
                    disabled={saving}
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
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Fact label="WhatsApp">
                      <span className="tabular-nums">{customer.phone ?? "—"}</span>
                    </Fact>
                    <Fact label="Alamat">{customer.address ?? "—"}</Fact>
                    <Fact label="Zona">
                      {/*
                        THE CUSTOMER'S ZONE FROM THE CHOSEN BRANCH — asked only
                        when a chosen service is priced by it, or when it can be
                        said anyway. Otherwise a tenant with no zones would read
                        a failure about a thing it never set up.
                      */}
                      {variant.zone.ok || zoneAsked ? (
                        <span className={variant.zone.ok ? "tabular-nums" : "font-normal text-muted"}>
                          {variant.zoneText}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Fact>
                    <Fact label="Member">
                      {/*
                        SHOWS THE MEMBERSHIP CARDS — a card is what the
                        benefit below is spent from. One chip per live card:
                        the animal's name, or "Semua hewan" for a card held by
                        the customer.
                      */}
                      {(() => {
                        /*
                          SHORT, NEVER WIDER THAN ITS COLUMN (22 October 2026,
                          on request). An animal's card is shown on its own tile
                          under Hewan; here only a customer-held card ("Semua
                          hewan") gets a chip — truncated — and the animals'
                          cards are counted.
                        */
                        const shared = memberCards.filter((card) => card.attachTo === "customer");
                        const perPet = new Set(
                          memberCards
                            .filter((card) => card.attachTo !== "customer" && card.petId)
                            .map((card) => card.petId),
                        ).size;
                        if (shared.length === 0 && perPet === 0) return "—";
                        return (
                          <span className="flex min-w-0 flex-col items-start gap-1">
                            {shared.map((card) => (
                              <span
                                key={card.id}
                                data-member-chip
                                className={`${badge} inline-block max-w-full truncate ${card.status === "paused" ? "bg-tint-neutral text-muted" : "bg-tint-success text-success"}`}
                              >
                                {memberChipText(card, pets)}
                              </span>
                            ))}
                            {perPet > 0 && <span className="font-normal">{perPet} hewan member</span>}
                          </span>
                        );
                      })()}
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
                  {count} dipilih
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
                        const on = Boolean(drafts[pet._id]);
                        return (
                          <li key={pet._id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              disabled={saving}
                              onClick={() => togglePet(pet._id)}
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
                                  {[
                                    optionLabel("breed", pet.breed),
                                    pet.weightKg !== null ? `${pet.weightKg} kg` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </span>
                                {(() => {
                                  /* The animal's own membership, on its tile. */
                                  const card = memberCards.find(
                                    (one) => one.attachTo !== "customer" && one.petId === pet._id,
                                  );
                                  if (!card) return null;
                                  const label = `Member · ${card.plan?.name ?? "Membership"}${card.status === "paused" ? " (dijeda)" : ""}`;
                                  return (
                                    <span
                                      data-member-chip
                                      className={`${badge} mt-1 inline-block max-w-full truncate ${card.status === "paused" ? "bg-tint-neutral text-muted" : "bg-tint-success text-success"}`}
                                    >
                                      {label}
                                    </span>
                                  );
                                })()}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
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

            {/* ─── JADWAL ─── */}
            <Card title="Jadwal">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Tanggal"
                  name="grooming-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={saving}
                  required
                />
                <TextField
                  label="Jam mulai"
                  name="grooming-time"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  disabled={saving}
                  required
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
              </div>
            </Card>

            {/* ─── LOKASI: HOME GROOMING ─── */}
            {/*
              Under the animals and above the services, because it is what
              filters them: a service offered only at the shop is not on this
              list while the switch is on, and the other way round.
            */}
            <Card title="Lokasi grooming">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Label htmlFor="home-grooming" className="text-sm font-semibold">
                      Grooming di rumah pelanggan
                    </Label>
                    <p className="mt-0.5 text-xs text-muted">
                      {home
                        ? "Groomer datang ke alamat pelanggan. Layanan yang ditampilkan hanya yang melayani di rumah."
                        : "Mati berarti grooming dikerjakan di toko."}
                    </p>
                  </div>
                  <Switch
                    id="home-grooming"
                    checked={home}
                    onCheckedChange={switchHome}
                    disabled={saving}
                  />
                </div>

                {dropped.length > 0 && (
                  <Alert variant="warning">
                    Dilepas karena tidak tersedia untuk grooming{" "}
                    {home ? "di rumah pelanggan" : "di toko"}: {dropped.join(", ")}. Pilih
                    lagi layanan yang cocok.
                  </Alert>
                )}
              </div>
            </Card>

            {rideOffered && (
              <RideForGroomingSection
                value={ride}
                onChange={setRide}
                services={services}
                variant={variant}
                pet={priced[0]?.pet ?? null}
                riders={priced.length}
                date={date}
                time={time}
                minutes={Math.max(...priced.map((row) => row.minutes), 0)}
                customerAddress={customer?.address ?? null}
                disabled={saving}
              />
            )}

            {/* ─── LAYANAN PER HEWAN ─── */}
            <section aria-labelledby="per-pet" className="flex flex-col gap-3">
              <h2 id="per-pet" className="text-lg font-bold">
                Layanan per hewan
              </h2>

              {count === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                  Pilih hewan dulu di atas.
                </p>
              ) : loadingServices ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Memuat layanan…
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {priced.map((row) => {
                    const { pet, draft, service, quote } = row;
                    const offered = (service?.addonServiceIds ?? [])
                      .map((id) => serviceOf(id))
                      .filter(
                        (addon): addon is Service =>
                          addon !== null && offeredAt(addon, location),
                      );
                    const rowIndex = priced.indexOf(row);
                    const share = split.shares[rowIndex] ?? 0n;
                    const benefit = benefitViews[rowIndex];
                    const memberOff = memberOffs[rowIndex] ?? 0n;
                    const addonMember = addonMembers[rowIndex] ?? {};
                    /* The animal's whole membership: its service's pick and its add-ons'. */
                    const animalMemberOff = memberOff + (addonOffs[rowIndex] ?? 0n);
                    const cards = variant.cardsFor([
                      service,
                      ...draft.addonServiceIds.map((id) => serviceOf(id)),
                    ]);
                    const lineRefusal = refusal?.petId === pet._id ? refusal : null;
                    /* The zone answer beside a price that depends on it. */
                    const zoneNote = (quoted: Service | null) =>
                      variesByZone(quoted) && variant.zone.ok ? `Zona: ${variant.zoneText}` : null;

                    return (
                      <li
                        key={pet._id}
                        className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-3 bg-navy-100 px-4 py-3">
                          <Initial name={pet.name} />
                          <span className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-bold text-foreground">
                              {pet.name}
                            </h3>
                            <span className="block truncate text-xs text-muted">
                              {[
                                optionLabel("breed", pet.breed),
                                optionLabel("size", pet.size),
                                optionLabel("furType", pet.furType),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </span>
                          </span>
                          {row.minutes > 0 && (
                            <span className={`${badge} bg-surface text-foreground tabular-nums`}>
                              {row.minutes} mnt
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            onClick={() => togglePet(pet._id)}
                          >
                            Hapus
                          </Button>
                        </div>

                        <div className="flex flex-col gap-4 p-4">
                          {!pet.size && (
                            <Alert variant="warning">
                              {pet.name} belum punya ukuran — ukuran wajib diisi
                              untuk booking. <PetFixLink pet={pet} axis="sizeCategory" />
                            </Alert>
                          )}

                          {/* Handling tags and allergies, read BEFORE the service. */}
                          <PetSummaryCard pet={pet} />

                          <div className="grid gap-4 sm:grid-cols-2">
                            {/*
                              A POPOVER, NOT `SelectField`. Radix Select locks the
                              page while its list is open, so on this long form the
                              page and the sidebar froze; this one lets them
                              scroll, and closes as soon as they do.
                            */}
                            <FilterSelect
                              layout="form"
                              label="Layanan"
                              value={draft.serviceId}
                              onChange={(value) =>
                                /* Different add-ons, and a different quote. */
                                patchDraft(pet._id, {
                                  serviceId: value,
                                  addonServiceIds: [],
                                  main: BLANK_PRICE,
                                  addons: {},
                                  variantChoices: [],
                                })
                              }
                              options={mainServices.map((item) => ({
                                value: item._id,
                                label: item.name,
                              }))}
                              active={false}
                              placeholder="Pilih layanan…"
                              closeOnScroll
                              disabled={saving}
                              required
                            />
                            <TextField
                              label="Varian"
                              name={`variant-${pet._id}`}
                              value={variantLabelForPet(service, pet, optionLabel) ?? "—"}
                              onChange={() => {}}
                              disabled
                            />
                            {groomers.length > 0 && (
                              /* Full width — its own row under Layanan · Varian. A
                                 popover for the same reason as Layanan above. */
                              <FilterSelect
                                layout="form"
                                label="Groomer"
                                value={draft.groomerUserId}
                                onChange={(value) =>
                                  patchDraft(pet._id, { groomerUserId: value })
                                }
                                options={[
                                  { value: "", label: "Belum ditugaskan" },
                                  ...groomers.map((groomer) => {
                                    /* "Sinta · Senior", as the mockup and the booking page write it. */
                                    const name = groomer.groomerLevel
                                      ? `${groomer.fullName} · ${GROOMER_LEVEL_LABELS[groomer.groomerLevel]}`
                                      : groomer.fullName;

                                    return {
                                      value: groomer._id,
                                      label: groomer.offReason
                                        ? `${name} — ${groomer.offReason}`
                                        : name,
                                      disabled: Boolean(groomer.offReason),
                                    };
                                  }),
                                ]}
                                active={false}
                                placeholder="Belum ditugaskan"
                                hint="Diisikan ke semua tahapan layanan ini. Bisa diganti per tahapan di halaman booking."
                                closeOnScroll
                                disabled={saving}
                                className="sm:col-span-2"
                              />
                            )}
                          </div>

                          {/*
                            ONE SELECT PER "DIPILIH STAF" CARD the service and
                            its ticked add-ons declare — "Lokasi: Di Rumah". An
                            add-on shares the service's answer.
                          */}
                          <VariantChoicePicker
                            cards={cards}
                            value={draft.variantChoices}
                            onChange={(next) => patchDraft(pet._id, { variantChoices: next })}
                            disabled={saving}
                            errorFor={(optionId) =>
                              lineRefusal?.optionId === optionId ? lineRefusal.message : undefined
                            }
                          />

                          {lineRefusal && !cards.some((card) => card.axisKey === lineRefusal.optionId) && (
                            <Alert variant="error">{lineRefusal.message}</Alert>
                          )}

                          {service && (
                            <div className="flex flex-col gap-2">
                              <p className="text-sm font-medium">Harga &amp; diskon per item</p>

                              <PriceRow
                                name={service.name}
                                line={row.main}
                                draft={draft.main}
                                missing={
                                  quote.missingAxis ? (
                                    <>
                                      {pet.name} belum punya {AXIS_LABEL[quote.missingAxis]} — harga
                                      layanan ini mengikutinya.{" "}
                                      <PetFixLink pet={pet} axis={quote.missingAxis} />
                                    </>
                                  ) : (
                                    row.problem
                                  )
                                }
                                note={zoneNote(service)}
                                inactive={quote.inactive}
                                mayPrice={mayPrice}
                                disabled={saving}
                                onChange={(next) => patchDraft(pet._id, { main: next })}
                                member={
                                  memberOff > 0n
                                    ? { label: benefit?.appliedLabel ?? null, discount: memberOff }
                                    : null
                                }
                                benefit={
                                  /*
                                    THE MAIN SERVICE'S MEMBER BENEFIT, on its own
                                    row (22 October 2026) — what it shows is
                                    what the save sends, and HOLDS.
                                  */
                                  benefit ? (
                                    <BookingBenefitField
                                      view={benefit}
                                      serviceName={service.name}
                                      disabled={saving}
                                      error={benefitErrors[pet._id] ?? null}
                                      onPick={(candidate) =>
                                        patchDraft(pet._id, {
                                          benefitPicked: true,
                                          plannedBenefit: candidate ? toPlan(candidate) : null,
                                        })
                                      }
                                    />
                                  ) : null
                                }
                              />

                              {row.addons.map((addonRow) => (
                                <PriceRow
                                  key={addonRow.addonId}
                                  name={addonRow.addon?.name ?? "Add-on"}
                                  line={addonRow.line}
                                  draft={draft.addons[addonRow.addonId] ?? BLANK_PRICE}
                                  missing={
                                    addonRow.quote.missingAxis
                                      ? `${pet.name} belum punya ${AXIS_LABEL[addonRow.quote.missingAxis]}.`
                                      : addonRow.problem
                                  }
                                  note={zoneNote(addonRow.addon)}
                                  inactive={addonRow.quote.inactive}
                                  mayPrice={mayPrice}
                                  disabled={saving}
                                  member={
                                    addonMember[addonRow.addonId]
                                      ? {
                                          label: addonMember[addonRow.addonId].label,
                                          discount: addonMember[addonRow.addonId].off,
                                          bare: true,
                                          estimate: addonMember[addonRow.addonId].quota,
                                          optedOut: addonMember[addonRow.addonId].optedOut,
                                          onToggle: (optOut) =>
                                            patchDraft(pet._id, {
                                              noMemberAddonIds: optOut
                                                ? [...(draft.noMemberAddonIds ?? []), addonRow.addonId]
                                                : (draft.noMemberAddonIds ?? []).filter(
                                                    (id) => id !== addonRow.addonId,
                                                  ),
                                            }),
                                        }
                                      : null
                                  }
                                  onRemove={() => {
                                    const addons = { ...draft.addons };
                                    delete addons[addonRow.addonId];
                                    patchDraft(pet._id, {
                                      addonServiceIds: draft.addonServiceIds.filter(
                                        (id) => id !== addonRow.addonId,
                                      ),
                                      noMemberAddonIds: (draft.noMemberAddonIds ?? []).filter(
                                        (id) => id !== addonRow.addonId,
                                      ),
                                      addons,
                                    });
                                  }}
                                  onChange={(next) =>
                                    patchDraft(pet._id, {
                                      addons: { ...draft.addons, [addonRow.addonId]: next },
                                    })
                                  }
                                />
                              ))}
                            </div>
                          )}

                          {/*
                            A REFUSAL ON SAVE with no price row to sit on (the
                            service lost its price since) still needs a home.
                          */}
                          {benefitErrors[pet._id] &&
                            !(service && row.main.price !== null && !quote.inactive) && (
                              <p role="alert" className="text-sm font-semibold text-danger-ink">
                                {benefitErrors[pet._id]}
                              </p>
                            )}

                          {/*
                            What the animal's cards hold beyond this booking —
                            each a checkbox, saved as `plannedExtras`: a note,
                            no jatah, no price (22 October 2026).
                          */}
                          <OtherBenefitsInfo
                            groups={otherBenefitsOf(memberCards, pet._id, toScheduledAt(date, time))}
                            selected={draft.plannedExtras ?? []}
                            disabled={saving}
                            onChange={(plannedExtras) => patchDraft(pet._id, { plannedExtras })}
                          />

                          {offered.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <p className="text-sm font-medium">Add-on</p>
                              <CheckRowGroup>
                                {offered.map((addon) => {
                                  const addonQuote = variant.quote(addon, pet, draft.variantChoices);
                                  /*
                                    WAITING ON A CHOICE IS NOT A REASON TO REFUSE
                                    THE TICK — the select for it appears once it
                                    is ticked.
                                  */
                                  const waiting = addonQuote.missingChoice
                                    ? "Pilih opsinya setelah dicentang."
                                    : variant.problemOf(addon, addonQuote);
                                  const checked = draft.addonServiceIds.includes(addon._id);

                                  return (
                                    <CheckRow
                                      key={addon._id}
                                      label={addon.name}
                                      description={
                                        addonQuote.inactive
                                          ? "Varian nonaktif — tidak bisa dipilih."
                                          : addonQuote.price
                                            ? `${formatMoney(addonQuote.price)}${addonQuote.durationMin ? ` · +${addonQuote.durationMin} mnt` : ""}`
                                            : (waiting ?? "—")
                                      }
                                      checked={checked}
                                      disabled={saving || (addonQuote.inactive && !checked)}
                                      onCheckedChange={(next) => {
                                        const addons = { ...draft.addons };
                                        if (!next) delete addons[addon._id];
                                        patchDraft(pet._id, {
                                          addonServiceIds: next
                                            ? [...draft.addonServiceIds, addon._id]
                                            : draft.addonServiceIds.filter((id) => id !== addon._id),
                                          ...(next
                                            ? {}
                                            : {
                                                noMemberAddonIds: (draft.noMemberAddonIds ?? []).filter(
                                                  (id) => id !== addon._id,
                                                ),
                                              }),
                                          addons,
                                        });
                                      }}
                                    />
                                  );
                                })}
                              </CheckRowGroup>
                            </div>
                          )}

                          <TextareaField
                            label="Catatan internal"
                            name={`notes-${pet._id}`}
                            value={draft.internalNotes}
                            onChange={(event) =>
                              patchDraft(pet._id, { internalNotes: event.target.value })
                            }
                            maxLength={NOTES_MAX_LENGTH}
                            placeholder="Dibaca groomer dan staf — kondisi atau permintaan khusus"
                            disabled={saving}
                          />

                          <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-md bg-background px-3 py-2.5 text-sm">
                            <span className="text-muted tabular-nums">
                              Subtotal {money(row.gross)}
                              {row.own > 0n && ` · diskon item ${money(row.own)}`}
                              {share > 0n && ` · bagian diskon booking ${money(share)}`}
                              {animalMemberOff > 0n && ` · potongan member ${money(animalMemberOff)}`}
                            </span>
                            <span className="font-extrabold tabular-nums">
                              {money(row.net - share - animalMemberOff)}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ─── ALAMAT KUNJUNGAN — only for a house call, AFTER the services ─── */}
            {home && (
              <VisitAddressCard
                customer={customer}
                branch={branch}
                draft={visitDraft}
                point={visitPoint}
                zone={visitZone}
                fees={homeFees}
                animals={priced.length}
                disabled={saving}
                error={visitError}
                onChange={(next) => {
                  setVisitDraft(next);
                  setVisitError(null);
                  setClash(null);
                  setRefusal(null);
                }}
              />
            )}
          </div>

          {/* ─── RINGKASAN ─── */}
          <aside className="lg:sticky lg:top-20">
            <Card title="Ringkasan">
              <div className="flex flex-col gap-1 text-sm">
                <div className="border-b border-border pb-3">
                  <p className="font-bold text-foreground">{customer?.name ?? "Belum ada pelanggan"}</p>
                  <p className="text-xs text-muted tabular-nums">
                    {date || "—"} · {time || "—"}
                  </p>
                </div>

                {count === 0 ? (
                  <p className="py-2 text-muted">Belum ada hewan dipilih.</p>
                ) : (
                  <ul className="flex flex-col gap-1 pt-2">
                    {priced.map((row, index) => (
                      <li key={row.pet._id} className="flex flex-col">
                        <SummaryLine
                          label={`${row.pet.name} · ${row.service?.name ?? "belum ada layanan"}`}
                          detail={variantWords(row.service, row.pet)}
                          hint={
                            row.main.typed && row.main.price !== row.main.quote
                              ? "harga ditimpa"
                              : undefined
                          }
                          value={row.main.price === null ? "—" : money(row.main.price)}
                        />
                        {row.main.discount > 0n && (
                          <SummaryLine
                            tone="discount"
                            label={`Diskon ${row.service?.name ?? ""} · ${discountWords(row.draft.main.discountMode, row.draft.main.discountValue)}`}
                            value={`−${money(row.main.discount)}`}
                          />
                        )}
                        {(memberOffs[index] ?? 0n) > 0n && (
                          <SummaryLine
                            tone="discount"
                            label={`Potongan member · ${benefitViews[index]?.appliedLabel ?? row.service?.name ?? ""}`}
                            value={`−${money(memberOffs[index])}`}
                          />
                        )}
                        {row.addons.map((addonRow) => {
                          const typed = row.draft.addons[addonRow.addonId] ?? BLANK_PRICE;
                          const addonMember = addonMembers[index]?.[addonRow.addonId];
                          return (
                            <div key={addonRow.addonId} className="flex flex-col">
                              <SummaryLine
                                tone="sub"
                                label={`+ ${addonRow.addon?.name ?? "Add-on"}`}
                                value={addonRow.line.price === null ? "—" : money(addonRow.line.price)}
                              />
                              {addonRow.line.discount > 0n && (
                                <SummaryLine
                                  tone="discount"
                                  label={`Diskon ${addonRow.addon?.name ?? ""} · ${discountWords(typed.discountMode, typed.discountValue)}`}
                                  value={`−${money(addonRow.line.discount)}`}
                                />
                              )}
                              {addonMember && addonMember.off > 0n && (
                                <SummaryLine
                                  tone="discount"
                                  label={`Potongan member · ${addonMember.label}`}
                                  value={`−${money(addonMember.off)}`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </li>
                    ))}
                  </ul>
                )}

                {/*
                  THE VISIT FEE, ABOVE THE SUBTOTAL AND NEVER DISCOUNTED — the
                  server adds this row and nobody can type or remove it.
                */}
                {home && feeMinor > 0n && visitZone.ok && (
                  <SummaryLine
                    label={`Biaya kunjungan · ${visitZone.zone.name}`}
                    hint={
                      visitUnit === "per_pet"
                        ? `${count} hewan`
                        : visitUnit === "per_visit"
                          ? "sekali per kunjungan"
                          : undefined
                    }
                    struck={feeWaived > 0n ? money(feeMinor) : undefined}
                    value={feeWaived > 0n ? `${money(feeMinor - feeWaived)} (gratis member)` : money(feeMinor)}
                  />
                )}

                <div className="mt-2 flex justify-between gap-3 border-t border-border pt-2">
                  <span className="text-muted">Subtotal</span>
                  <span className="font-semibold tabular-nums">{money(memberSubtotal)}</span>
                </div>

                {mayPrice && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Label htmlFor="booking-discount">Diskon seluruh booking</Label>
                    <DiscountInput
                      id="booking-discount"
                      mode={bookingDiscount.mode}
                      value={bookingDiscount.value}
                      disabled={saving || count === 0}
                      onChange={(next) => setBookingDiscount(next)}
                    />
                  </div>
                )}

                {split.total > 0n && (
                  <SummaryLine
                    tone="discount"
                    label={`Diskon booking · ${discountWords(bookingDiscount.mode, bookingDiscount.value)}`}
                    value={`−${money(split.total)}`}
                  />
                )}

                <div className="mt-2 flex items-baseline justify-between gap-3 border-t-2 border-foreground pt-2">
                  <span className="font-extrabold">Total</span>
                  <span className="text-right tabular-nums">
                    {total !== totalBeforeMember && (
                      <span
                        data-total-before-member
                        className="mr-2 text-sm text-muted line-through"
                      >
                        {money(totalBeforeMember)}
                      </span>
                    )}
                    <span data-total className="text-xl font-extrabold">
                      {money(total)}
                    </span>
                  </span>
                </div>

                {split.total > 0n && (
                  <p className="mt-2 text-xs text-muted">
                    Diskon booking dibagi rata ke tiap booking.
                  </p>
                )}

                {/*
                  THE RIDES ARE THEIR OWN BOOKINGS — listed under the grooming's
                  total, not folded into it, since each is billed as itself.
                */}
                {quotedRides.length > 0 && rideService && (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="text-xs font-bold tracking-wide text-muted uppercase">
                      Antar-jemput · booking terpisah
                    </p>
                    {quotedRides.map((row) => (
                      <SummaryLine
                        key={row.leg}
                        tone="sub"
                        label={`${LEG_LABEL[row.leg]} · ${ride.times[row.leg].replace(":", ".") || "—"}`}
                        value={row.price === null ? "—" : money(row.price)}
                      />
                    ))}
                    <div className="mt-1 flex justify-between gap-3 font-semibold">
                      <span>Total dengan antar-jemput</span>
                      <span className="tabular-nums">{money(total + rideTotal)}</span>
                    </div>
                  </div>
                )}
                {!mayPrice && (
                  <p className="mt-2 text-xs text-muted">
                    Harga mengikuti katalog. Mengubah harga atau memberi diskon
                    butuh izin dari Owner atau Admin.
                  </p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </form>

      <CustomerSearchDialog
        open={picking}
        onOpenChange={setPicking}
        onSelect={chooseCustomer}
      />

      {customer && (
        <PetQuickAddDialog
          customerId={customer._id}
          customerName={customer.name}
          open={addingPet}
          onOpenChange={setAddingPet}
          /* Ukuran and Jenis bulu ARE the grooming price, so a pet added here
             without them lands straight in `PetFixLink` and the booking it was
             added for cannot be quoted. Ask while the animal is in front of
             them. */
          requireTraits
          onCreated={(pet) => {
            setAddingPet(false);
            setPetsNonce((n) => n + 1);
            setDrafts((prev) => ({ ...prev, [pet._id]: blankPetDraft(pet._id) }));
          }}
        />
      )}
    </div>
  );
}
