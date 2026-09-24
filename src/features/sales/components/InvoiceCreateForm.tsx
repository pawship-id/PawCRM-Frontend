"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight, Trash2 } from "lucide-react";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  Spinner,
  TextField,
  TextareaField,
  namedOptions,
} from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PetFixLink } from "@/features/pets";
import { useVariantQuote } from "@/features/services";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { petService } from "@/services/pet.service";
import {
  formatMoney,
  formatQty,
  isPositive,
  subtractDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import { AXIS_LABEL, type PriceLookup } from "@/utils/serviceVariant";
import type {
  Booking,
  CreateInvoiceItemInput,
  InvoiceChannel,
  InvoiceDiscountMode,
  Pet,
  PosCharge,
  Service,
  ServiceVariantAxis,
  VariantChoice,
} from "@/types/api";
import type { Product } from "@/types/inventory";

import { arahCardOf, choicesForLeg } from "@/features/antar-jemput/ride";
import {
  pinOf,
  resolveLeg,
} from "@/features/antar-jemput/components/TripPointFields";
import {
  RideJourneyDialog,
} from "@/features/antar-jemput/components/RideJourneyDialog";
import type { RideJourney } from "@/features/antar-jemput/components/RideJourneyFields";

import { useInvoiceLineStock } from "../hooks/useInvoiceLineStock";
import { useInvoiceLookups } from "../hooks/useInvoiceLookups";
import { bookingShareOf, ownDiscountOfLine } from "../bookingDiscount";
import { previewInvoice } from "../invoicePreview";
import { hasChoice, lineRefusalOf, type LineRefusal } from "../variantLine";
import { InvoiceAddItemsDialog } from "./InvoiceAddItemsDialog";
import { InvoiceAddonPicker } from "./InvoiceAddonPicker";
import { InvoiceBarcodeScan } from "./InvoiceBarcodeScan";
import { InvoiceBookingPanel } from "./InvoiceBookingPanel";
import { InvoiceLineVariant } from "./InvoiceLineVariant";
import { formatRate } from "./InvoiceItemsTable";

/**
 * WHY THIS LINE HAS NO PRICE — said under the animal that would answer it
 * (16 September 2026, on request).
 *
 * A service priced by variant is quoted from the ANIMAL's own size, coat or
 * species. Pick one whose record does not carry the fact the service varies by
 * and the price cell reads "—", the total reads Rp 0, and nothing on the row
 * says why. The blocked Simpan does name it, but that sentence is at the head of
 * a form whose rows are what somebody is looking at.
 *
 * `PetFixLink` IS THE WAY OUT, the same one the booking form and the till
 * already offer: it names the animal and the missing field, and opens that pet
 * in a NEW TAB so the half-built invoice survives.
 *
 * NOTHING IS DRAWN when the price is known, when no animal is chosen yet (the
 * empty picker above is the question), or when the price failed for a reason the
 * animal cannot fix — a variant nobody priced is the catalogue's problem, and
 * sending somebody to the pet form for it would be a wrong instruction.
 */
function MissingFactNote({
  line,
  pet,
  missing,
}: {
  line: { kind: "product" | "service"; petId: string };
  pet: Pet | null;
  /** The line's quote's `missingAxis` — see `quoteOf`. */
  missing: ServiceVariantAxis | null;
}) {
  if (line.kind !== "service" || !line.petId || !pet) return null;

  if (!missing) return null;

  /*
    THE LINK ALONE — "Lengkapi ukuran Miko →" already names the animal, the
    missing field and the way out, so a sentence in front of it said each of
    those a second time in a table cell that has no room for either.
  */
  return (
    <span className="mt-1 block text-xs font-semibold text-danger-ink">
      <PetFixLink pet={pet} axis={missing} />
    </span>
  );
}

type Quote = ReturnType<typeof useVariantQuote>["quote"];

/**
 * THE CHOICES A LINE IS QUOTED ON (17 September 2026) — its own, over its
 * service's when it is an add-on: the server lets an add-on typed next to its
 * main service inherit that line's "Dipilih staf" values unless it names its
 * own, and the preview has to agree with it.
 */
function choicesOf(line: DraftLine, lines: DraftLine[]): VariantChoice[] {
  const parent = line.parentKey
    ? lines.find((one) => one.key === line.parentKey)
    : undefined;

  if (!parent) return line.choices;

  const own = new Set(line.choices.map((choice) => choice.optionId));
  return [
    ...parent.choices.filter((choice) => !own.has(choice.optionId)),
    ...line.choices,
  ];
}

/**
 * The service rows, priced again from the animals as they read NOW.
 *
 * A row's price was worked out from the animal as it was WHEN THE ROW WAS
 * ADDED. Fill in Miko's size through the note above — in another tab, on the
 * pet's own form — and re-reading the animals is only half the way back: the
 * row would still show a dash and still block Simpan, over a fact that has
 * been answered. This is the other half, and it is the same rule `patchLine`
 * already applies when the pet CHANGES, extended to the pet's own record
 * changing underneath it.
 *
 * EVERY SERVICE ROW, not only the ones reading nought: a size corrected from
 * Kecil to Besar moves a price that was never missing, and a row still quoting
 * the old one would bill it.
 *
 * NOTHING HERE IS TYPED, so there is no hand-entered figure to overwrite. A
 * service row's price is read-only on this form — the catalogue's answer for
 * that animal, which the server works out again the same way.
 *
 * THE SAME ARRAY COMES BACK when every row already agrees, so a refresh that
 * changed nothing costs no render.
 */
function repriced(
  lines: DraftLine[],
  services: Service[],
  pets: Pet[],
  quote: Quote,
  /** A ride's own quote — its zone is its journey's, not the bill's. */
  fareOf: (line: DraftLine) => string | null,
) {
  let changed = false;

  const next = lines.map((line) => {
    if (line.kind !== "service") return line;

    /*
      A RIDE IS PRICED BY WHERE IT GOES, not by an animal — a van has no coat
      length. `fareOf` measures between the journey's own two ends and
      multiplies a `per_pet` fare by the bookings it serves, exactly as the
      server does.
    */
    if (line.ride) {
      const fare = fareOf(line) ?? "0";
      if (fare === line.unitPrice) return line;
      changed = true;
      return { ...line, unitPrice: fare };
    }

    if (!line.petId) return line;

    const price =
      quote(
        services.find((one) => one._id === line.refId),
        pets.find((one) => one._id === line.petId),
        choicesOf(line, lines),
      ).price ?? "0";

    if (price === line.unitPrice) return line;

    changed = true;
    return { ...line, unitPrice: price };
  });

  return changed ? next : lines;
}

/**
 * RAISE AN INVOICE — PCR-030's form.
 *
 * A **FORM TRANSAKSI** by §16's one test: it has a table of rows underneath it.
 * So the header is a two-column grid collapsing to one on a phone, the rows sit
 * below it, and Keterangan closes the header rather than the page.
 *
 * FIELD ORDER IS THE BO MOCKUP'S, not §16's Kapan-first — Pelanggan, Cabang ·
 * Gudang, Tanggal · Jatuh tempo, Channel, Catatan. Decided 12 Sep 2026 on
 * request and recorded in ui-rules §16; do not reorder it as a tidy-up.
 *
 * THE TOTAL IS COMPUTED IN THE BROWSER, by `invoicePreview.ts`, which mirrors the
 * server's order of operations. The server recomputes everything and is the
 * authority; nothing here is ever SENT as a total. A form that asked somebody to
 * approve a bill without showing them the bill would not be a form.
 *
 * PRICES ARE NOT EDITABLE, and that is a rule rather than an omission: a price a
 * client can set is a discount nobody approved. What this form decides is which
 * item, how many, and what discount — the price comes from the catalogue, on
 * screen and again on the server.
 *
 * ERRORS GO TO A TOAST. A departure from `docs/ui-rules.md` §9, matching the
 * branch forms and asked for directly: this form is long, and the refusals that
 * matter most here — the branch has no code, the shelf is short — arrive while
 * the cursor is somewhere in a table halfway down the page.
 */
const LIST_PATH = "/dashboard/sales";

/**
 * The two the PRD names. `manual` is every invoice anybody types here; the other
 * is for orders that arrived from a marketplace once that sync exists.
 */
const CHANNEL_LABEL: Record<InvoiceChannel, string> = {
  manual: "Diinput manual",
  marketplace: "Marketplace",
};

const CHANNEL_OPTIONS = (Object.keys(CHANNEL_LABEL) as InvoiceChannel[]).map(
  (value) => ({ value, label: CHANNEL_LABEL[value] }),
);

/** A row as the form holds it — the catalogue's price kept beside the ids. */
interface DraftLine {
  kind: "product" | "service";
  refId: string;
  name: string;
  sku: string | null;
  unitPrice: string;
  qty: string;
  discountMode: InvoiceDiscountMode;
  discountValue: string;
  /**
   * WHOSE ANIMAL, on a service line — PCR-035. REQUIRED on one.
   *
   * Empty blocks the submit rather than billing a grooming nobody can schedule:
   * a service with no pet reaches no day sheet, nobody is assigned, and the only
   * record that the work is owed is a line on a bill the customer takes home.
   * The server refuses it too, so this is a courtesy over the refusal rather
   * than the rule itself.
   *
   * Never set on a product line — the server refuses one there, because a collar
   * has no grooming.
   */
  petId: string;
  /** This row's handle — stable while rows above it come and go. */
  key: string;
  /**
   * THE ROW AN ADD-ON WAS TICKED UNDER — that row's `key`, null on every other.
   *
   * THE FORM'S OWN BOOKKEEPING, never sent: it keeps the add-on beside its
   * service, on the same animal, and takes it off with it. The server files the
   * add-on under the service again from the catalogue.
   */
  parentKey: string | null;
  /**
   * THE "DIPILIH STAF" VALUES CHOSEN ON THIS ROW — "Lokasi: Di Rumah" (17
   * September 2026). Sent as the line's `variantChoices`; empty on a product,
   * and on an add-on that simply inherits its service's.
   */
  choices: VariantChoice[];
  /**
   * ─── THE JOURNEY AN ANTAR-JEMPUT ROW IS (24 September 2026) ──────────────
   *
   * Which way the van goes, between which two doors, and the bookings it is
   * fetching for. Null on every other row — and a ride row with none has no
   * price at all, because a fare is a band of the distance driven.
   *
   * ASKED IN A DIALOG (`RideJourneyDialog`), not in the cell: a direction, two
   * addresses and a list of bookings do not fit beside a quantity and a price.
   */
  ride: RideJourney | null;
  /**
   * EVERY ANIMAL IN THE VAN. A ride carries several off ONE row and is charged
   * once, so `petId` stays empty on it — the same shape the booking it raises
   * keeps its animals in.
   */
  passengers: string[];
}

/**
 * WHO IS IN THE VAN, in a table cell — "Cici, Comoo", and nothing else
 * (24 September 2026, on request).
 *
 * THE COLUMN IS "HEWAN", so it says the animals. An earlier pass put the
 * direction, the customer's address and a count of linked bookings here too,
 * which made a two-line cell out of a column whose header asks one thing —
 * and every one of those facts is a tap away in the dialog.
 */
function RideSummary({
  line,
  pets,
  disabled,
  onEdit,
}: {
  line: DraftLine;
  pets: Pet[];
  disabled: boolean;
  /** Null on an add-on — it rides on its service's journey and changes none. */
  onEdit: (() => void) | null;
}) {
  const names = line.passengers
    .map((id) => pets.find((one) => one._id === id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-sm text-foreground">{names || "—"}</span>
      {onEdit && (
        <UIButton
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onEdit}
        >
          Ubah perjalanan
        </UIButton>
      )}
    </div>
  );
}

/** Row handles — a counter, because an index shifts whenever a row is removed. */
let lastLineKey = 0;
const nextLineKey = () => `line-${(lastLineKey += 1)}`;

const todayValue = () => new Date().toISOString().slice(0, 10);

/** Nobody has a hundred animals; this is a ceiling, not a page size. */
const MAX_PETS = 100;

export function InvoiceCreateForm() {
  const router = useRouter();
  const lookups = useInvoiceLookups();

  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayValue());
  const [termDays, setTermDays] = useState("30");
  const [channel, setChannel] = useState<InvoiceChannel>("manual");
  const [notes, setNotes] = useState("");

  /*
    THE ROWS AS TYPED. What the form reads is `lines` below — these, with every
    service row priced again from the animal, the zone and the choices as they
    stand now.
  */
  const [draftLines, setLines] = useState<DraftLine[]>([]);
  /** The server's last refusal about one row, by the row's `key`. */
  const [lineRefusals, setLineRefusals] = useState<Record<string, LineRefusal>>(
    {},
  );
  /** Whether the "+ Tambah barang atau jasa" dialog is open. */
  const [picking, setPicking] = useState(false);
  /*
    BOOKINGS ARE SENT AS IDS, not as lines. The server reads each booking's own
    frozen prices, its animal and its groomer — a client that could send those
    could bill a grooming at a price nobody quoted, against somebody else's pet.
    Which means the form cannot preview their total either; see the note by the
    recap.
  */
  const [pulledBookings, setPulledBookings] = useState<Booking[]>([]);
  const bookingIds = pulledBookings.map((booking) => booking._id);

  /*
    BOOKING LINES JOIN THE PREVIEW, even though they are SENT as ids.

    The server prices them identically to typed lines — the invoice discount
    applies across both — so leaving them out of the preview made the recap read
    Rp 0 with two groomings ticked, and would have understated every invoice
    discount that touched them.

    The prices here are the bridge's, which are the same frozen figures the
    server will read from the bookings themselves — the main service, then each
    add-on as a line of its own, in the order the server assembles them.
  */
  /*
    THE PULLED BOOKINGS' SHARES OF "DISKON SELURUH BOOKING" (15 September 2026).
    They ride inside each booking line's discount below, so the preview's
    `itemDiscount` already counts them; the recap shows them apart, under
    "Diskon baris", the way the till does.
  */
  const bookingShares = sumDecimals(pulledBookings.map(bookingShareOf));

  /*
    THE PULLED BOOKINGS AS ROWS OF BARIS FAKTUR (17 September 2026, on request):
    a booking chosen above leaves the panel and is drawn here, so the total never
    counts something the rows do not show. Read-only — their prices, add-ons and
    discounts are the booking's own — and taken off whole, which puts the booking
    back in the panel. `at` is each line's place in the preview, which prices
    bookings first, in this same order.
  */
  const bookingRows = pulledBookings.flatMap((booking, bookingIndex) => {
    const before = pulledBookings
      .slice(0, bookingIndex)
      .reduce((count, one) => count + 1 + one.service.addons.length, 0);

    const all = [booking.service, ...booking.service.addons];

    return all.map((line, offset) => ({
      booking,
      line,
      isAddon: offset > 0,
      isLast: offset === all.length - 1,
      at: before + offset,
    }));
  });

  const bookingLines = pulledBookings.flatMap((booking) =>
    [booking.service, ...booking.service.addons].map((line) => ({
      qty: "1",
      unitPrice: line.price,
      /* The booking's discount on this line, pulled as the server pulls it. */
      discount: line.discountAmount
        ? { mode: "amount" as const, value: line.discountAmount }
        : null,
    })),
  );
  /*
    THE CUSTOMER'S ANIMALS — PCR-035, and refetched whenever the customer
    changes, because "which pets" has no meaning until "whose" is answered.

    BEST EFFORT AND SILENT WHEN IT FAILS, the same rule the booking panel above
    follows: reading /api/pets takes `pets:read`, and somebody who raises bills
    all day may not hold it. The picker simply does not appear, the service is
    still billable, and the only thing lost is the booking that would have been
    raised for it.
  */
  /*
    WHOSE ANIMALS THESE ARE IS PART OF THE STATE, not a fact the effect resets
    on the way past. A bare `setPets([])` for an empty customer is a cascading
    render the lint rule catches — and the same shape is what leaves one
    customer's animals on screen for a moment under another's name. Carrying the
    id alongside makes staleness DERIVABLE: the list counts only while it still
    answers the question being asked.
  */
  const [pets, setPets] = useState<{ forCustomer: string; items: Pet[] }>({
    forCustomer: "",
    items: [],
  });

  useEffect(() => {
    // No state touched — a bare return is not a cascading render.
    if (!customerId) return;

    let active = true;

    petService
      .list({ customerId, isActive: true, limit: MAX_PETS })
      .then((result) => {
        if (active) setPets({ forCustomer: customerId, items: result.items });
      })
      .catch(() => {
        if (active) setPets({ forCustomer: customerId, items: [] });
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  /**
   * The same list, read again — WITHOUT the row going blank while it is in
   * flight.
   *
   * `MissingFactNote` sends somebody to that pet's form in a NEW TAB, so the
   * fact this invoice is waiting on is filled in somewhere this form cannot
   * see. Until it re-reads, the row keeps showing a dash and Simpan keeps
   * refusing — about a field that has already been answered — and the only way
   * out was to reload and lose the half-built invoice.
   *
   * IT KEEPS WHAT IT HAS on a failed read. A refresh nobody asked for is not a
   * reason to empty the picker underneath them.
   */
  const refreshPets = useCallback(async () => {
    if (!customerId) return;

    try {
      const result = await petService.list({
        customerId,
        isActive: true,
        limit: MAX_PETS,
      });

      /*
        AND NOT ONTO SOMEBODY ELSE'S ANIMALS. A read that lands after the
        customer has been switched answers a question nobody is asking any
        more — the reply is dropped rather than written over the new one.
      */
      /*
        AND THE ROWS FOLLOW THEM — `lines` is priced from the animals on every
        render, so the new read is all it takes.
      */
      setPets((current) =>
        current.forCustomer === customerId
          ? { forCustomer: customerId, items: result.items }
          : current,
      );
    } catch {
      /* Keep the animals already on screen — see above. */
    }
  }, [customerId]);

  /*
    BACK FROM THE OTHER TAB. `visibilitychange` RATHER THAN `focus`: focus fires
    for a click back into the window from a devtools panel or a dropdown
    closing, which would put a request on the wire for nothing. The same
    listener the booking form uses, for the same detour.
  */
  useEffect(() => {
    if (!customerId) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshPets();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [customerId, refreshPets]);

  const petOptions = useMemo(
    () =>
      pets.forCustomer === customerId
        ? pets.items.map((pet) => ({ value: pet._id, label: pet.name }))
        : [],
    [pets, customerId],
  );

  /*
    PRICING BEYOND THE PET (17 September 2026): the customer's zone, measured
    from the chosen branch's pin to the customer's, and the "Dipilih staf"
    cards. A preview — the server measures again and stores what it finds.
  */
  const branchPin = lookups.branches.find((one) => one._id === branchId)?.location;
  const customerPin = lookups.customers.find(
    (one) => one._id === customerId,
  )?.location;
  const variant = useVariantQuote({ branchPin, customerPin });

  const serviceOf = (refId: string) =>
    lookups.services.find((one) => one._id === refId);

  /** Which rows are a journey — the one kind of service that asks for one. */
  const isRideService = (refId: string) =>
    serviceOf(refId)?.serviceKind === "pickup-delivery";

  const branchRecord = lookups.branches.find((one) => one._id === branchId) ?? null;
  const customerRecord =
    lookups.customers.find((one) => one._id === customerId) ?? null;

  /** A ride row's two ends, resolved against the registers it may copy from. */
  const endsOf = useCallback(
    (line: DraftLine) =>
      line.ride
        ? resolveLeg(line.ride.points, customerRecord, branchRecord)
        : null,
    [customerRecord, branchRecord],
  );

  /**
   * WHAT A JOURNEY COSTS — measured between its OWN two ends, and multiplied by
   * the bookings the van serves when the fare is `per_pet` (one booking is one
   * animal, 23 September 2026). Mirrors the server, which measures the same two
   * points and is what the line stores.
   *
   * Null until both ends are pinned: a fare is a band of distance, so an
   * address with no point has no price.
   */
  const fareOf = useCallback(
    (line: DraftLine): string | null => {
      const service = lookups.services.find((one) => one._id === line.refId);
      const ends = line.ride
        ? resolveLeg(line.ride.points, customerRecord, branchRecord)
        : null;
      const from = ends && pinOf(ends.origin);
      const to = ends && pinOf(ends.destination);

      if (!service || !line.ride || !from || !to) return null;

      const zone = variant.zoneBetween(from, to);
      const unit = variant.quote(
        service,
        null,
        choicesForLeg(service, variant.cardsFor([service]), line.ride.leg, line.choices),
        zone,
      ).price;

      if (unit === null) return null;

      /* ⚠️ THE MAIN ROW ONLY. An add-on carries a copy of the journey so its
         booking lands on the right one; the multiplier is the FARE's. */
      const riders =
        !line.parentKey && service.billingUnit === "per_pet"
          ? Math.max(1, line.ride.linkedBookingIds.length)
          : 1;

      return riders > 1
        ? toDecimalString(toMinor(unit)! * BigInt(riders))
        : unit;
    },
    [lookups.services, customerRecord, branchRecord, variant],
  );

  /**
   * WHO A ROW IS FOR, in words — "Miko", or "Cici, Comoo" for a van. Null while
   * the row has not said, which is what closes its add-on picker.
   *
   * ⚠️ A RIDE ANSWERS FROM ITS PASSENGERS, not from `petId`: it has none.
   */
  const whoseRow = (line: DraftLine): string | null => {
    if (line.ride) {
      const names = line.passengers
        .map((id) => pets.items.find((one) => one._id === id)?.name)
        .filter(Boolean)
        .join(", ");
      return names || null;
    }

    return pets.items.find((one) => one._id === line.petId)?.name ?? null;
  };

  /**
   * WHAT AN ADD-ON COSTS ON A JOURNEY — quoted in the ride's OWN zone and with
   * its direction answered, and never multiplied by the bookings the van serves
   * (that is the fare's multiplier, not the add-on's — see `fareOf`).
   */
  const rideAddonQuote = (line: DraftLine, addon: Service) => {
    const service = serviceOf(line.refId);
    const ends = endsOf(line);
    const from = ends && pinOf(ends.origin);
    const to = ends && pinOf(ends.destination);

    return variant.quote(
      addon,
      null,
      service && line.ride
        ? choicesForLeg(
            service,
            variant.cardsFor([service]),
            line.ride.leg,
            line.choices,
          )
        : line.choices,
      from && to ? variant.zoneBetween(from, to) : undefined,
    );
  };

  /** A ride row's two ends, flat as the payload carries them. */
  const tripInputOf = (line: DraftLine) => {
    const ends = endsOf(line);
    const from = ends && pinOf(ends.origin);
    const to = ends && pinOf(ends.destination);

    if (!line.ride || !ends || !from || !to) return undefined;

    return {
      leg: line.ride.leg,
      origin: { address: ends.origin.address, ...from },
      destination: { address: ends.destination.address, ...to },
    };
  };

  const lines = useMemo(
    () => repriced(draftLines, lookups.services, pets.items, variant.quote, fareOf),
    [draftLines, lookups.services, pets.items, variant.quote, fareOf],
  );

  /** What this row costs for its animal, zone and choices — or why not. */
  const quoteOf = (line: DraftLine): PriceLookup =>
    variant.quote(
      serviceOf(line.refId),
      pets.items.find((one) => one._id === line.petId),
      choicesOf(line, lines),
    );

  /**
   * The cards this row asks — its service's, less any its main service's row
   * already asks, which an add-on inherits.
   */
  function cardsOf(line: DraftLine) {
    if (line.kind !== "service") return [];

    const service = serviceOf(line.refId);
    const cards = variant.cardsFor([service]);
    /*
      ⚠️ "ARAH" IS ANSWERED BY THE DIRECTION, NOT ASKED TWICE. It is an owner's
      variant option like any other (BO, 21 September 2026), so it carries the
      price — but a select on the row beside the direction chosen in the
      journey dialog is two ways to disagree. Same rule as the diary's form and
      the till's; same helper (`choicesForLeg`, in `fareOf`).
    */
    /*
      ⚠️ KEYED ON THE SERVICE, NOT ON `line.ride` (24 September 2026). Before a
      journey is filled in the row has no `ride` yet — and that is exactly when
      the select was still drawn, so an antar-jemput row asked for Arah on the
      row AND in the dialog. The direction only ever comes from the dialog.
    */
    const arah = isRideService(line.refId) ? arahCardOf(service, cards) : null;
    const asked = arah
      ? cards.filter((card) => card.axisKey !== arah.card.axisKey)
      : cards;

    const parent = line.parentKey
      ? lines.find((one) => one.key === line.parentKey)
      : undefined;

    if (!parent) return asked;

    const inherited = new Set(
      variant.cardsFor([serviceOf(parent.refId)]).map((card) => card.axisKey),
    );
    return asked.filter((card) => !inherited.has(card.axisKey));
  }

  /** A row's choices changed — and any refusal about them is answered. */
  function setChoices(key: string, choices: VariantChoice[]) {
    setLineRefusals({});
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, choices } : line)),
    );
  }

  const [invoiceDiscountMode, setInvoiceDiscountMode] =
    useState<InvoiceDiscountMode>("percent");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState("");

  /*
    OTHER CHARGES — ongkir, packaging — the till's "biaya lain", on a bill
    (14 September 2026). Added after the discounts and taxed like a line; the
    server prices them again and credits them to 4193.

    EDITED IN PLACE, WITH NOTHING TO CONFIRM (decided 14 September 2026 on
    request): "+ Tambah biaya lain" puts an empty row on, and what is typed
    counts toward the total straight away. A row left entirely blank is ignored;
    a half-filled one blocks saving — see `blocking`.

    `key` IS THE ROW'S OWN HANDLE, never the label: keyed on what is being typed,
    the input would remount on every keystroke and lose the cursor.
  */
  const [charges, setCharges] = useState<(PosCharge & { key: string })[]>([]);
  /** The rows somebody actually typed into, trimmed — what is sent. */
  const filledCharges = charges
    .map((charge) => ({
      label: charge.label.trim(),
      amount: charge.amount.trim(),
    }))
    .filter((charge) => charge.label !== "" || charge.amount !== "");

  const [saving, setSaving] = useState(false);
  /** The row whose journey is being filled in, by its `key`. */
  const [rideRow, setRideRow] = useState<string | null>(null);

  /**
   * Customers with their phone beside the name — the mockup's picker. Two
   * customers called Budi are one wrong bill apart without it.
   */
  const customerOptions = useMemo(
    () =>
      lookups.customers.map((customer) => ({
        value: customer._id,
        label: customer.name,
        ...(customer.phone ? { meta: customer.phone } : {}),
      })),
    [lookups.customers],
  );

  /**
   * The warehouses of the chosen branch, plus every CENTRAL one.
   *
   * A warehouse with no `defaultBranchId` belongs to nobody and serves everyone —
   * the one shape a same-value filter would have wrongly excluded, and the same
   * rule the server enforces when it pairs the two.
   */
  const warehousesHere = useMemo(
    () =>
      lookups.warehouses.filter(
        (warehouse) =>
          !warehouse.defaultBranchId ||
          String(warehouse.defaultBranchId) === branchId,
      ),
    [lookups.warehouses, branchId],
  );

  const hasProductLine = lines.some((line) => line.kind === "product");

  /*
    STOCK UNDER EACH PRODUCT LINE'S SKU (14 September 2026, the BO mockup) — at
    the warehouse the header chose, which already stands for the chosen branch.
    See `useInvoiceLineStock` for why this is the batches' sum and the figure the
    save is refused against.
  */
  const lineStock = useInvoiceLineStock(
    lines.filter((line) => line.kind === "product").map((line) => line.refId),
  );

  /**
   * The mockup's three notes — enough, short, none — or a nudge to pick the
   * warehouse first. Nothing while the figure is still being read, rather than a
   * zero that is not true yet.
   *
   * THE SAVE IS NOT BLOCKED HERE. The server refuses a short shelf by name, and
   * this is a warning read while the bill is still being put together.
   */
  function stockNote(line: DraftLine) {
    if (line.kind !== "product") return null;

    if (!warehouseId) {
      return (
        <span className="block text-xs text-muted">
          Pilih gudang untuk melihat stok
        </span>
      );
    }

    const onHand = lineStock.qtyAt(line.refId, warehouseId);
    if (onHand === null) return null;

    const have = toMinor(onHand) ?? BigInt(0);
    const label = `Stok ${formatQty(onHand)}`;

    if (have <= BigInt(0)) {
      // `danger-ink`, not `danger`: 13 px text needs the 6.37:1 one (§13).
      return (
        <span className="block text-xs font-semibold text-danger-ink">
          {label}
        </span>
      );
    }

    if (have < (toMinor(line.qty) ?? BigInt(0))) {
      return (
        <span className="block text-xs font-semibold text-warning">
          {`${label} — kurang`}
        </span>
      );
    }

    return (
      <span className="block text-xs font-semibold text-success">{label}</span>
    );
  }
  const hasServiceLine =
    pulledBookings.length > 0 || lines.some((line) => line.kind === "service");

  const preview = useMemo(
    () =>
      previewInvoice(
        [
          // Bookings first, matching the order the server assembles them in.
          ...bookingLines,
          ...lines.map((line) => ({
            qty: line.qty,
            unitPrice: line.unitPrice,
            discount: line.discountValue
              ? { mode: line.discountMode, value: line.discountValue }
              : null,
          })),
        ],
        invoiceDiscountValue
          ? { mode: invoiceDiscountMode, value: invoiceDiscountValue }
          : null,
        { ...lookups.tax, otherCharges: charges },
      ),
    [
      lines,
      bookingLines,
      invoiceDiscountMode,
      invoiceDiscountValue,
      lookups.tax,
      charges,
    ],
  );

  /**
   * A line's slice of the invoice's PPN — the allocation the server freezes per
   * line, drawn the way the detail page draws it: the code, then what it adds
   * on top or carries inside. "Non-PPN" only when the tenant charges none; a
   * dash while a line has no price yet. `at` is the line's place in the preview.
   */
  function taxCell(at: number) {
    if (lookups.tax.taxRate === 0) {
      return <span className="text-xs text-muted">Non-PPN</span>;
    }

    if (preview.lineTaxes[at] === "0.0000") {
      return <span className="text-muted">—</span>;
    }

    return (
      <>
        <span className="rounded-full bg-tint-brand px-2 py-0.5 text-xs font-semibold text-primary">
          {`PPN ${formatRate(lookups.tax.taxRate)}%`}
        </span>
        <span className="mt-1 block text-xs font-semibold text-success">
          {lookups.tax.priceIncludesTax
            ? `termasuk ${formatMoney(preview.lineTaxes[at])}`
            : `+${formatMoney(preview.lineTaxes[at])}`}
        </span>
      </>
    );
  }

  /*
    A SERVICE LINE WHOSE ANIMAL'S VARIANT IS SWITCHED OFF (13 September 2026).
    The resolver still returns its price, so the row does not read as unpriced —
    which is exactly why it needs its own check: the server refuses a new line
    for an inactive variant, and without this the save would go out and come
    back refused.
  */
  const variantInactive = (line: DraftLine) =>
    line.kind === "service" && line.petId !== "" && quoteOf(line).inactive;

  /**
   * Why Simpan is disabled, in the words of the thing that is missing.
   *
   * ONE REASON AT A TIME, and the FIRST unanswered question rather than a list:
   * somebody filling in a form top to bottom wants to know what to do next, not
   * an inventory of everything they have not reached yet.
   */
  const blocking = (() => {
    if (lookups.loading) return "Sedang memuat data.";
    if (!customerId) return "Pilih pelanggan dulu.";
    if (!branchId) return "Pilih cabang dulu.";
    if (lines.length === 0 && bookingIds.length === 0)
      return "Tambah minimal satu baris atau pilih booking.";
    if (hasProductLine && !warehouseId)
      return "Pilih gudang — ada barang yang harus dikeluarkan.";
    if (lines.some((line) => !line.qty || Number(line.qty) <= 0))
      return "Ada baris yang jumlahnya belum diisi.";
    /*
      EVERY SERVICE NAMES ITS ANIMAL — PCR-035, and it is a refusal rather than a
      nudge. A grooming billed with no pet reaches no day sheet: nobody is
      assigned, and the only record that the work is owed is a line on a bill the
      customer takes home. Letting it through means the invoice is right and the
      work quietly disappears.

      SAID SEPARATELY WHEN THE CUSTOMER HAS NO ANIMALS AT ALL, because the two
      are different jobs: one is a field left blank, the other is a pet that has
      to be registered first, and "Ada baris jasa yang belum dipilih hewannya"
      in front of an empty dropdown is an instruction nobody can follow.
    */
    /*
      ⚠️ AN ANTAR-JEMPUT ROW ANSWERS THIS DIFFERENTLY (24 September 2026). It
      has no `petId` — one van carries several animals, in `passengers` — and
      what it is missing is a whole journey, not a dropdown. Asked first, so a
      ride row is never told to "pilih hewannya" over a cell that has no picker.
    */
    const needsJourney = lines.find(
      (line) =>
        line.kind === "service" &&
        !line.parentKey &&
        isRideService(line.refId) &&
        (!line.ride || line.passengers.length === 0),
    );

    if (needsJourney) {
      return petOptions.length === 0
        ? "Pelanggan ini belum punya hewan — daftarkan dulu di Master Data."
        : `Atur perjalanan ${needsJourney.name} dulu — arah, alamat dan hewan yang ikut.`;
    }

    const unpinnedRide = lines.find((line) => {
      const ends = endsOf(line);
      return ends !== null && (!pinOf(ends.origin) || !pinOf(ends.destination));
    });

    if (unpinnedRide) {
      return `Alamat ${unpinnedRide.name} belum punya titik lokasi — tarifnya dihitung dari jarak yang ditempuh.`;
    }

    if (
      lines.some(
        (line) => line.kind === "service" && !line.petId && !line.ride,
      )
    ) {
      return petOptions.length === 0
        ? "Pelanggan ini belum punya hewan — daftarkan dulu di Master Data."
        : "Ada baris jasa yang belum dipilih hewannya.";
    }

    /* Before `unpriced`, and in its own words: the price is known, the variant
       is switched off — "tambahkan variannya" would be the wrong instruction. */
    const inactive = lines.find(variantInactive);

    if (inactive) {
      const pet = pets.items.find((one) => one._id === inactive.petId);
      return `Varian ${inactive.name} untuk ${pet?.name ?? "hewan ini"} sedang nonaktif — pilih layanan lain atau aktifkan variannya di katalog.`;
    }

    /*
      A LINE NOBODY CAN PRICE IS BLOCKED HERE, not at the server. The animal is
      chosen and the service is priced by a fact it does not carry — a size
      nobody recorded — so the save would come back
      `items[0].unitPrice is not a valid amount`, about a field the person
      filling this form never touched. Naming the animal and the fact is the
      difference between a dead end and a next step.
    */
    const unpriced = lines.find(
      (line) =>
        line.kind === "service" &&
        (line.petId || line.ride) &&
        line.unitPrice === "0",
    );

    if (unpriced) {
      const pet = pets.items.find((one) => one._id === unpriced.petId);
      const lookup = quoteOf(unpriced);
      const missing = lookup.missingAxis;

      /*
        ⚠️ A RIDE'S ZONE IS ITS OWN JOURNEY'S, not the bill's, so `quoteOf`
        cannot explain it — it measures branch to customer record. Both ends are
        pinned by the time this is reached (the check above), so what is left is
        a fare the catalogue has no band for.
      */
      if (unpriced.ride) {
        const zone = (() => {
          const ends = endsOf(unpriced);
          const from = ends && pinOf(ends.origin);
          const to = ends && pinOf(ends.destination);
          return from && to ? variant.zoneBetween(from, to) : null;
        })();

        if (zone && !zone.ok) {
          return `${variant.zoneTextOf(zone)} — tarif '${unpriced.name}' ditentukan dari zona.`;
        }

        return `'${unpriced.name}' belum punya tarif untuk perjalanan ini. Tambahkan variannya di katalog.`;
      }

      if (missing) {
        return `Lengkapi ${AXIS_LABEL[missing]} ${pet?.name ?? "hewannya"} dulu — harga '${unpriced.name}' ditentukan dari situ.`;
      }

      /*
        BEYOND THE PET (17 September 2026): the customer's zone cannot be said,
        or a "Dipilih staf" value is not chosen yet — the server's sentence,
        word for word. Not while the cards and zones are still arriving, when
        either would be a claim about data this form has not read yet.
      */
      if (lookup.missingZone || lookup.missingChoice) {
        if (variant.loading) return "Sedang memuat data.";

        const service = serviceOf(unpriced.refId);
        const beyond = service ? variant.problemOf(service, lookup) : null;
        if (beyond) return `${beyond}.`;
      }

      return `'${unpriced.name}' belum punya harga untuk ${pet?.name ?? "hewan ini"}. Tambahkan variannya di katalog.`;
    }

    /*
      A HALF-FILLED CHARGE, named by the half that is missing. A row left
      entirely blank is not a charge and is simply not sent; one with an amount
      and no name, or a name and nothing to charge, would bill something the
      customer cannot read — and the server refuses a zero anyway.
    */
    const unnamed = filledCharges.find((charge) => charge.label === "");

    if (unnamed) {
      return `Beri nama biaya lain yang nominalnya ${formatMoney(unnamed.amount)}.`;
    }

    const nothingToCharge = filledCharges.find(
      (charge) => !(Number(charge.amount) > 0),
    );

    if (nothingToCharge) {
      return `Isi nominal ${nothingToCharge.label} — harus lebih dari 0.`;
    }

    return null;
  })();

  /**
   * A scanned product, as a row — or one more of it.
   *
   * ONE MORE ON THE ROW ALREADY THERE, not a second row: scanning the same bag
   * twice means two bags, which is the till's rule too, and the add dialog
   * hides a product the bill already carries for the same reason.
   *
   * A FUNCTIONAL UPDATE, because a scanner fires faster than React renders —
   * two scans reading one stale `lines` would both find the product missing and
   * add it twice.
   */
  function addScannedProduct(product: Product) {
    setLines((current) => {
      const at = current.findIndex(
        (line) => line.kind === "product" && line.refId === product._id,
      );

      if (at === -1) {
        return [
          ...current,
          {
            kind: "product",
            refId: product._id,
            name: product.name,
            sku: product.sku,
            unitPrice: String(product.sellPrice ?? "0"),
            qty: "1",
            discountMode: "percent",
            discountValue: "",
            petId: "",
            key: nextLineKey(),
            parentKey: null,
            choices: [],
            ride: null,
            passengers: [],
          },
        ];
      }

      return current.map((line, index) =>
        index === at
          ? { ...line, qty: String((Number(line.qty) || 0) + 1) }
          : line,
      );
    });
  }

  /**
   * What the dialog ticked, as rows — products first, then services, each in
   * the order it was ticked.
   *
   * A PRODUCT'S PRICE COMES FROM THE PICKED PRODUCT, not from `lookups`. The
   * dialog searches the whole catalogue on the server; the lookups hold only the
   * first hundred, so a product found past them would have read Rp 0. Shown
   * read-only — the same figure the server reads again when it prices the
   * invoice.
   */
  function addItems(picked: { products: Product[]; services: Service[] }) {
    const rows: DraftLine[] = [
      ...picked.products.map((product) => ({
        kind: "product" as const,
        refId: product._id,
        name: product.name,
        sku: product.sku,
        unitPrice: String(product.sellPrice ?? "0"),
        qty: "1",
        discountMode: "percent" as const,
        discountValue: "",
        petId: "",
        key: nextLineKey(),
        parentKey: null,
        choices: [],
        ride: null,
        passengers: [],
      })),
      ...picked.services.map((service) => ({
        kind: "service" as const,
        refId: service._id,
        name: service.name,
        sku: null,
        /*
          NOUGHT UNTIL AN ANIMAL IS CHOSEN, for a service priced by one. The row
          draws an em-dash rather than "Rp 0" — see the Harga cell — and
          `patchLine` re-derives this the moment the pet is picked.
        */
        unitPrice: priceOfService(service._id, ""),
        qty: "1",
        discountMode: "percent" as const,
        discountValue: "",
        petId: "",
        key: nextLineKey(),
        parentKey: null,
        choices: [],
        ride: null,
        passengers: [],
      })),
    ];

    setLines((current) => [...current, ...rows]);
  }

  /**
   * What a service costs FOR ONE ANIMAL — flat, or the variant matching its
   * species, size and coat.
   *
   * ─── A PRICE SNAPSHOTTED WHEN THE LINE WAS ADDED CANNOT BE RIGHT ───────────
   *
   * A service in variant mode carries no price of its own, and the animal is
   * chosen AFTER the line is added — so `found.price ?? "0"` wrote nought, the
   * row read Rp 0, and saving failed with
   * `items[0].unitPrice is not a valid amount`: a message about a field nobody
   * filled in. The figure has to be re-derived the moment the pet changes.
   *
   * A PREVIEW. The server prices the line again from the same animal, through
   * the same rule — see `utils/serviceVariant.ts`.
   */
  function priceOfService(refId: string, petId: string) {
    const service = lookups.services.find((one) => one._id === refId);
    const pet = pets.items.find((one) => one._id === petId);

    /* "0" KEEPS THE ROW ARITHMETIC HONEST while the answer is unknown — the row
       shows an em-dash of its own, and the save is blocked below. The zone and
       the row's choices are applied by `lines`, which prices every row again. */
    return variant.quote(service, pet).price ?? "0";
  }

  function patchLine(index: number, patch: Partial<DraftLine>) {
    if (patch.petId !== undefined) setLineRefusals({});

    setLines((current) => {
      const target = current[index];

      return current.map((line, at) => {
        /*
          AN ADD-ON FOLLOWS ITS SERVICE'S ANIMAL. It was ticked for that dog and
          priced for it; left on the old one it would bill Miko's perfume under
          Coco's bath.
        */
        const follows =
          patch.petId !== undefined &&
          target !== undefined &&
          line.parentKey === target.key;

        if (at !== index && !follows) return line;

        const next =
          at === index
            ? { ...line, ...patch }
            : { ...line, petId: patch.petId ?? "" };

        /*
          RE-PRICED WHEN THE ANIMAL CHANGES, because for a variant service that
          IS the price. Products are left alone — theirs does not depend on a
          pet, and was read from the picked product when the row was added.
        */
        return patch.petId === undefined || next.kind !== "service"
          ? next
          : { ...next, unitPrice: priceOfService(next.refId, next.petId) };
      });
    });
  }

  /** Takes a row off, and every add-on ticked under it with it. */
  function removeLine(index: number) {
    setLines((current) => {
      const target = current[index];

      return current.filter(
        (line, at) =>
          at !== index && (!target || line.parentKey !== target.key),
      );
    });
  }

  /**
   * The add-ons a row may offer — only on a MAIN service's own row, never on a
   * row that is itself an add-on (nesting is one deep, as on a booking), and
   * only those still in the active catalogue the form loaded.
   */
  function addonsOffered(line: DraftLine): Service[] {
    if (line.kind !== "service" || line.parentKey) return [];

    const service = lookups.services.find((one) => one._id === line.refId);
    if (!service || service.serviceType === "addon") return [];

    return (service.addonServiceIds ?? [])
      .map((id) => lookups.services.find((one) => one._id === id))
      .filter(
        (one): one is Service =>
          one !== undefined && one.serviceType === "addon",
      );
  }

  /**
   * Puts exactly these add-ons under one row — what the add-on dialog saved —
   * directly below it, in the dialog's order, on the row's animal.
   *
   * AN ADD-ON ALREADY ON THE BILL KEEPS ITS LINE, quantity and discount with
   * it; only a new one is priced here, for the row's animal. One missing from
   * the list comes off.
   *
   * LOOKED UP BY `key`, in a functional update: the save lands after the dialog
   * opened, and the rows may have moved since.
   */
  function setAddons(parentKey: string, addonIds: string[]) {
    setLines((current) => {
      const parent = current.find((line) => line.key === parentKey);
      if (!parent) return current;

      const existing = current.filter((line) => line.parentKey === parentKey);
      const children = addonIds.flatMap((id): DraftLine[] => {
        const kept = existing.find((line) => line.refId === id);
        if (kept) return [kept];

        const addon = lookups.services.find((one) => one._id === id);
        if (!addon) return [];

        return [
          {
            kind: "service",
            refId: addon._id,
            name: addon.name,
            sku: null,
            unitPrice: priceOfService(addon._id, parent.petId),
            // FREE TO CHANGE, like any line — decided 14 September 2026.
            qty: "1",
            discountMode: "percent",
            discountValue: "",
            petId: parent.petId,
            key: nextLineKey(),
            parentKey,
            choices: [],
            /*
              AN ADD-ON RIDES ON ITS SERVICE'S JOURNEY — it carries a copy so
              its shadow booking lands on the right one, since the server keys a
              line's booking by the direction too. It is never asked for one of
              its own.
            */
            ride: parent.ride,
            passengers: parent.passengers,
          },
        ];
      });

      const rest = current.filter((line) => line.parentKey !== parentKey);
      const at = rest.findIndex((line) => line.key === parentKey) + 1;

      return [...rest.slice(0, at), ...children, ...rest.slice(at)];
    });
  }

  /** One charge row typed into, found by its own `key`. */
  function patchCharge(key: string, patch: Partial<PosCharge>) {
    setCharges((current) =>
      current.map((charge) =>
        charge.key === key ? { ...charge, ...patch } : charge,
      ),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (blocking) return;

    setSaving(true);
    setLineRefusals({});

    try {
      const items: CreateInvoiceItemInput[] = lines.map((line) => ({
        kind: line.kind,
        refId: line.refId,
        qty: line.qty,
        discount: line.discountValue
          ? { mode: line.discountMode, value: line.discountValue }
          : null,
        /*
          OMITTED rather than sent as an empty string, which the server's
          objectId check would refuse with a validation error instead of the
          readable "a service has to say whose animal it is". Only reachable on a
          PRODUCT line — `blocking` above stops a service with no pet.
        */
        ...(line.petId ? { petId: line.petId } : {}),
        /*
          ─── THE JOURNEY, ON AN ANTAR-JEMPUT ROW ───────────────────────────

          Flat on the wire, nested in the document — the server translates it
          once. The van goes in `passengerPetIds` rather than `petId`, the same
          shape the booking it raises keeps its animals in.

          ⚠️ AN ADD-ON SENDS THE JOURNEY TOO, because the server keys a line's
          shadow booking by the direction — one without it would hang off a
          booking going the other way — but never its own links.
        */
        ...(line.ride
          ? {
              passengerPetIds: line.passengers,
              trip: tripInputOf(line),
              ...(line.parentKey
                ? {}
                : { linkedBookingIds: line.ride.linkedBookingIds }),
            }
          : {}),
        /*
          THE ROW'S OWN "DIPILIH STAF" VALUES, only when it has some. An add-on
          that asks nothing of its own inherits its service's on the server.
        */
        ...(line.kind === "service" && line.choices.length > 0
          ? { variantChoices: line.choices }
          : {}),
      }));

      const created = await customerInvoiceService.create({
        customerId,
        branchId,
        // Left out entirely when nothing ships: the server refuses a product
        // line with no warehouse, and sending one for a grooming bill would
        // claim goods left a shelf that nothing came off.
        ...(hasProductLine ? { warehouseId } : {}),
        items,
        ...(bookingIds.length > 0 ? { bookingIds } : {}),
        // Itemised and trimmed — blank rows dropped, left out when none remain.
        ...(filledCharges.length > 0 ? { otherCharges: filledCharges } : {}),
        ...(invoiceDiscountValue
          ? {
              invoiceDiscount: {
                mode: invoiceDiscountMode,
                value: invoiceDiscountValue,
              },
            }
          : {}),
        invoiceDate: new Date(invoiceDate).toISOString(),
        termDays: Number(termDays),
        channel,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });

      // Released before navigating: a partial failure leaves this form mounted,
      // and a button locked forever is worse than the error that locked it.
      setSaving(false);
      router.push(`${LIST_PATH}/${created._id}`);
      swalToast(`Faktur ${created.invoiceNumber} tersimpan.`);
    } catch (error) {
      /*
        A REFUSAL ABOUT ONE ROW IS ALSO SAID ON THAT ROW (17 September 2026) —
        a zone the customer's pin cannot answer, a card nobody chose. The toast
        still carries it; the row is where it gets fixed.
      */
      if (error instanceof ApiError) {
        const found = lineRefusalOf(error);
        const optionId = found?.refusal.optionId;
        const target = !found
          ? undefined
          : found.index !== null
            ? lines[found.index]
            : optionId
              ? (lines.find(
                  (line) =>
                    cardsOf(line).some((card) => card.axisKey === optionId) &&
                    !hasChoice(line.choices, optionId),
                ) ??
                lines.find((line) =>
                  cardsOf(line).some((card) => card.axisKey === optionId),
                ))
              : undefined;

        if (found && target) {
          setLineRefusals({ [target.key]: found.refusal });
        }
      }

      // 8 seconds, not the default 3 — every refusal here carries an
      // instruction: which branch has no code, which product is short.
      swalToast(
        error instanceof ApiError
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  if (lookups.loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (lookups.error) {
    return <Alert variant="error">{lookups.error}</Alert>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* Buttons only, no title card: the page heading already says "Faktur
          baru", and the number is allocated by the server on save, so the bar
          has nothing else worth carrying. Decided 11 Sep 2026 — ui-rules §16. */}
      <FormActionBar
        submitLabel="Simpan faktur"
        submitting={saving}
        disabled={blocking !== null}
        blockedReason={blocking ?? undefined}
        cancelHref={LIST_PATH}
      />

      <Card
        title="Keterangan faktur"
        description="Siapa yang ditagih, dari cabang mana, dan kapan jatuh temponya."
      >
        <div className="flex flex-col gap-4">
          {/* THE MOCKUP'S ORDER, not §16's — Pelanggan first, then Cabang ·
              Gudang, Tanggal · Jatuh tempo, Channel. Decided 12 Sep 2026 on
              request; recorded in ui-rules §16. */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Full width on its own — customer names run long, and the phone
                rides beside each one. */}
            <FilterSelect
              layout="form"
              label="Pelanggan"
              ariaLabel="Pelanggan"
              value={customerId}
              options={customerOptions}
              active={false}
              required
              searchable
              placeholder="Cari nama pelanggan…"
              searchPlaceholder="Cari nama atau nomor HP…"
              hint="Cari lalu pilih — nomor HP ditampilkan supaya tidak salah pilih kalau ada nama yang sama."
              disabled={saving}
              className="sm:col-span-2"
              onChange={(value) => {
                if (value === customerId) return;
                setCustomerId(value);
                // Every booking on offer belonged to the previous customer.
                // Keeping one would bill this person for somebody else's grooming
                // — which the server refuses, but only after the form was filled
                // in.
                setPulledBookings([]);
                /*
                AND EVERY ANIMAL NAMED ON A LINE, for the same reason one step
                further in: a cat picked under the previous customer would raise
                a booking against somebody else's pet. The server refuses that
                — it is the check `booking.service.js` calls the one that matters
                most — but only after the whole form has been filled in.
              */
                setLines((current) =>
                  current.map((line) => ({ ...line, petId: "" })),
                );
              }}
            />

            <FilterSelect
              layout="form"
              label="Cabang"
              ariaLabel="Cabang"
              value={branchId}
              options={namedOptions(lookups.branches)}
              active={false}
              required
              placeholder="Pilih cabang"
              disabled={saving}
              onChange={(value) => {
                if (value === branchId) return;
                setBranchId(value);
                // Every warehouse on offer belonged to the old branch. Keeping
                // one would name a shelf these books never held.
                setWarehouseId("");
              }}
            />

            <FilterSelect
              layout="form"
              label="Gudang"
              ariaLabel="Gudang"
              value={warehouseId}
              options={namedOptions(warehousesHere)}
              active={false}
              // Required only once something ships — a grooming-only bill takes
              // nothing off a shelf, and the save omits the warehouse for it.
              required={hasProductLine}
              placeholder={
                branchId === "" ? "Pilih cabang dulu" : "Pilih gudang"
              }
              hint={
                hasProductLine
                  ? undefined
                  : "Belum perlu — belum ada baris barang."
              }
              // Nothing to offer until a branch is named: the list IS that
              // branch's shelves plus the central ones.
              disabled={saving || branchId === ""}
              onChange={setWarehouseId}
            />

            <TextField
              label="Tanggal faktur"
              name="invoiceDate"
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              disabled={saving}
              required
            />

            <TextField
              label="Jatuh tempo"
              name="termDays"
              type="number"
              min={0}
              value={termDays}
              onChange={(event) => setTermDays(event.target.value)}
              hint="Hari sejak tanggal faktur. 0 berarti jatuh tempo hari ini."
              disabled={saving}
            />

            <FilterSelect
              layout="form"
              label="Channel"
              ariaLabel="Channel"
              value={channel}
              options={CHANNEL_OPTIONS}
              active={false}
              disabled={saving}
              onChange={(value) => setChannel(value as InvoiceChannel)}
            />
          </div>

          {/* CATATAN CLOSES THE HEADER, above the rows. */}
          <TextareaField
            label="Catatan"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opsional…"
            disabled={saving}
          />
        </div>
      </Card>

      {/*
        BOOKINGS BEFORE THE TYPED LINES, which is the order somebody fills this
        in: pull what has already happened, then add anything else onto the same
        bill. Hidden entirely until a customer is chosen — "which bookings" has
        no meaning until "whose" is answered.
      */}
      {customerId && (
        <Card
          title="Hewan & booking pelanggan ini"
          description="Booking yang sudah dikonfirmasi dan belum ditagih. Harganya mengikuti yang dikutip saat booking dibuat."
        >
          <InvoiceBookingPanel
            /* A different customer is a different panel — see its own note. */
            key={customerId}
            customerId={customerId}
            selected={bookingIds}
            onChange={setPulledBookings}
            disabled={saving}
          />
        </Card>
      )}

      <Card
        title="Baris faktur"
        description="Harga diambil dari katalog dan tidak bisa diubah di sini."
      >
        {/* The same dialog the stock documents and receipts open, with a Jasa
            tab beside the product picker. Portaled, so none of its buttons
            sit inside this form's DOM and none can submit it. */}
        {picking && (
          <InvoiceAddItemsDialog
            services={lookups.services}
            existingProductIds={lines
              .filter((line) => line.kind === "product")
              .map((line) => line.refId)}
            onAdd={addItems}
            onClose={() => setPicking(false)}
          />
        )}

        {/*
          THE JOURNEY OF ONE ROW — direction, two doors, the van and the
          bookings it serves. Mounted only while a row is being filled in: it
          asks the customer's diary the moment its switch is turned on, and a
          permanently mounted one would do that for every bill.

          AN ADD-ON GOES WITH ITS SERVICE, so saving rewrites the children too —
          they carry a copy of the journey for the server's own booking key.
        */}
        {rideRow && (
          <RideJourneyDialog
            open
            serviceName={lines.find((line) => line.key === rideRow)?.name ?? ""}
            pets={pets.forCustomer === customerId ? pets.items : []}
            customerId={customerId}
            customer={customerRecord}
            branch={branchRecord}
            value={(() => {
              const row = lines.find((line) => line.key === rideRow);
              return row?.ride
                ? { passengerPetIds: row.passengers, journey: row.ride }
                : null;
            })()}
            perAnimal={
              serviceOf(lines.find((line) => line.key === rideRow)?.refId ?? "")
                ?.billingUnit === "per_pet"
            }
            alreadyHere={bookingIds}
            alreadyHereLabel="Sudah ada di faktur ini."
            busy={saving}
            onOpenChange={(next) => {
              if (!next) setRideRow(null);
            }}
            onSave={({ passengerPetIds, journey }) => {
              setLines((current) =>
                current.map((line) =>
                  line.key === rideRow || line.parentKey === rideRow
                    ? {
                        ...line,
                        passengers: passengerPetIds,
                        /* An add-on keeps the journey but never the links —
                           the fare's multiplier is the main row's. */
                        ride:
                          line.parentKey === rideRow
                            ? { ...journey, linkedBookingIds: [] }
                            : journey,
                      }
                    : line,
                ),
              );
              setRideRow(null);
            }}
          />
        )}

        <div className="flex flex-col gap-4">
          {/* Scanned products — by their own barcode or a lot's label — land
              straight on the bill. A counter scanner types into the field, the
              camera opens beside it. The warehouse goes along because a lot
              lives in one, and must live in this invoice's. */}
          <InvoiceBarcodeScan
            onProduct={addScannedProduct}
            warehouseId={warehouseId}
            warehouseName={
              lookups.warehouses.find((one) => one._id === warehouseId)?.name
            }
            disabled={saving}
          />

          {lines.length === 0 && pulledBookings.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <UIButton
                type="button"
                variant="secondary"
                onClick={() => setPicking(true)}
                disabled={saving}
              >
                + Tambah barang atau jasa
              </UIButton>

              <div>
                <p className="font-medium text-foreground">Belum ada baris</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  Cari dan centang beberapa barang atau jasa sekaligus —
                  harganya diambil dari katalog.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      {/* ONLY WHEN THERE IS A SERVICE ON THE BILL. A column of
                        dashes on an invoice for two bags of food is a question
                        the reader never asked. */}
                      {/*
                      THE ASTERISK BELONGS TO THE COLUMN, not to each cell.

                      `FilterField` draws it beside a label, and the control in
                      this row is passed `label=""` — the column header IS its
                      visible label. So `required` produced a lone red `*`
                      floating above every pet select, marking nothing. It says
                      the same thing once, where the name is.
                    */}
                      {hasServiceLine && (
                        <TableHead className="w-44">
                          Hewan
                          <span className="text-danger"> *</span>
                        </TableHead>
                      )}
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="w-28">Jumlah</TableHead>
                      <TableHead className="w-44">Diskon</TableHead>
                      <TableHead>Pajak</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingRows.map(
                      ({ booking, line, isAddon, isLast, at }) => {
                        const own = ownDiscountOfLine(line);
                        const share = bookingShareOf(booking);

                        return (
                          <Fragment
                            key={`${booking._id}-${isAddon ? (line as { itemId: string }).itemId : "main"}`}
                          >
                            {/*
                              ONE BOOKING, ONE BLOCK: no border between its own lines — the
                              rule is drawn only under its last row (the "Diskon booking" row
                              when it has one), where another booking or item begins. No
                              hover either, which would light up a single line of the block.
                            */}
                            <TableRow
                              className={cn(
                                "hover:bg-transparent",
                                !(isLast && !isPositive(share)) && "border-b-0",
                              )}
                            >
                              <TableCell>
                                {isAddon ? (
                                  <span className="flex items-start gap-1.5 pl-4">
                                    <CornerDownRight
                                      aria-hidden
                                      className="mt-0.5 size-4 shrink-0 text-muted"
                                    />
                                    <span>
                                      <span className="font-medium">
                                        {line.name}
                                      </span>
                                      <span className="block text-xs text-muted">
                                        Add-on
                                      </span>
                                    </span>
                                  </span>
                                ) : (
                                  <>
                                    <span className="font-medium">
                                      {line.name}
                                    </span>
                                    <span className="block text-xs text-muted tabular-nums">
                                      {`Booking ${booking.bookingNumber ?? "—"}`}
                                    </span>
                                  </>
                                )}
                              </TableCell>

                              <TableCell>
                                <span className="text-sm">
                                  {booking.petName ?? "Hewan terhapus"}
                                </span>
                              </TableCell>

                              <TableCell className="text-right tabular-nums">
                                {formatMoney(line.price)}
                              </TableCell>

                              <TableCell className="tabular-nums">1</TableCell>

                              {/* THE LINE'S OWN DISCOUNT only, as the booking card
                            draws it ("Diskon item"). The booking's share of
                            "Diskon seluruh booking" gets its own row below the
                            booking's last line, as on the card. Fixed when the
                            booking was made, so text rather than inputs. */}
                              <TableCell className="tabular-nums">
                                {own ? (
                                  <span className="text-xs text-success">
                                    −{formatMoney(own)}
                                  </span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </TableCell>

                              <TableCell className="tabular-nums">
                                {taxCell(at)}
                              </TableCell>

                              <TableCell className="text-right tabular-nums">
                                {formatMoney(preview.lineTotals[at])}
                              </TableCell>

                              <TableCell>
                                {/* ON THE MAIN ROW ONLY: a booking comes off whole,
                              add-ons with it, and goes back to the panel. */}
                                {!isAddon && (
                                  <UIButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Hapus booking ${booking.bookingNumber ?? line.name}`}
                                    onClick={() =>
                                      setPulledBookings((current) =>
                                        current.filter(
                                          (one) => one._id !== booking._id,
                                        ),
                                      )
                                    }
                                    disabled={saving}
                                  >
                                    <Trash2 className="size-4 text-danger" />
                                  </UIButton>
                                )}
                              </TableCell>
                            </TableRow>
                            {isLast && isPositive(share) && (
                              <TableRow className="hover:bg-transparent">
                                <TableCell className="pl-4 text-sm text-success">
                                  Diskon booking
                                </TableCell>
                                <TableCell />
                                <TableCell />
                                <TableCell />
                                <TableCell className="tabular-nums">
                                  <span className="text-xs text-success">
                                    −{formatMoney(share)}
                                  </span>
                                </TableCell>
                                <TableCell />
                                <TableCell />
                                <TableCell />
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      },
                    )}
                    {lines.map((line, index) => {
                      const offered = addonsOffered(line);
                      const linePet = pets.items.find(
                        (one) => one._id === line.petId,
                      );
                      const lineQuote =
                        line.kind === "service" ? quoteOf(line) : null;
                      const lineService =
                        line.kind === "service"
                          ? serviceOf(line.refId)
                          : undefined;
                      /*
                        THE ROW'S PRICE BEYOND THE PET — its "Dipilih staf"
                        selects, the customer's zone, and why a quote cannot be
                        made. Nothing for a row that asks none of these.
                      */
                      const variantControls = lineService && lineQuote && (
                        <InvoiceLineVariant
                          cards={cardsOf(line)}
                          choices={line.choices}
                          onChange={(next) => setChoices(line.key, next)}
                          /*
                            A RIDE'S ZONE IS ITS OWN JOURNEY'S — measured
                            between the two doors it drives, not between the
                            branch and the customer's record. The bill's would
                            be a different distance for a different trip.
                          */
                          /*
                            A RIDE'S ZONE IS ITS OWN JOURNEY'S — measured
                            between the two doors it drives, not between the
                            branch and the customer's record.

                            ⚠️ AND NOTHING AT ALL UNTIL THERE IS A JOURNEY. The
                            bill's zone was drawn there while the row was still
                            empty, so a ride nobody had routed yet announced
                            "Koordinat alamat pelanggan belum diisi" — about a
                            pin its fare will never be measured from.
                          */
                          zoneText={
                            !variant.needsZone([lineService])
                              ? null
                              : isRideService(line.refId)
                                ? (() => {
                                    const ends = endsOf(line);
                                    const from = ends && pinOf(ends.origin);
                                    const to = ends && pinOf(ends.destination);
                                    return from && to
                                      ? variant.zoneTextOf(
                                          variant.zoneBetween(from, to),
                                        )
                                      : null;
                                  })()
                                : variant.zoneText
                          }
                          problem={
                            line.petId && !variant.loading
                              ? variant.problemOf(lineService, lineQuote)
                              : null
                          }
                          refusal={lineRefusals[line.key] ?? null}
                          disabled={saving}
                        />
                      );

                      return (
                        <TableRow key={line.key}>
                          <TableCell>
                            {line.parentKey ? (
                              /* UNDER ITS SERVICE, and marked — one visit, not a
                               second grooming to read. */
                              <div className="flex items-start gap-1.5 pl-4">
                                <CornerDownRight
                                  aria-hidden
                                  className="mt-0.5 size-4 shrink-0 text-muted"
                                />
                                <div>
                                  <span className="font-medium">
                                    {line.name}
                                  </span>
                                  <span className="block text-xs text-muted">
                                    Add-on
                                  </span>
                                  {variantControls}
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="font-medium">{line.name}</span>
                                <span className="block text-xs text-muted">
                                  {line.sku ?? "Jasa"}
                                </span>
                                {stockNote(line)}
                                {variantControls}
                                {offered.length > 0 && (
                                  <InvoiceAddonPicker
                                    idPrefix={line.key}
                                    serviceName={line.name}
                                    /*
                                      ⚠️ AN ANTAR-JEMPUT ROW HAS NO `petId` —
                                      its animals are the van's — so who it is
                                      for is read from the passengers instead.
                                      Gated on the pet, every ride's add-ons sat
                                      behind "Pilih hewan dulu" over a cell with
                                      no pet picker in it.
                                    */
                                    whose={whoseRow(line)}
                                    pet={linePet}
                                    pendingLabel={
                                      line.ride || isRideService(line.refId)
                                        ? "Atur perjalanan dulu"
                                        : "Pilih hewan dulu"
                                    }
                                    offered={offered}
                                    quoteOf={(addon) =>
                                      /* A van is quoted by where it goes, not
                                         by an animal — see `fareOf`. */
                                      line.ride
                                        ? rideAddonQuote(line, addon)
                                        : variant.quote(addon, linePet, line.choices)
                                    }
                                    problemOf={variant.problemOf}
                                    tickedIds={lines
                                      .filter(
                                        (one) => one.parentKey === line.key,
                                      )
                                      .map((one) => one.refId)}
                                    onSave={(addonIds) =>
                                      setAddons(line.key, addonIds)
                                    }
                                    disabled={saving}
                                  />
                                )}
                              </>
                            )}
                          </TableCell>

                          {hasServiceLine && (
                            <TableCell>
                              {line.parentKey ? (
                                /* THE SERVICE'S ANIMAL, not a choice of its own —
                                 it changes on the service's row, and follows. */
                                <>
                                  <span className="text-sm">
                                    {linePet?.name ?? "—"}
                                  </span>
                                  <MissingFactNote
                                    line={line}
                                    pet={linePet ?? null}
                                    missing={lineQuote?.missingAxis ?? null}
                                  />
                                </>
                              ) : line.kind === "service" && line.ride !== null ? (
                                /*
                                  ─── A JOURNEY, NOT AN ANIMAL ───────────────

                                  An antar-jemput row carries a whole van and
                                  the two doors it drives between; none of that
                                  fits in a cell beside a quantity and a price.
                                  The cell says where it goes and who is in it,
                                  and the questions live in a dialog.

                                  AN ADD-ON ON A RIDE shows the same summary
                                  READ-ONLY: it rides on its service's journey
                                  and has none of its own to change.
                                */
                                <RideSummary
                                  line={line}
                                  pets={pets.items}
                                  disabled={saving}
                                  onEdit={
                                    line.parentKey
                                      ? null
                                      : () => setRideRow(line.key)
                                  }
                                />
                              ) : line.kind === "service" && isRideService(line.refId) ? (
                                /*
                                  NOT FILLED IN YET — the row has no price and
                                  no journey until this is answered.

                                  A DISABLED BUTTON SAYS WHY (24 September
                                  2026, on request). The animals in the van and
                                  the bookings it may fetch for are the
                                  CUSTOMER's, so there is nothing to ask until
                                  one is named — and a greyed button with no
                                  sentence beside it is how somebody presses it
                                  three times.
                                */
                                <div className="flex flex-col items-start gap-1">
                                  <UIButton
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={saving || !customerId}
                                    onClick={() => setRideRow(line.key)}
                                  >
                                    Atur perjalanan
                                  </UIButton>
                                  {!customerId && (
                                    <span className="text-xs text-muted">
                                      Pilih pelanggan dulu.
                                    </span>
                                  )}
                                </div>
                              ) : line.kind === "service" ? (
                                <>
                                  {/*
                                  WHY IT IS HERE AT ALL — PCR-035. A grooming
                                  billed with no animal named reaches no day
                                  sheet: nobody is assigned, and the only record
                                  that the work is owed is this line on a bill
                                  the customer takes home. Naming the animal is
                                  what lets the server raise a booking for it.
                                */}
                                  <FilterSelect
                                    /*
                                `field`, NOT `form` — §16: a control inside a row
                                table sits among h-9 inputs, and 44px would tower
                                over the row it belongs to. The column header is
                                the visible label, so the control carries only an
                                aria one, naming the line it belongs to.
                              */
                                    layout="field"
                                    label=""
                                    ariaLabel={`Hewan untuk ${line.name}`}
                                    value={line.petId}
                                    options={petOptions}
                                    placeholder={
                                      !customerId
                                        ? "Pilih pelanggan dulu"
                                        : petOptions.length === 0
                                          ? "Belum ada hewan"
                                          : "Pilih hewan"
                                    }
                                    // Answered fields must not go navy in a form —
                                    // that announces a filter (§16).
                                    active={false}
                                    disabled={
                                      !customerId || petOptions.length === 0
                                    }
                                    onChange={(value) =>
                                      patchLine(index, { petId: value })
                                    }
                                  />
                                  <MissingFactNote
                                    line={line}
                                    pet={linePet ?? null}
                                    missing={lineQuote?.missingAxis ?? null}
                                  />
                                </>
                              ) : (
                                // A collar has no grooming; the server refuses a pet
                                // on a product line rather than ignoring it.
                                <span className="text-xs text-muted">—</span>
                              )}
                            </TableCell>
                          )}

                          {/* READ-ONLY, and it is a rule: a price a client can set is
                          a discount nobody approved. */}
                          <TableCell className="text-right tabular-nums">
                            {/*
                          AN EM-DASH, NOT "Rp 0", while a variant service has no
                          animal on its line. Nought is a price somebody could
                          read as free; the dash says the question has not been
                          answered yet, and the Hewan cell beside it is the
                          question.
                        */}
                            {line.kind === "service" &&
                            line.unitPrice === "0" ? (
                              <span className="text-muted">—</span>
                            ) : (
                              formatMoney(line.unitPrice)
                            )}
                            {/* The row the blocking sentence is about, in words. */}
                            {variantInactive(line) && (
                              <span className="block text-xs text-warning">
                                Varian nonaktif
                              </span>
                            )}
                          </TableCell>

                          <TableCell>
                            <Input
                              aria-label={`Jumlah ${line.name}`}
                              value={line.qty}
                              inputMode="decimal"
                              onChange={(event) =>
                                patchLine(index, { qty: event.target.value })
                              }
                              disabled={saving}
                            />
                          </TableCell>

                          <TableCell>
                            <div className="flex gap-1">
                              <select
                                aria-label={`Jenis diskon ${line.name}`}
                                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                                value={line.discountMode}
                                onChange={(event) =>
                                  patchLine(index, {
                                    discountMode: event.target
                                      .value as InvoiceDiscountMode,
                                  })
                                }
                                disabled={saving}
                              >
                                <option value="percent">%</option>
                                <option value="amount">Rp</option>
                              </select>
                              <Input
                                aria-label={`Diskon ${line.name}`}
                                value={line.discountValue}
                                inputMode="decimal"
                                placeholder="0"
                                onChange={(event) =>
                                  patchLine(index, {
                                    discountValue: event.target.value,
                                  })
                                }
                                disabled={saving}
                              />
                            </div>
                            {/* OFFSET PAST THE BOOKING LINES, which the preview
                              prices first — the server's order. Reading
                              `[index]` put a booking's figures on the first
                              typed row whenever one was pulled. */}
                            {preview.lineDiscounts[
                              bookingLines.length + index
                            ] !== "0.0000" && (
                              <span className="mt-1 block text-xs text-success">
                                −
                                {formatMoney(
                                  preview.lineDiscounts[
                                    bookingLines.length + index
                                  ],
                                )}
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="tabular-nums">
                            {taxCell(bookingLines.length + index)}
                          </TableCell>

                          <TableCell className="text-right tabular-nums">
                            {formatMoney(
                              preview.lineTotals[bookingLines.length + index],
                            )}
                          </TableCell>

                          <TableCell>
                            <UIButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Hapus ${line.name}`}
                              onClick={() => removeLine(index)}
                              disabled={saving}
                            >
                              <Trash2 className="size-4 text-danger" />
                            </UIButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="border-t border-border/60 pt-3">
                <UIButton
                  type="button"
                  variant="secondary"
                  onClick={() => setPicking(true)}
                  disabled={saving}
                >
                  + Tambah barang atau jasa
                </UIButton>
              </div>
            </>
          )}

          {/*
            THE RECAP, UNDER THE ROWS IT ADDS UP — no card of its own since 14
            September 2026, on request and matching the BO mockup (ui-rules §16).
            Right-aligned, the way the detail page draws its own.

            ALWAYS SHOWN, even before the first row: pulled bookings count
            toward it, and the sentence under it says how the prices were set.
          */}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <dl className="flex w-full flex-col gap-2 self-end text-sm sm:w-96">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">
                  {formatMoney(preview.subtotal)}
                </dd>
              </div>
              {/* The lines' own discounts — the bookings' shares follow. */}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Diskon baris</dt>
                {/* Green, as the till draws a discount. */}
                <dd className="tabular-nums text-success">
                  −
                  {formatMoney(
                    subtractDecimals(preview.itemDiscount, bookingShares),
                  )}
                </dd>
              </div>
              {isPositive(bookingShares) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Diskon booking</dt>
                  <dd className="tabular-nums text-success">
                    −{formatMoney(bookingShares)}
                  </dd>
                </div>
              )}
              {/* TYPED IN ITS OWN ROW, as the mockup draws it. What it comes
                  to shows in the Total below — no line of its own under the
                  field (removed 14 Sep 2026 on request). */}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Diskon faktur</dt>
                <dd>
                  <div className="flex gap-1">
                    <select
                      aria-label="Jenis diskon faktur"
                      className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                      value={invoiceDiscountMode}
                      onChange={(event) =>
                        setInvoiceDiscountMode(
                          event.target.value as InvoiceDiscountMode,
                        )
                      }
                      disabled={saving}
                    >
                      <option value="percent">%</option>
                      <option value="amount">Rp</option>
                    </select>
                    <Input
                      aria-label="Diskon faktur"
                      className="h-9 w-28 text-right tabular-nums"
                      value={invoiceDiscountValue}
                      inputMode="decimal"
                      placeholder="0"
                      onChange={(event) =>
                        setInvoiceDiscountValue(event.target.value)
                      }
                      disabled={saving}
                    />
                  </div>
                </dd>
              </div>

              {/*
                OTHER CHARGES — ongkir, packaging — one editable row each, under
                the discount they are added after (14 September 2026, the BO
                mockup and the till's "biaya lain"). Taxed like a line, so they
                sit above Dasar pengenaan pajak.

                NOTHING TO CONFIRM (decided 14 September 2026 on request): a row
                counts toward the total as it is typed, and "+ Tambah biaya lain"
                simply puts the next one on.

                EACH ROW AND THE LINK KEEP A `dt` OF THEIR OWN, visually hidden:
                a `dl` group holds a term and its details, and bare inputs in one
                are invalid markup a screen reader stumbles over.
              */}
              {charges.map((charge, index) => (
                <div key={charge.key}>
                  <dt className="sr-only">{`Biaya lain ${index + 1}`}</dt>
                  <dd className="flex items-center gap-1">
                    <Input
                      aria-label={`Nama biaya ${index + 1}`}
                      placeholder="Ongkos kirim"
                      className="h-9 flex-1"
                      value={charge.label}
                      onChange={(event) =>
                        patchCharge(charge.key, { label: event.target.value })
                      }
                      disabled={saving}
                    />
                    <Input
                      aria-label={`Nominal biaya ${index + 1}`}
                      placeholder="10000"
                      inputMode="numeric"
                      className="h-9 w-28 text-right tabular-nums"
                      value={charge.amount}
                      onChange={(event) =>
                        patchCharge(charge.key, {
                          /* DIGITS ONLY. In Indonesian "10.000" is ten
                             thousand; kept as typed it would be read as ten. */
                          amount: event.target.value.replace(/\D/g, ""),
                        })
                      }
                      disabled={saving}
                    />
                    <UIButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Hapus biaya lain ${index + 1}`}
                      onClick={() =>
                        setCharges((current) =>
                          current.filter((one) => one.key !== charge.key),
                        )
                      }
                      disabled={saving}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </UIButton>
                  </dd>
                </div>
              ))}

              <div className="flex justify-end">
                <dt className="sr-only">Biaya lain</dt>
                <dd>
                  <UIButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCharges((current) => [
                        ...current,
                        { key: nextLineKey(), label: "", amount: "" },
                      ])
                    }
                    disabled={saving}
                  >
                    + Tambah biaya lain
                  </UIButton>
                </dd>
              </div>

              {/*
                THE ROW THAT MAKES THE LIST ADD UP. Without it the recap ran
                Subtotal Rp 100.000 → Total Rp 111.000 with nothing between them,
                and the sentence underneath was the only clue where the
                difference came from — a caption is not an explanation of an
                arithmetic a person is checking line by line.

                SHOWN ONLY WHERE TAX IS ADDED ON TOP. On inclusive pricing the tax
                is already inside the subtotal; a row reading "PPN Rp 0" there
                would deny a tax that was charged.
              */}
              {/*
                AND IT STANDS ON ITS BASE (14 September 2026, the BO mockup):
                Dasar pengenaan pajak directly above, under a dashed rule, so the
                PPN can be checked against what it was charged on. Where tax is
                added on top the base is exactly the total less that tax.
              */}
              {preview.taxAdded !== "0.0000" && (
                <div className="flex flex-col gap-2 border-t border-dashed border-border pt-2">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Dasar pengenaan pajak</dt>
                    <dd className="tabular-nums">
                      {formatMoney(
                        subtractDecimals(preview.grandTotal, preview.taxAdded),
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    {/* One template string, not `PPN {rate}%` — interpolation
                        splits it into three text nodes, which a screen reader
                        announces in pieces and a query cannot match as a label. */}
                    <dt className="text-muted">{`PPN ${lookups.tax.taxRate}%`}</dt>
                    <dd className="tabular-nums">
                      {formatMoney(preview.taxAdded)}
                    </dd>
                  </div>
                </div>
              )}

              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <dt>Total tagihan</dt>
                <dd className="tabular-nums">
                  {formatMoney(preview.grandTotal)}
                </dd>
              </div>
            </dl>

            {/* WHAT SAVING DOES — the BO mockup's own sentence, replacing the
                note about how the recap is computed (14 September 2026, on
                request). True to `#assertRevisable`: editable until a payment. */}
            <p className="text-xs text-muted">
              Faktur ini akan tersimpan berstatus Belum Lunas — masih bisa
              diedit sampai pembayaran pertama tercatat (lihat halaman Detail
              Faktur).
            </p>
          </div>
        </div>
      </Card>
    </form>
  );
}
