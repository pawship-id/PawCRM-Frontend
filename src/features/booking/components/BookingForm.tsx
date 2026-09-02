"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserRound } from "lucide-react";

import {
  Alert,
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
import { BookingPetRowCard, UNASSIGNED } from "./BookingPetRowCard";
import type { PetRowDraft } from "./BookingPetRowCard";
import type {
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
 * The two states a booking may be CREATED in.
 *
 * `in_progress`, `completed` and `cancelled` are absent because they are things
 * that HAPPEN to a booking rather than ways one starts, and each has rules the
 * status route enforces — see BOOKING_TRANSITIONS. A form that offered them
 * would be a second door into the state machine with no guard on it.
 */
const STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "draft", label: "Draft" },
];

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
 * A fresh card.
 *
 * The key is local and never sent — React needs a stable identity, and the row's
 * own contents cannot supply one: two empty cards look identical, and a card
 * whose animal changes is still the same card.
 */
let rowSeq = 0;

function blankRow(): PetRowDraft {
  rowSeq += 1;

  return {
    key: `row-${rowSeq}`,
    petId: "",
    serviceId: "",
    groomerUserId: UNASSIGNED,
    durationMin: "",
    notes: "",
  };
}

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
  /** One card per animal-and-service. The order they were added is kept. */
  const [rows, setRows] = useState<PetRowDraft[]>([blankRow()]);
  const [groomers, setGroomers] = useState<
    { value: string; label: string; disabled?: boolean }[]
  >([]);
  /* The clash the server refused, kept so it can be shown and overridden. */
  const [clash, setClash] = useState<string | null>(null);

  const [date, setDate] = useState(todayValue);
  const [time, setTime] = useState(nextHalfHourValue);
  /* NOT EDITABLE. Status moves through its own route — see the status ladder. */
  const [status, setStatus] = useState<BookingStatus>("confirmed");
  const [notes, setNotes] = useState("");

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

        const locked = new Set<string>();
        const loaded = booking.items.map((item) => {
          rowSeq += 1;
          const key = `row-${rowSeq}`;
          if (item.pulledToCartAt || item.pulledToInvoiceAt) locked.add(key);

          return {
            key,
            petId: item.petId,
            serviceId: item.serviceId,
            groomerUserId: item.groomerUserId ?? UNASSIGNED,
            // Shown as typed, so saving without touching it keeps the number.
            durationMin: item.durationMin === null ? "" : String(item.durationMin),
            notes: item.notes ?? "",
          };
        });

        const at = new Date(booking.scheduledAt);

        setCustomer(owner);
        setRows(loaded.length > 0 ? loaded : [blankRow()]);
        setLockedKeys(locked);
        setPickedBranch(booking.branchId);
        setStatus(booking.status);
        setNotes(booking.notes ?? "");
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
          setRows((prev) =>
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

  function reset() {
    setCustomer(null);
    setPets([]);
    setRows([blankRow()]);
    setDate(todayValue());
    setTime(nextHalfHourValue());
    setStatus("confirmed");
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
    setRows((prev) => prev.map((row) => ({ ...row, petId: "" })));
    setFieldErrors({});
  }

  function updateRow(key: string, patch: Partial<PetRowDraft>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
    setFieldErrors({});
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
    setFieldErrors({});
  }

  function removeRow(key: string) {
    /*
      A BILLED ROW CANNOT LEAVE (PRD 2.12). The server refuses it with a 409, and
      the card gives it no remove button — this is the third guard, for the case
      where some future caller reaches the function directly.
    */
    if (lockedKeys.has(key)) return;
    // Never the last one: a visit with no animals is not a visit (PRD 2.10).
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
    setFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
        items: rows.map((row) => ({
          petId: row.petId,
          serviceId: row.serviceId,
          // FR-3's "Belum ditentukan" is a real state, not a gap.
          groomerUserId:
            row.groomerUserId === UNASSIGNED ? null : row.groomerUserId,
          /*
            OMITTED WHEN NOBODY TYPED ONE, rather than sent as the catalogue's
            number. The server snapshots from the catalogue itself, so sending
            nothing keeps the appointment following a duration the shop may
            still correct before Thursday.
          */
          durationMin:
            row.durationMin.trim() === ""
              ? undefined
              : Number(row.durationMin),
          notes: row.notes.trim() === "" ? null : row.notes.trim(),
        })),
        scheduledAt,
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
        : await bookingService.create({ ...payload, status });

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

  /*
    Summed as decimal STRINGS — this is a quote somebody will be charged, and
    `0.1 + 0.2` is why utils/decimal exists.
  */
  const total = sumDecimals(
    rows
      .map((row) => serviceOf(row.serviceId)?.price)
      .filter((price): price is string => Boolean(price)),
  );

  /**
   * WHICH CARDS REPEAT AN ANIMAL AND A SERVICE ALREADY ON THE BOOKING.
   *
   * The FIRST occurrence is left alone and every later one is flagged, so the
   * message lands on the card somebody just added rather than on the one they
   * filled in five minutes ago (PRD 2.7).
   */
  const duplicateKeys = new Set<string>();
  const seenPairs = new Set<string>();

  rows.forEach((row) => {
    if (!row.petId || !row.serviceId) return;

    const pair = `${row.petId}|${row.serviceId}`;

    if (seenPairs.has(pair)) duplicateKeys.add(row.key);
    else seenPairs.add(pair);
  });

  /**
   * WHEN THE CUSTOMER GETS THEIR ANIMALS BACK — the longest groomer's workload,
   * never the sum (PRD 2.9).
   *
   * Two groomers work at the same time: Mochi with Sinta for 90 minutes and Coco
   * with Rio for 60 means the visit takes 90, not 150. Cards sharing a groomer
   * ARE summed, because one person cannot do two animals at once, and cards with
   * nobody assigned are grouped together — which over-estimates rather than
   * under-, and promising an earlier finish than the shop can manage is the
   * mistake that sends somebody home late.
   *
   * The same rule the server applies in `BookingItemRepository#summarise`. Two
   * implementations of one rule is a thing to watch: this one is a preview and
   * the stored answer is the server's.
   */
  const perGroomer = new Map<string, number>();

  rows.forEach((row) => {
    const typed = Number(row.durationMin);
    const minutes =
      row.durationMin.trim() !== "" && Number.isFinite(typed) && typed > 0
        ? typed
        : (serviceOf(row.serviceId)?.durationMin ?? 0);

    if (minutes <= 0) return;

    const key = row.groomerUserId;
    perGroomer.set(key, (perGroomer.get(key) ?? 0) + minutes);
  });

  const longest = Math.max(0, ...perGroomer.values());

  /** Distinct animals — the same number the server stores as `petCount`. */
  const petCount = new Set(
    rows.map((row) => row.petId).filter((petId) => petId !== ""),
  ).size;

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
  const incomplete = rows.find((row) => !row.petId || !row.serviceId);

  const ownerFixed = lockedKeys.size > 0;

  const blockedReason = !branchId
    ? "Cabang belum dipilih."
    : !customer
      ? "Pelanggan belum dipilih."
      : incomplete
        ? "Setiap hewan harus punya layanan."
        : duplicateKeys.size > 0
          ? "Ada hewan dengan layanan yang sama dua kali."
          : date === "" || time === ""
            ? "Tanggal dan jamnya belum lengkap."
            : null;

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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
                {rows.length} baris
                {petCount > 1 ? ` · ${petCount} hewan` : ""}
              </span>
            </span>
          }
          submitLabel={editing ? "Simpan perubahan" : "Simpan booking"}
          submitting={saving}
          disabled={blockedReason !== null || loading}
          blockedReason={blockedReason}
          onCancel={cancel}
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

            {/* §16 field order: kapan, lalu dengan siapa, lalu isinya. */}
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
            </div>

            {/*
              THE POS PICKER, not a `FilterSelect`. §16 sends anything somebody
              would type into to the searchable picker, and for pelanggan that
              picker is `CustomerSearchDialog`: it searches ON THE SERVER, so the
              shop with four hundred customers can find the four hundredth, and
              it registers a new one without leaving the form.
            */}
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

            {/*
              THE ANIMALS ON THIS VISIT — one card each (FR-2).

              This replaced a single pet picker over a checklist of services. The
              old shape could only say "one animal, several services"; Bu Lisa
              arriving with Mochi and Coco needed two whole bookings, typed one
              after the other.
            */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label>
                  Hewan dalam booking ini<span className="text-danger"> *</span>
                </Label>
                <span className="text-xs tabular-nums text-muted">
                  {rows.length} baris
                </span>
              </div>

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
                    {rows.map((row, index) => (
                      <BookingPetRowCard
                        key={row.key}
                        row={row}
                        index={index}
                        pets={pets}
                        services={services}
                        groomers={groomers}
                        disabled={saving}
                        removable={rows.length > 1}
                        locked={lockedKeys.has(row.key)}
                        duplicate={duplicateKeys.has(row.key)}
                        onChange={(patch) => updateRow(row.key, patch)}
                        onRemove={() => removeRow(row.key)}
                      />
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={saving || rows.length >= MAX_ITEMS}
                      onClick={addRow}
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
              STATUS IS ASKED ONLY WHEN THE BOOKING IS BEING MADE. PATCH has no
              `status` field: a transition has rules a `$set` cannot express, so
              it moves through `/status` and, on screen, through the buttons on
              the booking's own page. A select here would offer moves the ladder
              forbids and be refused one at a time.
            */}
            {!editing && (
            <SelectField
              label="Status"
              value={status}
              onChange={(next) => setStatus(next as BookingStatus)}
              options={STATUS_OPTIONS}
              disabled={saving}
              hint="Hanya booking yang dikonfirmasi bisa ditarik ke keranjang di kasir."
              required
            />
            )}

            {/* §16: Catatan is always last. */}
            <TextareaField
              label="Catatan"
              name="booking-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={NOTES_MAX_LENGTH}
              placeholder="mis. anjingnya takut hairdryer"
              error={fieldErrors.notes}
              disabled={saving}
            />

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
            setRows((prev) => {
              const empty = prev.findIndex((row) => row.petId === "");

              return empty === -1
                ? [...prev, { ...blankRow(), petId: pet._id }]
                : prev.map((row, index) =>
                    index === empty ? { ...row, petId: pet._id } : row,
                  );
            });
          }}
        />
      )}
    </>
  );
}
