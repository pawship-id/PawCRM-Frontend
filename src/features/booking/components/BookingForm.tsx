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
import { BookingPetGroupCard } from "./BookingPetGroupCard";
import {
  blankGroup,
  duplicateServiceKeys,
  groupsFromBooking,
  groupsToBelongings,
  groupsToItems,
  longestGroomerMinutes,
} from "../bookingDraft";
import type { PetGroupDraft } from "../bookingDraft";
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

/** Mirrors MAX_ITEMS in booking.model.js — the server refuses the forty-first. */
const MAX_ITEMS = 40;

/** Mirrors NOTES_MAX_LENGTH in booking.model.js. */
const NOTES_MAX_LENGTH = 500;


/**
 * The API field names this form has a box for.
 *
 * Anything else the server refuses on — `branchId`, which is not on this form at
 * all — goes to the banner instead, because a field error bound to nothing is an
 * error nobody ever sees.
 */
const PLACEABLE_FIELDS = ["customerId", "items", "scheduledAt", "notes"];

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
 * it has a rung and a button of its own on the booking page ("Konfirmasi
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
 * question with a visible answer — the same reasoning that keeps the status
 * field a select and not a dialog.
 */
const LOCATION_OPTIONS: { value: BookingLocation; label: string }[] = [
  { value: "in_store", label: "Di toko" },
  { value: "in_home", label: "Di rumah pelanggan" },
];

/**
 * Makes a booking — `/dashboard/booking/new`.
 *
 * A PAGE, NOT A DIALOG, AND IT USED TO BE ONE. The dialog was the right size
 * while a booking was six fields over a checklist: ui-rules §9 allows a raw
 * dialog when the body needs a form, and keeping the day sheet on screen behind
 * it is genuinely useful while agreeing a time on the phone.
 *
 * MULTI-PET IS WHAT OUTGREW IT. A visit with three animals is three cards of
 * five controls each, and a dialog holding that is a form scrolling inside a
 * scrolling page — with the save button and the running total sliding out of
 * reach of the fields they describe. A page has room, an address somebody can be
 * sent to, and a back button that means the same thing every time.
 *
 * WHY IT IS NOT THE TILL'S TAB. `AddServiceTab` creates a booking too, but for
 * somebody already standing at the counter: it has a customer handed to it, it
 * schedules for `now`, and it opens `confirmed` because there is nothing left to
 * confirm. A booking taken over the phone for Thursday needs the three things
 * that tab has no reason to ask — WHO, WHEN, and whether it is settled.
 *
 * ONE BOOKING IS ONE VISIT, AND A VISIT MAY BRING SEVERAL ANIMALS (PCR-041).
 * Bu Lisa arrives with Mochi and Coco: one form, one booking, one number, one
 * bill. A header for what the whole visit shares — who, when — and a card per
 * animal for what differs: its service, its groomer, how long it takes, and
 * anything special about it today.
 *
 * IT DOES NOT SHARE A COMPONENT WITH THE TILL'S `AddServiceTab`, and the plan
 * expected it would. That tab never called this path: it feeds the CART, which
 * raises the booking on the server side.
 */
export function BookingForm({ bookingId }: { bookingId?: string } = {}) {
  const router = useRouter();

  /*
    ONE COMPONENT, TWO JOBS — the shape `PetForm` already uses in this repo.
    Taking a booking and correcting one ask for the same eleven things; only the
    request, the wording, and what may still be touched differ. Two components
    would be two places for the "selesai sekitar" rule to drift.
  */
  const editing = bookingId !== undefined;
  /*
    SAVING AND CANCELLING BOTH LAND WHERE THE WORK CAME FROM. A correction was
    reached from that one booking's page, so that is where somebody expects to
    be put back — and it is the page that shows whether the correction took.
  */
  const backHref = editing ? `/dashboard/booking/${bookingId}` : "/dashboard/booking";
  const [loading, setLoading] = useState(bookingId !== undefined);
  /*
    THE ROWS THAT ARE ALREADY BILLED, by their local key. They are locked rather
    than hidden: somebody correcting a visit has to SEE the grooming that was
    paid for, or the total on screen stops matching the total on the bill.
  */
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());

  /*
    THE BRANCH IS PICKED HERE, NOT INHERITED FROM THE SESSION.

    This form used to lean on `session.currentBranchId` and let the server fall
    back to it — which reads fine in isolation and is the wrong pattern for this
    app. Every other hand-typed document asks for its branch on the form:
    `InvoiceCreateForm`, `ReceiptForm`, the stock forms. `currentBranchId` is the
    TILL's idea — a terminal stands in one shop all day — and a booking taken
    over the phone is not that.

    THE COST OF GETTING IT WRONG was not a crash. It was a booking quietly filed
    to whichever branch the session happened to point at, which is invisible on
    every screen until somebody reconciles a branch's takings.

    `soleBranch` FILLS IT IN WHEN THERE IS ONLY ONE. One option is not a choice,
    and a shop with a single branch should not open a dropdown to reach the field
    below.
  */
  const scope = useBranchScope();
  const [pickedBranch, setPickedBranch] = useState("");
  const branchId = pickedBranch || scope.soleBranch;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  /**
   * ONE CARD PER ANIMAL, with its services nested under it — the shape the
   * receptionist's questions run in. `bookingDraft.ts` converts between this and
   * the flat rows the API stores; nothing else in this file knows both shapes.
   */
  const [groups, setGroups] = useState<PetGroupDraft[]>([blankGroup()]);
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
    WHERE, AND WHAT TRAVELS. The trip is one per VISIT rather than per animal — a
    van goes to an address, and two of one customer's dogs ride in the same one.
    Both flags are meaningless on a house call and the server forces them off; the
    form simply stops asking, so nobody answers a question that will be discarded.
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
    and `CustomerSearchDialog` hands back the same shape. Reconstructing one from
    a name would give the pet loader an object with no id.

    A ROW THAT IS ALREADY BILLED IS RECORDED AS LOCKED HERE, at the only moment
    the server's answer is in hand. `pulledToCartAt` and `pulledToInvoiceAt` are
    not on the draft the cards edit, and putting them there would invite some
    later screen to decide billing state for itself.
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
        /*
          ADD-ONS ARE FOLDED BACK UNDER THEIR PARENT here, and billed lines are
          marked on the draft itself rather than in a parallel set — see
          `groupsFromBooking`.
        */
        const loaded = groupsFromBooking(booking);

        setCustomer(owner);
        setGroups(loaded);
        setLockedKeys(
          new Set(
            loaded.flatMap((group) =>
              group.services.filter((line) => line.locked).map((line) => line.key),
            ),
          ),
        );
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

  /* The catalogue, once the dialog is open. Only what is still offered — a
     retired service is not something to promise on Thursday. */
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
    THE LINES OF BUSINESS, for the per-animal service filter. Best effort and
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
    The staff who might do the work — BEST EFFORT, and silent when it fails.

    Reading /api/users takes the `users read` permission, which a receptionist
    who books all day has no other reason to hold. A red banner over a working
    form would be the wrong answer to that: assignment is optional, the server
    names an unassigned slot "Belum ditentukan", and a booking with nobody on it
    yet is the ordinary case anyway. So the selects simply do not appear.
  */
  /*
    WHO MAY BE BOOKED ON THE CHOSEN DAY — FR-4 kriteria 4.3.

    RE-ASKED WHEN THE DATE CHANGES, because the answer depends on it: somebody
    who is off every Wednesday is offerable on Thursday, and a list fetched once
    on mount would be wrong the moment the receptionist moves the appointment.

    BEST EFFORT, AND SILENT WHEN IT FAILS. Reading staff takes a permission a
    receptionist who books all day has no other reason to hold. A red banner over
    a working form would be the wrong answer: assignment is optional, the server
    names an unassigned slot, and the server ALSO refuses a groomer who is off —
    so a missing list costs a convenience, never a rule.
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
          setGroups((prev) =>
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
   * That one sets `loadingPets`, and the render swaps the whole list of animal
   * cards for a spinner while it is true. Refreshing through it would blank
   * every half-filled card — the services ticked, the notes typed — for as long
   * as the request took, on a form somebody is in the middle of. So this writes
   * `pets` and touches nothing else; the screen just quietly becomes right.
   *
   * ─── WHY IT IS NEEDED AT ALL ───────────────────────────────────────────────
   *
   * A service priced per variant is quoted from the animal's own species, size
   * and coat, and the card says so and offers a link when one is missing — which
   * opens the pet's page in ANOTHER TAB, because this form holds unsaved state.
   * Fill the coat length in there and the booking tab is still holding the pet
   * as it was loaded: the price stays unquotable and Simpan stays disabled, with
   * the only way out being a reload that costs the whole booking.
   *
   * A FAILURE KEEPS WHAT IS ON SCREEN. This is a refresh of something already
   * shown, so the honest answer to a dropped request is to leave the last good
   * answer in place rather than empty the picker somebody is using.
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
    BACK FROM THE OTHER TAB, and this is the case the feature exists for.

    Picking an animal re-reads it too (see `updateGroup`), but that only helps
    when the SELECTION changes — and the animal whose coat length was just
    filled in is already selected, so choosing it again fires nothing. What
    actually happens is a tab switch, so that is what this listens for.

    `visibilitychange` RATHER THAN `focus`: focus fires for a click back into the
    window from a devtools panel, an alert, or a dropdown closing, which would
    put a request on the wire for nothing. Becoming visible is the event that
    means "somebody has come back to this".
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
    setGroups([blankGroup()]);
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
   * REFUSED MID-WRITE, the same rule the dialog kept: navigating away while the
   * request is in flight leaves nobody told whether the booking was made.
   */
  function cancel() {
    if (saving) return;
    reset();
    router.push(backHref);
  }

  /**
   * A different owner invalidates every animal on the form (PRD 2.2).
   *
   * THE CARDS ARE EMPTIED, not kept. Their animals belong to the previous
   * customer, and the server would refuse them one at a time — "Bella does not
   * belong to Ibu Rina" — which is a correct answer to a question nobody meant
   * to ask. The services and the times survive; only the animals were the other
   * person's.
   */
  /*
    THE OWNER IS FIXED ONCE ANY OF THE VISIT IS BILLED.

    Changing the customer empties every card's animal (PRD 2.2) — which for a
    billed row would send an empty `petId` for grooming the server will not let
    go of, and the save would fail on a field nobody touched. Moving a paid visit
    to a different customer is a refund and a new booking, not an edit.
  */
  function chooseCustomer(next: Customer) {
    setCustomer(next);
    setPets([]);
    setGroups((prev) => prev.map((group) => ({ ...group, petId: "" })));
    setFieldErrors({});
  }

  function updateGroup(key: string, patch: Partial<PetGroupDraft>) {
    setGroups((prev) =>
      prev.map((group) => (group.key === key ? { ...group, ...patch } : group)),
    );
    setFieldErrors({});

    /*
      CHOOSING AN ANIMAL RE-READS IT. The list was loaded when the customer was
      picked, and the record may have been corrected since — most likely by the
      person who just followed this card's own "lengkapi ukuran" link. Quietly,
      so the card being filled in is not replaced by a spinner.
    */
    if (patch.petId) void refreshPets();
  }

  function addGroup() {
    setGroups((prev) => [...prev, blankGroup()]);
    setFieldErrors({});
  }

  function removeGroup(key: string) {
    /*
      A CARD HOLDING BILLED WORK CANNOT LEAVE (PRD 2.12). The server refuses it
      with a 409 and the card gives it no remove button — this is the third
      guard, for the case where some future caller reaches the function directly.
    */
    const group = groups.find((entry) => entry.key === key);
    if (group?.services.some((line) => line.locked)) return;

    // Never the last one: a visit with no animals is not a visit (PRD 2.10).
    setGroups((prev) =>
      prev.length === 1 ? prev : prev.filter((entry) => entry.key !== key),
    );
    setFieldErrors({});
  }

  /**
   * Saves the booking.
   *
   * `as` IS WHICH BUTTON WAS PRESSED, and on a create it decides the status
   * outright — see `SAVE_AS`. "Simpan sebagai draf" means draft whatever else is
   * on the form, because a draft is the answer to "I am not finished", and a
   * half-filled form is exactly when somebody presses it.
   *
   * IT IS IGNORED WHEN EDITING. `PATCH` carries no `status` at all: a transition
   * has rules a `$set` cannot express, so it moves through its own route. An
   * existing draft stays a draft, and is promoted from the booking's own status
   * menu.
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

    try {
      const payload = {
        branchId,
        /*
          "SAVE IT ANYWAY", and only after somebody has been shown what they are
          overriding. The flag is never sent on a first attempt — a warning
          nobody read is not a decision.
        */
        forceClash: clash !== null,
        customerId: customer._id,
        /*
          THE CARDS FLATTENED BACK INTO ROWS — add-ons ride on their parent as
          `addonServiceIds` and the server expands them into rows of their own.
          See `bookingDraft.ts`; this file deliberately knows only one shape.
        */
        items: groupsToItems(groups),
        belongings: groupsToBelongings(groups),
        scheduledAt,
        location,
        /*
          NOT SENT AS FALSE ON A HOUSE CALL — sent as what was asked, and the
          server forces both off for `in_home`. One rule, one place; mirroring
          the forcing here would be a second copy to keep in step.
        */
        pickupRequested,
        deliveryRequested,
        tripAddress: tripAddress.trim() === "" ? null : tripAddress.trim(),
        notes: notes.trim() === "" ? null : notes.trim(),
      };

      /*
        `status` GOES ONLY WITH A NEW BOOKING. PATCH has no `status` field at
        all: a transition has rules a `$set` cannot express, so it moves through
        its own route. Sending it here would be rejected by the schema, and the
        rejection would be right.
      */
      const booking = editing
        ? await bookingService.update(bookingId, payload)
        : await bookingService.create({ ...payload, status: SAVE_AS[as] });

      /*
        BACK TO THE LIST, AND THE LIST RE-ASKS THE SERVER — `router.refresh()`
        rather than a row spliced in locally. The server sorts by `scheduledAt`
        and pages the result, so a booking made for next month belongs on a page
        the list is not showing; putting it at the top would be a lie about where
        it will be after the next reload.
      */
      reset();
      router.push(backHref);
      router.refresh();

      /*
        THE TOAST GOES LAST, AND OUTSIDE ANYTHING THAT CAN FAIL THE SAVE.

        It used to sit above these three lines, inside the same `try`. A test
        caught what that costs: the toast library threw, the catch below turned
        it into "Terjadi kesalahan. Coba lagi.", and the booking that had ALREADY
        BEEN WRITTEN was reported as a failure — sending somebody to make it a
        second time.

        Chrome must never be able to fail a save. Its own failure is swallowed
        here for the same reason: a booking that saved and could not announce
        itself is still a booking that saved.
      */
      try {
        swalToast(
          editing
            ? `Booking ${booking.bookingNumber ?? "draf"} diperbarui.`
            : booking.bookingNumber
              ? `Booking ${booking.bookingNumber} dibuat.`
              : "Booking dibuat sebagai draf.",
        );
      } catch {
        /* The list behind already shows it. */
      }
    } catch (error) {
      if (error instanceof ApiError) {
        /*
          A REFUSAL GOES TO THE FIELD IT IS ABOUT, and only to the banner when
          no field on this form can hold it — a missing branch, or a 409. Saying
          it in both places at once reads as two problems.

          The server's own field names are English and are shown as they come:
          "petId This pet belongs to a different customer" can be acted on, and
          "Validation failed" cannot. See ApiError.fullMessage.
        */
        /*
          A 409 HERE IS THE CLASH — the one refusal this form answers by asking
          again rather than by correcting a field. `reason` names the booking it
          collides with, which is what makes "simpan tetap" a decision instead of
          a shrug.
        */
        if (error.status === 409) {
          setClash(error.fullMessage);
          setSaving(false);
          return;
        }

        const placeable = Object.fromEntries(
          Object.entries(error.fieldErrors).filter(([field]) =>
            PLACEABLE_FIELDS.includes(field),
          ),
        );

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
    Summed as decimal STRINGS — this is a quote somebody will be charged, and
    `0.1 + 0.2` is why utils/decimal exists.

    PRICED FROM THE ANIMAL, not from the catalogue's headline figure: a service
    that varies by size costs what THIS dog's size says it costs. A line whose
    price cannot yet be determined contributes nothing rather than a guess — the
    card says why, and the save is refused by the server until it can.
  */
  const total = sumDecimals(
    groups.flatMap((group) =>
      group.services.flatMap((line) =>
        [line.serviceId, ...line.addonServiceIds]
          .map(
            (serviceId) =>
              priceForPet(serviceOf(serviceId), petOf(group.petId)).price,
          )
          .filter((price): price is string => Boolean(price)),
      ),
    ),
  );

  /** Lines repeating an animal-and-service already on the booking (PRD 2.7). */
  const duplicateKeys = duplicateServiceKeys(groups);

  /**
   * WHEN THE CUSTOMER GETS THEIR ANIMALS BACK — the longest groomer's workload,
   * never the sum (PRD 2.9). An add-on's minutes count towards the groomer doing
   * it. See `longestGroomerMinutes`; the stored answer is the server's.
   */
  const longest = longestGroomerMinutes(groups, serviceOf);

  /** Distinct animals — the same number the server stores as `petCount`. */
  const petCount = new Set(
    groups.map((group) => group.petId).filter((petId) => petId !== ""),
  ).size;

  /** Rows the API will receive — add-ons included, which is what it counts. */
  const rowCount = groupsToItems(groups).reduce(
    (count, item) => count + 1 + (item.addonServiceIds?.length ?? 0),
    0,
  );

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
    button can say which field rather than leaving somebody hunting. A branch
    comes first because it is not on this form at all: the server books the
    booking to the session's branch, and a user who reaches every branch signs in
    pointed at none of them.
  */
  const incomplete = groups.find(
    (group) =>
      !group.petId ||
      group.services.length === 0 ||
      group.services.some((line) => !line.serviceId),
  );

  /*
    A PRICE THE FORM CANNOT WORK OUT IS A SAVE THE SERVER WILL REFUSE — a service
    priced by size, on an animal whose size nobody recorded. Caught here so the
    button says which animal rather than letting somebody press Simpan and read
    it off a banner.
  */
  const unpriceable = groups.find((group) =>
    group.services.some((line) =>
      [line.serviceId, ...line.addonServiceIds]
        .filter((serviceId) => serviceId !== "")
        .some(
          (serviceId) =>
            priceForPet(serviceOf(serviceId), petOf(group.petId)).missingAxis !==
            null,
        ),
    ),
  );

  const ownerFixed = lockedKeys.size > 0;

  const blockedReason = !branchId
    ? "Cabang belum dipilih."
    : !customer
      ? "Pelanggan belum dipilih."
      : incomplete
        ? "Setiap hewan harus punya layanan."
        : duplicateKeys.size > 0
          ? "Ada hewan dengan layanan yang sama dua kali."
          : unpriceable
            ? `Data ${petOf(unpriceable.petId)?.name ?? "hewan"} belum lengkap, harganya belum bisa dihitung.`
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
          where read-only identity belongs (§16). In the dialog they sat in the
          footer beside the buttons and scrolled away from the cards they
          describe; here they stay with the action they qualify.
        */}
        <FormActionBar
          title={editing ? "Ubah booking" : "Booking baru"}
          meta={
            <span className="flex flex-wrap gap-x-4 tabular-nums">
              <span>Total {formatMoney(total)}</span>
              {finishesAt && <span>Selesai sekitar {finishesAt}</span>}
              <span>
                {rowCount} baris
                {petCount > 1 ? ` · ${petCount} hewan` : ""}
              </span>
            </span>
          }
          submitLabel={editing ? "Simpan perubahan" : "Simpan booking"}
          submitting={saving}
          disabled={blockedReason !== null || loading}
          blockedReason={blockedReason}
          onCancel={cancel}
          /*
            ─── "SIMPAN SEBAGAI DRAF", ON A NEW BOOKING ONLY ──────────────────

            It answers a different question from Simpan: not "is this right" but
            "am I finished". A phone rings mid-booking, a customer is not sure
            which day — a draft is where that goes, and without a button for it
            the only options were to guess or to lose the form.

            IT SAVES A DRAFT WHATEVER THE FORM SAYS, which is the point: somebody
            pressing it is telling you they have not finished.

            IT IS NOT DISABLED BY `blockedReason`, and Simpan is. The bar greys
            Simpan out until the required fields are answered; a draft is exactly
            the thing you save when they are NOT, so gating it on the same rule
            would make it useless in the one situation it exists for. The server
            still refuses a booking with no animal on it — a draft is unfinished,
            not unfounded — so the button is off only while nothing could be sent
            at all.

            NOT OFFERED WHEN EDITING. `PATCH` carries no status: pushing a live
            booking back down to a draft is a move the ladder does not have, and
            a button that looked like it did would be refused every time.
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
              THE CLASH, SHOWN RATHER THAN REFUSED — FR-4 kriteria 4.5/4.6.

              Two small dogs at ten really can be handled together sometimes, and
              the shop is the only one who knows. A system that forbade it would
              be beaten in the way that costs most: the booking gets written on
              paper, and the day sheet stops being true.

              SAVING AGAIN IS THE OVERRIDE, and it is only offered after somebody
              has been shown what they are overriding — a warning nobody read is
              not a decision. The SERVER still refuses it without
              `bookings:overrideClash`, so this is a courtesy, never the gate.
            */}
            {/*
              WHAT SAVING WILL DO TO THE PRICES, said before it happens.

              An edit RE-SNAPSHOTS every row at today's catalogue rate — the
              server's rule, and the deliberate one: changing what is being done
              is a new quote, and half at Monday's price with half at Wednesday's
              produces a total nobody can explain to the customer. The cost lands
              on a booking taken weeks ago and corrected after a price rise, so it
              is said here rather than discovered on the bill.
            */}
            {/*
              NOBODY IS MARKED AS A GROOMER — a dead end with a signpost.

              The dropdown reads `users.isGroomer`, and a tenant that has never
              ticked the box for anybody gets an empty list. An empty dropdown
              with no explanation is the worst version of this: it looks broken,
              and the fix — one checkbox on a staff page — is nowhere in sight.

              NOT A BLOCKER. "Belum ditentukan" is a real state (FR-3), so a
              booking can still be taken and the groomer filled in later.
            */}
            {!loadingServices && groomers.length === 0 && (
              <Alert variant="warning">
                Belum ada staf yang ditandai sebagai <strong>groomer</strong>.
                Buka Master Data › Staf, buka orangnya, lalu centang
                &ldquo;Groomer&rdquo;. Bookingnya tetap bisa dibuat dengan groomer
                &ldquo;Belum ditentukan&rdquo;.
              </Alert>
            )}

            {editing && (
              <Alert variant="warning">
                Menyimpan perubahan akan memakai harga layanan hari ini untuk
                semua baris yang belum ditagih.
              </Alert>
            )}

            {clash && (
              <Alert variant="warning">
                {clash} — tekan Simpan lagi kalau memang mau dijadwalkan
                bersamaan.
              </Alert>
            )}

            {/*
              §16 field order: kapan, lalu di mana, lalu dengan siapa, lalu
              isinya — and each group is a CARD rather than a run of loose
              fields. Two dozen controls on one page need somewhere to stop.
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

              {/*
                CABANG, BESIDE THE TIME. It is a scoping question like the day is
                — where and when, then who — and it belongs above the animals
                rather than buried under them.

                HIDDEN WHEN THERE IS ONLY ONE BRANCH. A dropdown with one option
                is not a choice, and `soleBranch` has already answered it.
              */}
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
                WHERE THE WORK HAPPENS — asked with the day and the branch, which
                is the order the receptionist asks it in: when, where, then who.

                IT NARROWS THE CATALOGUE. A service that cannot be done at home is
                refused by the server for an `in_home` booking, so the answer here
                changes what the cards below may hold.
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
              ANTAR-JEMPUT — ONE TRIP PER VISIT, and only when the animal has to
              reach the salon.

              THE QUESTION DISAPPEARS ON A HOUSE CALL rather than being asked and
              ignored: the shop is already going to the animal, so collecting it
              first is a journey to nowhere. The server forces both off for
              `in_home`, so a booking switched to home does not silently keep a
              van booked.
            */}
            {location === "in_store" && (
              <Card
                title="Antar-jemput"
                description="Satu perjalanan untuk satu kedatangan — semua hewan pelanggan ini ikut mobil yang sama."
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
              THE POS PICKER, not a `FilterSelect`. §16 sends anything somebody
              would type into to the searchable picker, and for pelanggan that
              picker is `CustomerSearchDialog`: it searches ON THE SERVER, so the
              shop with four hundred customers can find the four hundredth, and
              it registers a new one without leaving the form.
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
                <p className="text-xs text-muted-foreground">
                  Pemilik tidak bisa diganti karena sebagian layanan di booking
                  ini sudah ditagih.
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
              THE ANIMALS ON THIS VISIT — one card each (FR-2).

              This replaced a single pet picker over a checklist of services. The
              old shape could only say "one animal, several services"; Bu Lisa
              arriving with Mochi and Coco needed two whole bookings, typed one
              after the other.
            */}
            {/*
              NOT WRAPPED IN A CARD, unlike the groups above it, and the
              exception is the point: the ANIMAL's card is the white card here.
              Putting white cards inside another white card leaves the middle
              level doing nothing — a border around a border — and the
              hierarchy that actually helps is page tint → white card per
              animal → tinted inset per service.
            */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">
                  Hewan dalam booking ini<span className="text-danger"> *</span>
                </h2>
                <span className="text-xs tabular-nums text-muted">
                  {rowCount} baris
                </span>
              </div>
              <p className="text-sm text-muted">
                Satu kartu per hewan. Layanan, add-on, catatan dan barang
                bawaannya ada di dalam kartunya masing-masing.
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
                    Tambah hewan
                  </Button>
                </div>
              ) : services.length === 0 ? (
                <p className="text-sm text-muted">
                  Belum ada layanan yang bisa dijadwalkan. Tambahkan dulu di
                  Master Data → Layanan.
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-3">
                    {groups.map((group, index) => (
                      <BookingPetGroupCard
                        key={group.key}
                        group={group}
                        index={index}
                        pets={pets}
                        services={services}
                        businessLines={businessLines}
                        groomers={groomers}
                        disabled={saving}
                        removable={groups.length > 1}
                        duplicateKeys={duplicateKeys}
                        onChange={(patch) => updateGroup(group.key, patch)}
                        onRemove={() => removeGroup(group.key)}
                      />
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={saving || rowCount >= MAX_ITEMS}
                      onClick={addGroup}
                    >
                      <Plus className="size-4" />
                      Tambah hewan
                    </Button>
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
                The server's own refusals about the rows — a pet that belongs to
                somebody else, a service that no longer exists — land here,
                because they are about the list rather than about one card.
              */}
              {fieldErrors.items && (
                <p role="alert" className="text-xs font-semibold text-danger">
                  {fieldErrors.items}
                </p>
              )}
            </div>

            {/*
              THE STATUS SELECT USED TO BE HERE, and it is now the two buttons in
              the action bar — see `SAVE_AS`. What somebody is deciding at this
              point is whether they are FINISHED, not which rung of a ladder the
              booking should start on.
            */}
            <Card title="Catatan">
            <div className="flex flex-col gap-4">
            {/*
              §16: Catatan is always last — and this one is about the VISIT.
              Anything about one animal belongs on that animal's card, where the
              person reading it is already looking.
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
            </div>
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
              THE NEW ANIMAL GOES INTO THE FIRST EMPTY CARD, or onto one of its
              own when every card is already spoken for. Somebody who registered
              a second dog mid-booking meant to add it, and making them pick it
              from a select they have just been through is a step for nothing.
            */
            setGroups((prev) => {
              const empty = prev.findIndex((group) => group.petId === "");

              return empty === -1
                ? [...prev, blankGroup(pet._id)]
                : prev.map((group, index) =>
                    index === empty ? { ...group, petId: pet._id } : group,
                  );
            });
          }}
        />
      )}
    </>
  );
}
