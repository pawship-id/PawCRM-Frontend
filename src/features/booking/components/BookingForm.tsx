"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserRound } from "lucide-react";

import {
  Alert,
  Card,
  CheckRow,
  CheckRowGroup,
  FilterSelect,
  FormActionBar,
  SelectField,
  Spinner,
  TextField,
  TextareaField,
  namedOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { CustomerSearchDialog } from "@/features/customers";
import { PetQuickAddDialog } from "@/features/pets";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { swalToast } from "@/lib/swal";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import { businessLineService } from "@/services/businessLine.service";
import type { BusinessLine } from "@/services/businessLine.service";
import { BookingCard } from "./BookingCard";
import {
  MAX_CARDS,
  blankCard,
  cardFromBooking,
  cardToUpdate,
  cardsToEntries,
  duplicateCardKeys,
  longestGroomerMinutes,
  petServiceKey,
  storedPetServiceKeys,
} from "../bookingDraft";
import type { BookingCardDraft } from "../bookingDraft";
import { priceForPet } from "@/utils/serviceVariant";
import type {
  BookingLocation,
  BookingStatus,
  Customer,
  Pet,
  Service,
} from "@/types/api";

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

/** Mirrors NOTES_MAX_LENGTH in booking.model.js. */
const NOTES_MAX_LENGTH = 500;

/**
 * The API field names this form has a place for.
 *
 * Anything else the server refuses on goes to the banner instead, because a
 * field error bound to nothing is an error nobody ever sees. The card fields —
 * `bookings[0].serviceId` on a create, `serviceId` on an edit — all land under
 * the list of cards, as `bookings`.
 */
const PLACEABLE_FIELDS = ["customerId", "bookings", "scheduledAt", "notes"];
const CARD_FIELDS = ["petId", "serviceId", "addonServiceIds", "durationMin"];

/** `bookings[1].petId` → `bookings`; `serviceId` → `bookings`; others as-is. */
function placeOf(field: string): string {
  const base = field.split(/[.[]/)[0];
  return CARD_FIELDS.includes(base) ? "bookings" : base;
}

/**
 * ─── THE STATUS IS THE BUTTON, AND THERE IS NO LONGER A FIELD FOR IT ───────
 *
 * The form had a Status select offering `requested`, `confirmed` and `draft`.
 * Two buttons replaced it on 5 September 2026, and the swap is worth stating
 * because it removes a control rather than adding one.
 *
 * A SELECT ASKED THE WRONG QUESTION. "Which status should this start in" is not
 * something a receptionist writing down a phone call is deciding; what they are
 * deciding is **whether they are finished**. That is what a button answers, and
 * a field that has to be read and understood before every save is a field people
 * leave on whatever it happened to say last.
 *
 * IT WAS ALSO A THIRD PLACE FOR ONE FACT. The status ladder is enforced by the
 * server and offered by the booking's own status menu; a select at creation time
 * was a second door into the same machine — one that could put a booking
 * straight into `confirmed` without anybody at the shop agreeing to it.
 *
 * ─── `confirmed` IS NO LONGER REACHABLE FROM THIS FORM, ON PURPOSE ─────────
 *
 * Saving ASKS for an appointment. Agreeing to it is the shop's separate act, and
 * it has a rung and a button of its own on the booking page ("Confirm
 * booking"). A walk-in standing at the counter is one click further away than
 * before; a booking that confirmed itself was one nobody had checked.
 */
const SAVE_AS: Record<"submit" | "draft", BookingStatus> = {
  submit: "requested",
  draft: "draft",
};

/**
 * Today, in the shop's own clock rather than UTC.
 *
 * `toISOString().slice(0, 10)` is what the rest of this codebase writes, and it
 * is wrong here specifically: west of UTC+7 the UTC date is still yesterday
 * until seven in the morning, so a booking taken at opening time would default
 * to the wrong day. Everywhere else the field is a bookkeeping date somebody
 * reads and corrects; here it is the appointment itself.
 */
function todayValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * The next half hour, as an `<input type="time">` holds it.
 *
 * A DEFAULT RATHER THAN A BLANK, because most bookings taken over the counter
 * are for later the same day and an empty required field is one more thing to
 * fill in while somebody waits. It is a suggestion — the field is editable and
 * nothing rounds it afterwards.
 */
function nextHalfHourValue(): string {
  const at = new Date();
  at.setSeconds(0, 0);
  at.setMinutes(at.getMinutes() <= 30 ? 30 : 60);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/**
 * The two halves of a stored instant, put back into the two fields.
 *
 * THE INVERSE OF `toScheduledAt`, AND IT READS THE LOCAL CLOCK — `getHours`,
 * never `toISOString`. The calendar shipped with exactly this bug: an instant
 * split through UTC lands on the previous day everywhere east of London, so a
 * booking for Thursday 08:00 in Jakarta would open for editing as Wednesday
 * 01:00 and save itself a day early if nobody looked.
 */
function localDateValue(at: Date): string {
  return [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");
}

function localTimeValue(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** What the two fields add up to, as the instant the API stores. */
function toScheduledAt(date: string, time: string): string | null {
  // No `Z`, so this is read as WALL-CLOCK TIME in the browser's zone — which is
  // the shop's. "Ten o'clock" means ten o'clock where the dog is being washed.
  const at = new Date(`${date}T${time}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * WHERE THE WORK HAPPENS. Two options, so a select would be two clicks for a
 * question with a visible answer.
 */
const LOCATION_OPTIONS: { value: BookingLocation; label: string }[] = [
  { value: "in_store", label: "Di toko" },
  { value: "in_home", label: "Di rumah pelanggan" },
];

/**
 * Makes bookings — `/dashboard/booking/new` — and corrects one —
 * `/dashboard/booking/:id/edit`.
 *
 * A PAGE, NOT A DIALOG. Three animals is three cards of several controls each,
 * and a dialog holding that is a form scrolling inside a scrolling page — with
 * the save button and the running total sliding out of reach of the fields they
 * describe.
 *
 * ─── ONE CARD IS ONE BOOKING ───────────────────────────────────────────────
 *
 * A booking is one animal and one main service. Bu Lisa arriving with Mochi and
 * Coco fills in the header once — who, where, when, the trip — and two cards;
 * saving makes two bookings in one group, each with its own number, status and
 * bill. Mochi having a bath and a hotel stay is two cards naming Mochi.
 *
 * WHERE A SAVE LANDS follows from how many bookings it made: one opens that
 * booking; several open the list narrowed to the group, where each is a row.
 *
 * ─── EDITING IS ONE CARD ───────────────────────────────────────────────────
 *
 * `/edit` corrects one booking, so it shows exactly one card and no way to add
 * another. A second animal for the same visit is a new booking.
 *
 * WHY IT IS NOT THE TILL'S TAB. `AddServiceTab` creates a booking too, but for
 * somebody already standing at the counter: it has a customer handed to it, it
 * schedules for `now`, and it feeds the CART, which raises the booking on the
 * server side.
 */
export function BookingForm({ bookingId }: { bookingId?: string } = {}) {
  const router = useRouter();

  /*
    ONE COMPONENT, TWO JOBS — the shape `PetForm` already uses in this repo.
    Taking a booking and correcting one ask for the same things; only the
    request, the wording, and what may still be touched differ.
  */
  const editing = bookingId !== undefined;
  /*
    CANCELLING LANDS WHERE THE WORK CAME FROM. A correction was reached from that
    one booking's page, so that is where somebody expects to be put back.
  */
  const backHref = editing
    ? `/dashboard/booking/${bookingId}`
    : "/dashboard/booking";
  const [loading, setLoading] = useState(bookingId !== undefined);
  /*
    THE (ANIMAL, SERVICE) PAIRS THE STORED BOOKING ALREADY HELD, captured once
    when it loads — empty on a new booking. Since 13 September 2026 a variant can
    be switched off, and the server refuses a NEW line for one but lets a pair
    that was already on the booking through. See `storedPetServiceKeys`.
  */
  const [storedKeys, setStoredKeys] = useState<Set<string>>(new Set());

  /*
    THE BRANCH IS PICKED HERE, NOT INHERITED FROM THE SESSION.

    `currentBranchId` is the TILL's idea — a terminal stands in one shop all day —
    and a booking taken over the phone is not that. The cost of getting it wrong
    was a booking quietly filed to whichever branch the session happened to point
    at, invisible on every screen until somebody reconciles a branch's takings.

    `soleBranch` FILLS IT IN WHEN THERE IS ONLY ONE. One option is not a choice.
  */
  const scope = useBranchScope();
  const [pickedBranch, setPickedBranch] = useState("");
  const branchId = pickedBranch || scope.soleBranch;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  /**
   * ONE CARD PER BOOKING. `bookingDraft.ts` converts between this and what the
   * API takes; nothing else in this file knows both shapes.
   */
  const [cards, setCards] = useState<BookingCardDraft[]>([blankCard()]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [groomers, setGroomers] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >([]);
  /* The clash the server refused, kept so it can be shown and overridden. */
  const [clash, setClash] = useState<string | null>(null);

  const [date, setDate] = useState(todayValue);
  const [time, setTime] = useState(nextHalfHourValue);
  const [notes, setNotes] = useState("");

  /*
    WHERE, AND WHAT TRAVELS. Asked once for everything saved together — a van
    goes to an address, and two of one customer's dogs ride in the same one — and
    written onto each booking, where it can be changed per booking afterwards.
    Both flags are meaningless on a house call and the server forces them off;
    the form simply stops asking.
  */
  const [location, setLocation] = useState<BookingLocation>("in_store");
  const [pickupRequested, setPickupRequested] = useState(false);
  const [deliveryRequested, setDeliveryRequested] = useState(false);
  const [tripAddress, setTripAddress] = useState("");

  const [picking, setPicking] = useState(false);
  const [addingPet, setAddingPet] = useState(false);
  const [petsNonce, setPetsNonce] = useState(0);

  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingPets, setLoadingPets] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /*
    THE BOOKING BEING CORRECTED, when there is one.

    THE OWNER IS FETCHED SEPARATELY. The booking carries `customerName` for
    display, but this form holds a whole `Customer` — the pet loader keys off it,
    and `CustomerSearchDialog` hands back the same shape.
  */
  useEffect(() => {
    if (!bookingId) return;

    let active = true;

    bookingService
      .getById(bookingId)
      .then(async (booking) => {
        const owner = await customerService.getById(booking.customerId);
        if (!active) return;

        const at = new Date(booking.scheduledAt);

        setCustomer(owner);
        /* Billed state is marked on the card itself — see `cardFromBooking`. */
        setCards([cardFromBooking(booking)]);
        setStoredKeys(storedPetServiceKeys(booking));
        setPickedBranch(booking.branchId);
        setNotes(booking.notes ?? "");
        setLocation(booking.location ?? "in_store");
        setPickupRequested(booking.pickupRequested ?? false);
        setDeliveryRequested(booking.deliveryRequested ?? false);
        setTripAddress(booking.tripAddress ?? "");
        setDate(localDateValue(at));
        setTime(localTimeValue(at));
      })
      .catch(() => {
        if (active) setLoadError("Booking tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookingId]);

  /* The catalogue. Only what is still offered — a retired service is not
     something to promise on Thursday. */
  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingServices(true);

    serviceService
      .list({ isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (active) setServices(result.items);
      })
      .catch(() => {
        if (active) {
          setLoadError("Daftar layanan tidak bisa dimuat. Coba lagi.");
        }
      })
      .finally(() => {
        if (active) setLoadingServices(false);
      });

    return () => {
      active = false;
    };
  }, []);

  /*
    THE LINES OF BUSINESS, for the per-card service filter. Best effort and
    silent: the filter is a convenience, and its absence leaves the full
    catalogue on offer rather than an empty one.
  */
  useEffect(() => {
    let active = true;

    businessLineService
      .list({ limit: FETCH_LIMIT })
      .then((result) => {
        if (active) setBusinessLines(result.items);
      })
      .catch(() => {
        if (active) setBusinessLines([]);
      });

    return () => {
      active = false;
    };
  }, []);

  /*
    WHO MAY BE BOOKED ON THE CHOSEN DAY — FR-4 kriteria 4.3.

    RE-ASKED WHEN THE DATE CHANGES, because the answer depends on it: somebody
    who is off every Wednesday is offerable on Thursday.

    BEST EFFORT, AND SILENT WHEN IT FAILS. Reading staff takes a permission a
    receptionist who books all day has no other reason to hold. Assignment is
    optional, the server names an unassigned slot, and the server ALSO refuses a
    groomer who is off — so a missing list costs a convenience, never a rule.
  */
  useEffect(() => {
    if (date === "") return;

    let active = true;

    bookingService
      .availability(date)
      .then((rows) => {
        if (!active) return;
        setGroomers(
          rows.map((row) => ({
            value: row._id,
            label: row.offReason
              ? `${row.fullName} — ${row.offReason}`
              : row.fullName,
            disabled: Boolean(row.offReason),
          })),
        );
      })
      .catch(() => {
        if (active) setGroomers([]);
      });

    return () => {
      active = false;
    };
  }, [date]);

  /* This customer's animals. Re-asked after a quick-add rather than spliced —
     the list is server-ordered, and a local insert would be a second ordering
     rule to keep in step. */
  useEffect(() => {
    if (!customer) {
      return;
    }

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPets(true);

    petService
      .list({ customerId: customer._id, isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setPets(result.items);

        /*
          ONE PET IS STILL THE OVERWHELMING CASE, so the first empty card is
          filled in for them. Only the FIRST and only while it is untouched:
          writing an animal into a card somebody has already chosen for would
          overwrite a decision.
        */
        if (result.items.length === 1) {
          setCards((prev) =>
            prev.length === 1 && prev[0].petId === ""
              ? [{ ...prev[0], petId: result.items[0]._id }]
              : prev,
          );
        }
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
   * THIS CUSTOMER'S ANIMALS, RE-READ — QUIETLY.
   *
   * ─── WHY IT DOES NOT REUSE THE LOADER ABOVE ────────────────────────────────
   *
   * That one sets `loadingPets`, and the render swaps the whole list of cards
   * for a spinner while it is true. Refreshing through it would blank every
   * half-filled card for as long as the request took. So this writes `pets` and
   * touches nothing else; the screen just quietly becomes right.
   *
   * ─── WHY IT IS NEEDED AT ALL ───────────────────────────────────────────────
   *
   * A service priced per variant is quoted from the animal's own species, size
   * and coat, and the card offers a link when one is missing — which opens the
   * pet's page in ANOTHER TAB, because this form holds unsaved state. Without a
   * re-read the booking tab would still hold the pet as it was loaded, and the
   * only way out would be a reload that costs the whole booking.
   *
   * A FAILURE KEEPS WHAT IS ON SCREEN.
   */
  const refreshPets = useCallback(async () => {
    if (!customer) return;

    try {
      const page = await petService.list({
        customerId: customer._id,
        isActive: true,
        limit: FETCH_LIMIT,
      });
      setPets(page.items);
    } catch {
      /* Keep the list we already have — see above. */
    }
  }, [customer]);

  /*
    BACK FROM THE OTHER TAB. `visibilitychange` RATHER THAN `focus`: focus fires
    for a click back into the window from a devtools panel or a dropdown closing,
    which would put a request on the wire for nothing.
  */
  useEffect(() => {
    if (!customer) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshPets();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [customer, refreshPets]);

  function reset() {
    setCustomer(null);
    setPets([]);
    setCards([blankCard()]);
    setDate(todayValue());
    setTime(nextHalfHourValue());
    setNotes("");
    setLoadError(null);
    setFormError(null);
    setFieldErrors({});
  }

  /**
   * Leaves without saving.
   *
   * REFUSED MID-WRITE: navigating away while the request is in flight leaves
   * nobody told whether the booking was made.
   */
  function cancel() {
    if (saving) return;
    reset();
    router.push(backHref);
  }

  /*
    A DIFFERENT OWNER INVALIDATES EVERY ANIMAL ON THE FORM (PRD 2.2).

    The cards' animals are emptied, not kept: they belong to the previous
    customer, and the server would refuse them one at a time. The services and
    the times survive; only the animals were the other person's.

    THE OWNER IS FIXED ONCE THE BOOKING IS BILLED — moving a paid visit to a
    different customer is a refund and a new booking, not an edit.
  */
  function chooseCustomer(next: Customer) {
    setCustomer(next);
    setPets([]);
    setCards((prev) => prev.map((card) => ({ ...card, petId: "" })));
    setFieldErrors({});
  }

  function updateCard(key: string, patch: Partial<BookingCardDraft>) {
    setCards((prev) =>
      prev.map((card) => (card.key === key ? { ...card, ...patch } : card)),
    );
    setFieldErrors({});

    /*
      CHOOSING AN ANIMAL RE-READS IT. The record may have been corrected since
      the list loaded — most likely through this card's own "lengkapi ukuran"
      link. Quietly, so the card being filled in is not replaced by a spinner.
    */
    if (patch.petId) void refreshPets();
  }

  function addCard() {
    setCards((prev) =>
      prev.length >= MAX_CARDS ? prev : [...prev, blankCard()],
    );
    setFieldErrors({});
  }

  function removeCard(key: string) {
    /*
      A BILLED CARD CANNOT LEAVE (PRD 2.12), and the edit form's one card never
      can — this is the guard for a caller reaching the function directly.
    */
    const card = cards.find((entry) => entry.key === key);
    if (editing || card?.locked) return;

    // Never the last one: a save with no bookings in it is not a save.
    setCards((prev) =>
      prev.length === 1 ? prev : prev.filter((entry) => entry.key !== key),
    );
    setFieldErrors({});
  }

  /**
   * Saves.
   *
   * `as` IS WHICH BUTTON WAS PRESSED, and on a create it decides the status
   * outright — see `SAVE_AS`. It is ignored when editing: `PATCH` carries no
   * `status`, because a transition has rules a `$set` cannot express.
   */
  async function save(as: "submit" | "draft") {
    if (saving || !customer) return;

    const scheduledAt = toScheduledAt(date, time);
    if (!scheduledAt) {
      setFieldErrors({ scheduledAt: "Tanggal dan jam belum lengkap." });
      return;
    }

    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    /*
      WHAT THE BOOKINGS SHARE — the header. On a create it is written onto every
      booking of the group; on an edit it is this booking's own.
    */
    const header = {
      branchId,
      /*
        "SAVE IT ANYWAY", and only after somebody has been shown what they are
        overriding. The flag is never sent on a first attempt — a warning nobody
        read is not a decision.
      */
      forceClash: clash !== null,
      customerId: customer._id,
      scheduledAt,
      location,
      /*
        NOT SENT AS FALSE ON A HOUSE CALL — sent as what was asked, and the
        server forces both off for `in_home`. One rule, one place.
      */
      pickupRequested,
      deliveryRequested,
      tripAddress: tripAddress.trim() === "" ? null : tripAddress.trim(),
      notes: notes.trim() === "" ? null : notes.trim(),
    };

    try {
      let destination = backHref;
      let message: string;

      if (editing) {
        const updated = await bookingService.update(bookingId, {
          ...header,
          ...cardToUpdate(cards[0]),
        });
        message = `Booking ${updated.bookingNumber ?? "draf"} diperbarui.`;
      } else {
        const result = await bookingService.create({
          ...header,
          status: SAVE_AS[as],
          bookings: cardsToEntries(cards),
        });
        const made = result.bookings;

        /*
          ONE BOOKING OPENS ITSELF; SEVERAL OPEN THE DAY THEY ARE ON.
          A single booking's page is the next thing anybody does with it. Two or
          more have no one page that is "the" answer — they are one visit, one
          animal each — so Hari Ini opens on their date with every one of them
          in its column. It used to be `?groupId=` on the paged list, which is
          gone (16 September 2026).
        */
        if (made.length === 1) {
          destination = `/dashboard/booking/${made[0]._id}`;
          message = made[0].bookingNumber
            ? `Booking ${made[0].bookingNumber} dibuat.`
            : "Booking dibuat sebagai draf.";
        } else {
          destination = `/dashboard/booking?tanggal=${encodeURIComponent(date)}`;
          message = `${made.length} booking dibuat.`;
        }
      }

      reset();
      router.push(destination);
      router.refresh();

      /*
        THE TOAST GOES LAST, AND OUTSIDE ANYTHING THAT CAN FAIL THE SAVE.

        It used to sit inside the same `try` as the request. A test caught what
        that costs: the toast library threw, the catch turned it into "Terjadi
        kesalahan. Coba lagi.", and a booking that had ALREADY BEEN WRITTEN was
        reported as a failure — sending somebody to make it a second time.
      */
      try {
        swalToast(message);
      } catch {
        /* The page it landed on already shows it. */
      }
    } catch (error) {
      if (error instanceof ApiError) {
        /*
          A 409 HERE IS THE CLASH — the one refusal this form answers by asking
          again rather than by correcting a field. `reason` names the booking it
          collides with, which is what makes "simpan tetap" a decision.
        */
        if (error.status === 409) {
          setClash(error.fullMessage);
          setSaving(false);
          return;
        }

        /*
          A REFUSAL GOES TO THE FIELD IT IS ABOUT, and only to the banner when no
          place on this form can hold it. The server's own field names are
          English and are shown as they come: "petId This pet belongs to a
          different customer" can be acted on, and "Validation failed" cannot.
        */
        const placeable: Record<string, string> = {};
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          const place = placeOf(field);
          if (PLACEABLE_FIELDS.includes(place) && !placeable[place]) {
            placeable[place] = message;
          }
        }

        if (Object.keys(placeable).length > 0) setFieldErrors(placeable);
        else setFormError(error.fullMessage);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  const serviceOf = (serviceId: string) =>
    services.find((service) => service._id === serviceId) ?? null;
  const petOf = (petId: string) => pets.find((pet) => pet._id === petId) ?? null;

  /*
    AN INACTIVE VARIANT THE SERVER WILL REFUSE (13 September 2026) — the
    animal's variant is switched off, and the pair was not already on the stored
    booking. A pair that was is allowed through on an edit.
  */
  const refusedInactive = (petId: string, serviceId: string) =>
    priceForPet(serviceOf(serviceId), petOf(petId)).inactive &&
    !storedKeys.has(petServiceKey(petId, serviceId));

  const idsOf = (card: BookingCardDraft) =>
    [card.serviceId, ...card.addonServiceIds].filter((id) => id !== "");

  /*
    Summed as decimal STRINGS — this is a quote somebody will be charged, and
    `0.1 + 0.2` is why utils/decimal exists.

    PRICED FROM THE ANIMAL, not from the catalogue's headline figure. A price
    that cannot yet be determined contributes nothing rather than a guess — the
    card says why. Nor does a new pair on an inactive variant.
  */
  const total = sumDecimals(
    cards.flatMap((card) =>
      idsOf(card)
        .filter((serviceId) => !refusedInactive(card.petId, serviceId))
        .map(
          (serviceId) =>
            priceForPet(serviceOf(serviceId), petOf(card.petId)).price,
        )
        .filter((price): price is string => Boolean(price)),
    ),
  );

  /** Cards repeating an animal-and-service already on another card (PRD 2.7). */
  const duplicateKeys = duplicateCardKeys(cards);

  /**
   * WHEN THE CUSTOMER GETS THEIR ANIMALS BACK — the longest groomer's workload,
   * never the sum (PRD 2.9). See `longestGroomerMinutes`.
   */
  const longest = longestGroomerMinutes(cards, serviceOf, petOf);

  /** The bookings this save would make — cards with an animal and a service. */
  const bookingCount = cardsToEntries(cards).length;

  const finishesAt =
    longest > 0 && date !== "" && time !== ""
      ? (() => {
          const at = new Date(`${date}T${time}`);
          if (Number.isNaN(at.getTime())) return null;
          at.setMinutes(at.getMinutes() + longest);
          return `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
        })()
      : null;

  /*
    WHAT IS STILL MISSING, in the order the form asks for it — so the disabled
    button can say which field rather than leaving somebody hunting.
  */
  const incomplete = cards.some((card) => !card.petId || !card.serviceId);

  /*
    A PRICE THE FORM CANNOT WORK OUT IS A SAVE THE SERVER WILL REFUSE — a service
    priced by size, on an animal whose size nobody recorded.
  */
  const unpriceable = cards.find((card) =>
    idsOf(card).some(
      (serviceId) =>
        priceForPet(serviceOf(serviceId), petOf(card.petId)).missingAxis !==
        null,
    ),
  );

  /*
    A NEW PAIR ON A SWITCHED-OFF VARIANT (13 September 2026) — its own sentence
    rather than `unpriceable`'s: the animal's data is complete, and telling
    somebody to fix the pet would send them to a form with nothing wrong on it.
  */
  const inactiveLine = (() => {
    for (const card of cards) {
      const serviceId = idsOf(card).find((id) =>
        refusedInactive(card.petId, id),
      );
      if (serviceId) {
        return { service: serviceOf(serviceId), pet: petOf(card.petId) };
      }
    }
    return null;
  })();

  /*
    AN ANIMAL WITH NO SIZE CANNOT BE BOOKED AT ALL — since 13 September 2026
    commission is read against it and the server refuses the save.
  */
  const sizeless = cards
    .map((card) => petOf(card.petId))
    .find((pet): pet is Pet => pet !== null && !pet.size);

  const ownerFixed = cards.some((card) => card.locked);

  const blockedReason = !branchId
    ? "Cabang belum dipilih."
    : !customer
      ? "Pelanggan belum dipilih."
      : incomplete
        ? "Setiap booking harus punya hewan dan layanan."
        : duplicateKeys.size > 0
          ? "Ada hewan dengan layanan yang sama di dua kartu."
          : sizeless
            ? `Ukuran ${sizeless.name} belum diisi.`
            : unpriceable
              ? `Data ${petOf(unpriceable.petId)?.name ?? "hewan"} belum lengkap, harganya belum bisa dihitung.`
              : inactiveLine
                ? `Varian ${inactiveLine.service?.name ?? "layanan"} untuk ${inactiveLine.pet?.name ?? "hewan ini"} sedang nonaktif — pilih layanan lain atau aktifkan variannya di katalog.`
                : date === "" || time === ""
                  ? "Tanggal dan jamnya belum lengkap."
                  : null;

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save("submit");
        }}
        noValidate
        className="flex flex-col gap-4"
      >
        {/*
          THE BAR CARRIES THE TOTAL AND THE FINISH TIME as its `meta`, which is
          where read-only identity belongs (§16) — they stay with the action they
          qualify rather than scrolling away from the cards they describe.
        */}
        <FormActionBar
          title={editing ? "Ubah booking" : "Booking baru"}
          meta={
            <span className="flex flex-wrap gap-x-4 tabular-nums">
              <span>Total {formatMoney(total)}</span>
              {finishesAt && <span>Selesai sekitar {finishesAt}</span>}
              {!editing && bookingCount > 1 && (
                <span>{bookingCount} booking</span>
              )}
            </span>
          }
          submitLabel="Simpan booking"
          submitting={saving}
          disabled={blockedReason !== null || loading}
          blockedReason={blockedReason}
          onCancel={cancel}
          /*
            ─── "SIMPAN SEBAGAI DRAF", ON A NEW BOOKING ONLY ──────────────────

            It answers a different question from Simpan: not "is this right" but
            "am I finished". A phone rings mid-booking, a customer is not sure
            which day — a draft is where that goes.

            IT IS NOT DISABLED BY `blockedReason`, and Simpan is. A draft is
            exactly the thing you save when the required fields are NOT answered,
            so gating it on the same rule would make it useless in the one
            situation it exists for. The server still refuses a booking with no
            animal on it.

            NOT OFFERED WHEN EDITING. `PATCH` carries no status: pushing a live
            booking back down to a draft is a move the ladder does not have.
          */
          extra={
            editing ? null : (
              <Button
                type="button"
                variant="secondary"
                disabled={saving || loading || !customer}
                onClick={() => void save("draft")}
              >
                Simpan sebagai draf
              </Button>
            )
          }
        />

        {loadError && <Alert variant="error">{loadError}</Alert>}
        {formError && <Alert variant="error">{formError}</Alert>}

        {/*
          NOBODY IS MARKED AS A GROOMER — a dead end with a signpost. An empty
          dropdown with no explanation looks broken, and the fix — one checkbox on
          a staff page — is nowhere in sight. NOT A BLOCKER: "Belum ditentukan" is
          a real state (FR-3).
        */}
        {!loadingServices && groomers.length === 0 && (
          <Alert variant="warning">
            Belum ada staf yang ditandai sebagai <strong>groomer</strong>. Buka
            Master Data › Staf, buka orangnya, lalu centang &ldquo;Groomer&rdquo;.
            Bookingnya tetap bisa dibuat dengan groomer &ldquo;Belum
            ditentukan&rdquo;.
          </Alert>
        )}

        {/*
          WHAT SAVING WILL DO TO THE PRICE, said before it happens. An edit
          RE-SNAPSHOTS an unbilled service at today's catalogue rate — the
          server's rule, and the deliberate one: changing what is being done is a
          new quote.
        */}
        {editing && (
          <Alert variant="warning">
            Menyimpan perubahan akan memakai harga layanan hari ini kalau booking
            ini belum ditagih.
          </Alert>
        )}

        {/*
          THE CLASH, SHOWN RATHER THAN REFUSED — FR-4 kriteria 4.5/4.6. Two small
          dogs at ten really can be handled together sometimes, and the shop is
          the only one who knows. SAVING AGAIN IS THE OVERRIDE; the SERVER still
          refuses it without `bookings:overrideClash`.
        */}
        {clash && (
          <Alert variant="warning">
            {clash} — tekan Simpan lagi kalau memang mau dijadwalkan bersamaan.
          </Alert>
        )}

        {/*
          §16 field order: kapan, lalu di mana, lalu dengan siapa, lalu isinya —
          and each group is a CARD rather than a run of loose fields.
        */}
        <Card title="Jadwal & lokasi">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Tanggal"
              name="booking-date"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setFieldErrors({});
              }}
              error={fieldErrors.scheduledAt}
              disabled={saving}
              required
            />
            <TextField
              label="Jam"
              name="booking-time"
              type="time"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setFieldErrors({});
              }}
              disabled={saving}
              required
            />

            {/* HIDDEN WHEN THERE IS ONLY ONE BRANCH — `soleBranch` answered it. */}
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
            {/*
              WHERE THE WORK HAPPENS. IT NARROWS THE CATALOGUE: a service that
              cannot be done at home is refused by the server for an `in_home`
              booking, so the answer here changes what the cards below may hold.
            */}
            <SelectField
              label="Lokasi layanan"
              value={location}
              onChange={(next) => setLocation(next as BookingLocation)}
              options={LOCATION_OPTIONS}
              disabled={saving}
              hint="Layanan yang tidak melayani di rumah tidak bisa dipilih untuk booking ke rumah."
              required
            />
          </div>
        </Card>

        {/*
          ANTAR-JEMPUT — only when the animal has to reach the salon. THE
          QUESTION DISAPPEARS ON A HOUSE CALL rather than being asked and ignored.
        */}
        {location === "in_store" && (
          <Card
            title="Antar-jemput"
            description={
              editing
                ? "Hanya untuk booking ini."
                : "Satu perjalanan untuk semua booking yang disimpan bersama. Setelah tersimpan bisa diubah per booking."
            }
          >
            <div className="flex flex-col gap-3">
              <CheckRowGroup>
                <CheckRow
                  label="Dijemput"
                  description="Hewannya diambil dari alamat pelanggan."
                  checked={pickupRequested}
                  disabled={saving}
                  onCheckedChange={setPickupRequested}
                />
                <CheckRow
                  label="Diantar pulang"
                  description="Setelah selesai, hewannya diantar kembali."
                  checked={deliveryRequested}
                  disabled={saving}
                  onCheckedChange={setDeliveryRequested}
                />
              </CheckRowGroup>

              {(pickupRequested || deliveryRequested) && (
                <TextField
                  label="Alamat jemput/antar"
                  name="booking-trip-address"
                  value={tripAddress}
                  onChange={(event) => setTripAddress(event.target.value)}
                  maxLength={300}
                  placeholder="Kosongkan kalau sama dengan alamat pelanggan"
                  hint="Kosong berarti pakai alamat pelanggan yang tersimpan."
                  disabled={saving}
                />
              )}
            </div>
          </Card>
        )}

        {/*
          THE POS PICKER, not a `FilterSelect`. For pelanggan the searchable
          picker is `CustomerSearchDialog`: it searches ON THE SERVER, so the shop
          with four hundred customers can find the four hundredth, and it
          registers a new one without leaving the form.
        */}
        <Card title="Pelanggan">
          <div className="flex flex-col gap-1.5">
            <Label>
              Pelanggan<span className="text-danger"> *</span>
            </Label>
            {customer ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-primary">
                    <UserRound className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {customer.name}
                    </span>
                    {customer.phone && (
                      <span className="block truncate text-xs tabular-nums text-muted">
                        {customer.phone}
                      </span>
                    )}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={saving || ownerFixed}
                  onClick={() => setPicking(true)}
                >
                  Ganti
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="h-11 justify-start"
                disabled={saving || ownerFixed}
                onClick={() => setPicking(true)}
              >
                <UserRound className="size-4" />
                Pilih pelanggan
              </Button>
            )}
            {ownerFixed && (
              <p className="text-xs text-muted">
                Pemilik tidak bisa diganti karena booking ini sudah ditagih.
              </p>
            )}
            {/* Changing the owner of a saved booking takes it out of its group. */}
            {editing && !ownerFixed && (
              <p className="text-xs text-muted">
                Mengganti pelanggan melepas booking ini dari kunjungannya.
              </p>
            )}
            {fieldErrors.customerId && (
              <p role="alert" className="text-xs font-semibold text-danger">
                {fieldErrors.customerId}
              </p>
            )}
          </div>
        </Card>

        {/*
          THE BOOKINGS THIS SAVE MAKES — one card each.

          NOT WRAPPED IN A CARD, unlike the groups above it: each booking's card
          is the white card here, and white cards inside another white card leave
          the middle level doing nothing — a border around a border.
        */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">
              {editing ? "Hewan & layanan" : "Booking dalam kunjungan ini"}
              <span className="text-danger"> *</span>
            </h2>
            {!editing && (
              <span className="text-xs tabular-nums text-muted">
                {cards.length} dari {MAX_CARDS} kartu
              </span>
            )}
          </div>
          <p className="text-sm text-muted">
            {editing
              ? "Satu booking untuk satu hewan dan satu layanan utama. Add-on, catatan dan barang bawaannya ada di dalam kartunya."
              : "Satu kartu = satu booking: satu hewan dengan satu layanan utama. Hewan yang sama boleh ada di dua kartu kalau layanannya berbeda."}
          </p>

          {!customer ? (
            <p className="text-sm text-muted">
              Pilih pelanggannya dulu — daftar hewan mengikuti pemiliknya.
            </p>
          ) : loading || loadingPets || loadingServices ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Memuat hewan dan layanan…
            </div>
          ) : pets.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted">
                {customer.name} belum punya hewan terdaftar.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => setAddingPet(true)}
              >
                <Plus className="size-4" />
                Daftarkan hewan baru
              </Button>
            </div>
          ) : services.length === 0 ? (
            <p className="text-sm text-muted">
              Belum ada layanan yang bisa dijadwalkan. Tambahkan dulu di Master
              Data → Layanan.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {cards.map((card, index) => (
                  <BookingCard
                    key={card.key}
                    card={card}
                    index={index}
                    pets={pets}
                    services={services}
                    businessLines={businessLines}
                    groomers={groomers}
                    disabled={saving}
                    removable={!editing && cards.length > 1}
                    duplicate={duplicateKeys.has(card.key)}
                    storedKeys={storedKeys}
                    onChange={(patch) => updateCard(card.key, patch)}
                    onRemove={() => removeCard(card.key)}
                  />
                ))}
              </ul>

              <div className="flex flex-wrap gap-2">
                {/*
                  NO SECOND CARD ON AN EDIT. The page corrects ONE booking; a
                  second animal for the same visit is a booking of its own.
                */}
                {!editing && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={saving || cards.length >= MAX_CARDS}
                    onClick={addCard}
                  >
                    <Plus className="size-4" />
                    Tambah booking
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => setAddingPet(true)}
                >
                  Daftarkan hewan baru
                </Button>
              </div>
            </>
          )}

          {/*
            The server's own refusals about the cards — a pet that belongs to
            somebody else, a service that no longer exists — land here.
          */}
          {fieldErrors.bookings && (
            <p role="alert" className="text-xs font-semibold text-danger">
              {fieldErrors.bookings}
            </p>
          )}
        </div>

        <Card title="Catatan">
          {/*
            §16: Catatan is always last — and this one is about the VISIT. Anything
            about one animal belongs on its card, where the person reading it is
            already looking.
          */}
          <TextareaField
            label="Catatan"
            name="booking-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={NOTES_MAX_LENGTH}
            placeholder="mis. datang agak telat, minta ditunggu"
            error={fieldErrors.notes}
            disabled={saving}
          />
        </Card>
      </form>

      {/*
        ONE DIALOG, NOT TWO — `CustomerSearchDialog` hosts the quick-add itself,
        so somebody who discovers the customer does not exist registers them
        without losing the half-filled booking behind.
      */}
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
          onCreated={(pet) => {
            setAddingPet(false);
            setPetsNonce((n) => n + 1);

            /*
              THE NEW ANIMAL GOES INTO THE FIRST EMPTY CARD, or onto a card of
              its own when every card is spoken for — never onto a second card
              of an edit, which corrects one booking.
            */
            setCards((prev) => {
              const empty = prev.findIndex((card) => card.petId === "");

              if (empty !== -1) {
                return prev.map((card, index) =>
                  index === empty ? { ...card, petId: pet._id } : card,
                );
              }

              return editing || prev.length >= MAX_CARDS
                ? prev
                : [...prev, blankCard(pet._id)];
            });
          }}
        />
      )}
    </>
  );
}
