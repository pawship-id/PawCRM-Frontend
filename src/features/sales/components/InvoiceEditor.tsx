"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  Alert,
  FilterSelect,
  Spinner,
  TextField,
  namedOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useVariantQuote } from "@/features/services";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { petService } from "@/services/pet.service";
import {
  divideRound,
  formatMoney,
  isPositive,
  subtractDecimals,
  sumDecimals,
  toDecimalString,
  toMinor,
  trimDecimal,
  trimQty,
} from "@/utils/decimal";
import {
  AXIS_LABEL,
  variesByZone,
  type PriceLookup,
} from "@/utils/serviceVariant";
import type {
  CustomerInvoiceDetail,
  GeoLocation,
  InvoiceDiscountMode,
  Pet,
  UpdateCustomerInvoiceInput,
  VariantChoice,
} from "@/types/api";

import { arahCardOf, choicesForLeg } from "@/features/antar-jemput/ride";
import {
  pinOf,
  resolveLeg,
} from "@/features/antar-jemput/components/TripPointFields";
import { RideJourneyDialog } from "@/features/antar-jemput/components/RideJourneyDialog";
import type { RideJourney } from "@/features/antar-jemput/components/RideJourneyFields";

import { invoiceBookingShareOf } from "../bookingDiscount";
import { useInvoiceLookups } from "../hooks/useInvoiceLookups";
import { previewInvoice } from "../invoicePreview";
import {
  hasChoice,
  lineRefusalOf,
  variantSummary,
  type LineRefusal,
} from "../variantLine";
import { InvoiceLineVariant } from "./InvoiceLineVariant";

/** A line as the editor holds it. */
interface EditLine {
  /** Stable across re-renders — a row's index moves when one above is removed. */
  key: string;
  /** The stored line this continues, or null for a line added here. */
  fromIndex: number | null;
  kind: "product" | "service";
  refId: string;
  name: string;
  sku: string | null;
  unitPrice: string;
  qty: string;
  discountMode: InvoiceDiscountMode;
  discountValue: string;
  /** Set on a NEW service line; a kept line keeps the animal it was billed for. */
  petId: string;
  petName: string | null;
  /** Billed from a booking — one per animal, so the quantity is fixed at 1. */
  booked: boolean;
  /**
   * The line's part of "Diskon seluruh booking" — "0" on everything else
   * (16 September 2026). The discount fields hold the line's OWN discount; the
   * server adds this back on save, and the recap shows it as "Diskon booking".
   */
  bookingShare: string;
  /**
   * THE "DIPILIH STAF" VALUES CHOSEN on a line added here (17 September 2026),
   * sent as its `variantChoices`. Empty on a kept line — the server keeps what
   * that line was priced on, and never re-quotes it.
   */
  choices: VariantChoice[];
  /**
   * ─── THE JOURNEY A NEW ANTAR-JEMPUT ROW IS (24 September 2026) ───────────
   *
   * Which way the van goes, between which two doors, and the bookings it is
   * fetching for. Null on every other row, and on a KEPT one: the server keeps
   * what that line was agreed on and never re-asks.
   *
   * Asked in `RideJourneyDialog`, the same one the create form opens — none of
   * it fits in a cell beside a quantity and a price.
   */
  ride: RideJourney | null;
  /** Every animal in the van. A ride carries several off ONE row, charged once. */
  passengers: string[];
  /**
   * What a KEPT line was priced on beyond the pet — "Lokasi: Di Rumah · Zona
   * A" — shown read-only. Null on a new line and on one that asked nothing.
   */
  storedVariant: string | null;
}

const HUNDRED_MINOR = BigInt(100) * BigInt(10_000);

/**
 * What the line's own discount takes off `basisMinor` — the server's rule
 * (`utils/discount.js`): a percent half-up and never past 100, a rupiah amount
 * never past what it is taken from. Invalid or empty takes nothing.
 */
function ownDiscountMinor(
  basisMinor: bigint,
  mode: InvoiceDiscountMode,
  value: string,
): bigint {
  const typed = value === "" ? null : toMinor(value.replace(",", "."));
  if (typed === null || typed <= BigInt(0) || basisMinor <= BigInt(0)) return BigInt(0);

  const off =
    mode === "percent"
      ? divideRound(basisMinor * (typed > HUNDRED_MINOR ? HUNDRED_MINOR : typed), HUNDRED_MINOR)
      : typed;

  return off > basisMinor ? basisMinor : off;
}

/** Nobody has a hundred animals; this is a ceiling, not a page size. */
const MAX_PETS = 100;

const toDateInput = (iso: string) => iso.slice(0, 10);

let lineSeq = 0;
const nextKey = () => `baru-${(lineSeq += 1)}`;

/**
 * EDITING AN UNPAID INVOICE, inside its own Rincian card — the mockup's inline
 * edit, opened by "Ubah rincian".
 *
 * WHAT SAVING DOES, said beside the button rather than discovered afterwards:
 * the server reverses the current version's two journal entries and its stock,
 * then issues these lines as a new version — the number and the date stay. A
 * shop owner seeing a reversal pair appear in the ledger should already know why.
 *
 * WHAT CAN MOVE: quantities, discounts, lines added and taken off, the invoice
 * discount and the due date. WHAT CANNOT: the customer, the branch and the
 * date, which the number and the credit check are bound to.
 *
 * PRICES ARE NOT EDITABLE, deliberately, though the mockup draws an input there.
 * A kept line keeps the price it was billed at and a new line takes the
 * catalogue's — on screen and again on the server. A price a client can type is
 * a discount nobody approved, and the discount column already exists for the
 * ones somebody did.
 *
 * LOOKUPS LOAD ONLY WHEN EDITING STARTS, which is why this is behind a button
 * rather than inputs drawn on every unpaid invoice: the catalogue, the tenant's
 * tax rule and the customer's animals are three requests nobody reading the
 * invoice needs.
 *
 * THE TOTAL IS A PREVIEW, computed by `invoicePreview.ts` in the server's order.
 * The server prices everything again and is the authority.
 */
export function InvoiceEditor({
  invoice,
  onCancel,
  onSaved,
}: {
  invoice: CustomerInvoiceDetail;
  onCancel: () => void;
  onSaved: (updated: CustomerInvoiceDetail) => void;
}) {
  const lookups = useInvoiceLookups();

  const initialLines = useMemo<EditLine[]>(
    () =>
      (invoice.items ?? []).map((item, index) => {
        /*
          THE LINE'S OWN DISCOUNT IN THE FIELDS — the stored figure less its
          part of "Diskon seluruh booking", as the invoice's read view shows it.
          A line with a share holds a nominal figure by then, so its own part is
          shown in rupiah.
        */
        const share = invoiceBookingShareOf(item, invoice.bookings ?? []) ?? "0";
        const own =
          item.discount && isPositive(share)
            ? subtractDecimals(item.discount.resolvedAmount, share)
            : null;

        return {
          key: `simpan-${index}`,
          fromIndex: index,
          kind: item.kind,
          refId: item.refId,
          name: item.name,
          sku: item.sku,
          unitPrice: item.unitPrice,
          qty: trimQty(item.qty),
          discountMode:
            own !== null ? "amount" : (item.discount?.mode ?? "percent"),
          discountValue:
            own !== null
              ? isPositive(own)
                ? trimDecimal(own)
                : ""
              : item.discount
                ? trimDecimal(item.discount.value)
                : "",
          petId: item.petId ?? "",
          /* A KEPT LINE KEEPS WHAT IT WAS AGREED ON — the server never re-asks
             a revision for a journey it already stored. */
          ride: null,
          passengers: [],
          petName: item.petName,
          booked: Boolean(item.bookingId),
          bookingShare: share,
          choices: [],
          storedVariant: variantSummary(item),
        };
      }),
    [invoice.items, invoice.bookings],
  );

  const [draftLines, setLines] = useState<EditLine[]>(initialLines);
  /** The server's last refusal about one row, by the row's `key`. */
  const [lineRefusals, setLineRefusals] = useState<Record<string, LineRefusal>>(
    {},
  );
  const [picked, setPicked] = useState("");
  const [dueDate, setDueDate] = useState(toDateInput(invoice.dueDate));
  const [warehouseId, setWarehouseId] = useState(invoice.warehouseId ?? "");
  const [invoiceDiscountMode, setInvoiceDiscountMode] =
    useState<InvoiceDiscountMode>(invoice.invoiceDiscount?.mode ?? "percent");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState(
    invoice.invoiceDiscount ? trimDecimal(invoice.invoiceDiscount.value) : "",
  );
  const [saving, setSaving] = useState(false);
  /** The row whose journey is being filled in, by its `key`. */
  const [rideRow, setRideRow] = useState<string | null>(null);

  /*
    THE CUSTOMER'S ANIMALS, for a service line added here. BEST EFFORT AND
    SILENT WHEN IT FAILS — reading /api/pets takes `pets:read`, and the create
    form makes the same trade: without it no service can be added, and the
    blocking reason below says why.
  */
  const [pets, setPets] = useState<Pet[]>([]);

  useEffect(() => {
    if (!invoice.customerId) return;

    let active = true;

    petService
      .list({ customerId: invoice.customerId, isActive: true, limit: MAX_PETS })
      .then((result) => {
        if (active) setPets(result.items);
      })
      .catch(() => {
        if (active) setPets([]);
      });

    return () => {
      active = false;
    };
  }, [invoice.customerId]);

  const petOptions = useMemo(
    () => pets.map((pet) => ({ value: pet._id, label: pet.name })),
    [pets],
  );

  const serviceOf = (refId: string) =>
    lookups.services.find((one) => one._id === refId);

  /*
    PRICING BEYOND THE PET for a line ADDED here (17 September 2026): the
    customer's zone from the invoice's branch, and the "Dipilih staf" cards. A
    kept line is never re-quoted — the server keeps its stored snapshot.

    THE CUSTOMER'S PIN is read from the lookups when the customer is among them,
    and otherwise fetched — but only once a new line actually varies by Zona, so
    an edit that asks no zone costs no request.
  */
  const needsCustomerPin = draftLines.some(
    (line) =>
      line.fromIndex === null &&
      line.kind === "service" &&
      variesByZone(serviceOf(line.refId)),
  );
  const listedCustomer = lookups.customers.find(
    (one) => one._id === invoice.customerId,
  );
  const [fetchedPin, setFetchedPin] = useState<{
    forCustomer: string;
    location: GeoLocation | undefined;
  } | null>(null);

  useEffect(() => {
    const customerId = invoice.customerId;
    if (!customerId || lookups.loading || listedCustomer || !needsCustomerPin) {
      return;
    }
    if (fetchedPin?.forCustomer === customerId) return;

    let active = true;

    customerService
      .getById(customerId)
      .then((customer) => {
        if (active) {
          setFetchedPin({
            forCustomer: customerId,
            location: customer?.location,
          });
        }
      })
      .catch(() => {
        /* The zone line says the pin is missing — the honest answer. */
      });

    return () => {
      active = false;
    };
  }, [
    lookups.loading,
    listedCustomer,
    needsCustomerPin,
    fetchedPin,
    invoice.customerId,
  ]);

  const variant = useVariantQuote({
    branchPin: lookups.branches.find((one) => one._id === invoice.branchId)
      ?.location,
    customerPin:
      listedCustomer?.location ??
      (fetchedPin?.forCustomer === invoice.customerId
        ? fetchedPin.location
        : undefined),
  });

  const branchRecord =
    lookups.branches.find((one) => one._id === invoice.branchId) ?? null;
  const customerRecord =
    lookups.customers.find((one) => one._id === invoice.customerId) ?? null;

  /** Which rows are a journey — the one kind of service that asks for one. */
  const isRideService = (refId: string) =>
    serviceOf(refId)?.serviceKind === "pickup-delivery";

  /** A ride row's two ends, resolved against the registers it may copy from. */
  const endsOf = useCallback(
    (line: EditLine) =>
      line.ride ? resolveLeg(line.ride.points, customerRecord, branchRecord) : null,
    [customerRecord, branchRecord],
  );

  /**
   * WHAT A JOURNEY COSTS — measured between its OWN two ends, and multiplied by
   * the bookings the van serves when the fare is `per_pet`. Mirrors the server,
   * which measures the same two points. Null until both ends are pinned: a fare
   * is a band of distance.
   */
  const fareOf = useCallback(
    (line: EditLine): string | null => {
      const service = lookups.services.find((one) => one._id === line.refId);
      const ends = endsOf(line);
      const from = ends && pinOf(ends.origin);
      const to = ends && pinOf(ends.destination);

      if (!service || !line.ride || !from || !to) return null;

      const unit = variant.quote(
        service,
        null,
        choicesForLeg(service, variant.cardsFor([service]), line.ride.leg, line.choices),
        variant.zoneBetween(from, to),
      ).price;

      if (unit === null) return null;

      const riders =
        service.billingUnit === "per_pet"
          ? Math.max(1, line.ride.linkedBookingIds.length)
          : 1;

      return riders > 1 ? toDecimalString(toMinor(unit)! * BigInt(riders)) : unit;
    },
    [lookups.services, endsOf, variant],
  );

  /** A NEW line's price for its animal, zone and choices — or why not. */
  const quoteOf = (line: EditLine): PriceLookup =>
    variant.quote(
      serviceOf(line.refId),
      pets.find((one) => one._id === line.petId),
      line.choices,
    );

  /*
    THE ROWS AS THE EDITOR READS THEM: a new service line priced again from its
    animal, the zone and its choices as they stand now. The same array when
    nothing moved.
  */
  const lines = useMemo(() => {
    let changed = false;

    const next = draftLines.map((line) => {
      if (line.fromIndex !== null || line.kind !== "service") return line;

      /* A RIDE IS PRICED BY WHERE IT GOES, not by an animal — see `fareOf`. */
      if (line.ride) {
        const fare = fareOf(line) ?? "0";
        if (fare === line.unitPrice) return line;
        changed = true;
        return { ...line, unitPrice: fare };
      }

      if (!line.petId) return line;

      const price =
        variant.quote(
          lookups.services.find((one) => one._id === line.refId),
          pets.find((one) => one._id === line.petId),
          line.choices,
        ).price ?? "0";

      if (price === line.unitPrice) return line;

      changed = true;
      return { ...line, unitPrice: price };
    });

    return changed ? next : draftLines;
  }, [draftLines, lookups.services, pets, variant, fareOf]);

  function setChoices(key: string, choices: VariantChoice[]) {
    setLineRefusals({});
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, choices } : line)),
    );
  }

  const catalogue = useMemo(
    () => [
      ...lookups.products.map((product) => ({
        value: `product:${product._id}`,
        label: product.sku ? `${product.sku} — ${product.name}` : product.name,
      })),
      ...lookups.services.map((service) => ({
        value: `service:${service._id}`,
        label: `${service.name} (jasa)`,
      })),
    ],
    [lookups.products, lookups.services],
  );

  /* The shelves of the invoice's branch, plus every central one. */
  const warehousesHere = useMemo(
    () =>
      lookups.warehouses.filter(
        (warehouse) =>
          !warehouse.defaultBranchId ||
          String(warehouse.defaultBranchId) === invoice.branchId,
      ),
    [lookups.warehouses, invoice.branchId],
  );

  const hasProductLine = lines.some((line) => line.kind === "product");
  const hasServiceLine = lines.some((line) => line.kind === "service");

  /*
    WHAT THE SERVER WILL STORE ON THE LINE — its own discount, measured against
    the price less the booking's share, plus that share, as one nominal figure.
    The preview bills exactly that; the fields only ever hold the own part.
  */
  function previewDiscountOf(line: EditLine) {
    const typed = line.discountValue
      ? { mode: line.discountMode, value: line.discountValue }
      : null;

    if (!isPositive(line.bookingShare)) return typed;

    const priceMinor = toMinor(line.unitPrice) ?? BigInt(0);
    const shareMinor = toMinor(line.bookingShare) ?? BigInt(0);
    const capped = shareMinor > priceMinor ? priceMinor : shareMinor;
    const own = ownDiscountMinor(priceMinor - capped, line.discountMode, line.discountValue);

    return { mode: "amount" as const, value: toDecimalString(own + capped) };
  }

  /* The bookings' shares across the edit — shown once, under "Diskon item". */
  const bookingShares = sumDecimals(lines.map((line) => line.bookingShare));

  /**
   * Whether the PPN is charged ON TOP of the prices — see `previewInvoice`.
   *
   * A FUNCTION, not a const: this sits above `preview`, and reading it here
   * would be a use before its declaration.
   */
  const taxOnTop = () => preview.taxAdded !== "0.0000";

  /** A row's OWN discount: what the preview takes off it, less the booking's share. */
  function ownOffAt(index: number, line: EditLine): string {
    const own = subtractDecimals(preview.lineDiscounts[index], line.bookingShare);
    return isPositive(own) ? own : "0";
  }

  /**
   * WHAT THE ROW COMES TO: price × qty, less its own discount, plus its PPN
   * where the tax is added on top (16 September 2026). Inclusive pricing has the
   * tax inside the price already, so adding it here would charge it twice.
   *
   * The booking's share is NOT taken off a row — it is taken off once, in the
   * recap — so the rows add up to the total plus that share.
   */
  function rowTotal(index: number, line: EditLine): string {
    const net = subtractDecimals(preview.lineTotals[index], ownOffAt(index, line));
    return taxOnTop() ? sumDecimals([net, preview.lineTaxes[index]]) : net;
  }
  /*
    ASKED ONLY WHEN THE INVOICE SHIPPED NOTHING BEFORE. One that already moved
    stock keeps its warehouse: the reversal has to put its goods back on the
    shelf they came off.
  */
  const needsWarehouse = hasProductLine && !invoice.warehouseId;

  const preview = useMemo(
    () =>
      previewInvoice(
        lines.map((line) => ({
          qty: line.qty,
          unitPrice: line.unitPrice,
          discount: previewDiscountOf(line),
        })),
        invoiceDiscountValue
          ? { mode: invoiceDiscountMode, value: invoiceDiscountValue }
          : null,
        /* THE STORED CHARGES COUNT TOWARD THE TOTAL. The editor does not change
           them — the server keeps them when none are sent — but a total that
           left out the ongkir would not be the bill that gets saved. */
        { ...lookups.tax, otherCharges: invoice.otherCharges ?? [] },
      ),
    [
      lines,
      invoiceDiscountMode,
      invoiceDiscountValue,
      lookups.tax,
      invoice.otherCharges,
    ],
  );

  /** A ride row's two ends, flat as the payload carries them. */
  function tripInputOf(line: EditLine) {
    const ends = endsOf(line);
    const from = ends && pinOf(ends.origin);
    const to = ends && pinOf(ends.destination);

    if (!line.ride || !ends || !from || !to) return undefined;

    return {
      leg: line.ride.leg,
      origin: { address: ends.origin.address, ...from },
      destination: { address: ends.destination.address, ...to },
    };
  }

  function payload(): UpdateCustomerInvoiceInput {
    return {
      items: lines.map((line) => ({
        kind: line.kind,
        refId: line.refId,
        qty: line.qty,
        discount: line.discountValue
          ? { mode: line.discountMode, value: line.discountValue }
          : null,
        ...(line.fromIndex !== null ? { fromIndex: line.fromIndex } : {}),
        // A kept line's animal is the one it was billed for; only a new one
        // names one, and the server refuses a pet on a product line.
        ...(line.fromIndex === null && line.petId ? { petId: line.petId } : {}),
        /*
          ONLY ON A NEW LINE. A kept line is sent by `fromIndex`, and the server
          keeps the choices and zone it was priced on — sending them back would
          ask for a re-quote the revision does not do.
        */
        ...(line.fromIndex === null &&
        line.kind === "service" &&
        line.choices.length > 0
          ? { variantChoices: line.choices }
          : {}),
        /*
          THE JOURNEY, ON A NEW ANTAR-JEMPUT ROW. Flat on the wire, nested in
          the document. The van goes in `passengerPetIds` rather than `petId` —
          the same shape the booking it raises keeps its animals in.
        */
        ...(line.ride
          ? {
              passengerPetIds: line.passengers,
              trip: tripInputOf(line),
              linkedBookingIds: line.ride.linkedBookingIds,
            }
          : {}),
      })),
      invoiceDiscount: invoiceDiscountValue
        ? { mode: invoiceDiscountMode, value: invoiceDiscountValue }
        : null,
      dueDate: new Date(dueDate).toISOString(),
      ...(needsWarehouse && warehouseId ? { warehouseId } : {}),
    };
  }

  /*
    WHAT "UNCHANGED" MEANS: the payload the editor would send is the one it would
    have sent before anything was touched. Saving that would still reverse and
    re-issue two entries for nothing, so it is refused here with a sentence.
  */
  const untouched = useMemo(
    () =>
      JSON.stringify({
        items: initialLines.map((line) => ({
          kind: line.kind,
          refId: line.refId,
          qty: line.qty,
          discount: line.discountValue
            ? { mode: line.discountMode, value: line.discountValue }
            : null,
          fromIndex: line.fromIndex,
        })),
        invoiceDiscount: invoice.invoiceDiscount
          ? {
              mode: invoice.invoiceDiscount.mode,
              value: trimDecimal(invoice.invoiceDiscount.value),
            }
          : null,
        dueDate: new Date(toDateInput(invoice.dueDate)).toISOString(),
      }),
    [initialLines, invoice.invoiceDiscount, invoice.dueDate],
  );

  /*
    A NEW SERVICE LINE ON A SWITCHED-OFF VARIANT (13 September 2026). The server
    resolves only the rows added in this edit and refuses one of these; a line
    already stored on the invoice is never re-resolved, so it is never flagged —
    blocking it would hold the whole correction over a row the server accepts.
  */
  const variantInactive = (line: EditLine) =>
    line.fromIndex === null &&
    line.kind === "service" &&
    line.petId !== "" &&
    quoteOf(line).inactive;

  const blocking = (() => {
    if (lookups.loading) return "Sedang memuat katalog.";
    if (lines.length === 0) return "Faktur butuh minimal satu baris.";
    if (lines.some((line) => !line.qty || Number(line.qty) <= 0))
      return "Ada baris yang jumlahnya belum diisi.";
    if (!dueDate) return "Isi tanggal jatuh tempo.";
    if (needsWarehouse && !warehouseId)
      return "Pilih gudang — ada barang yang harus dikeluarkan.";
    /*
      ⚠️ AN ANTAR-JEMPUT ROW ANSWERS THIS DIFFERENTLY. It has no `petId` — one
      van carries several animals — and what it is missing is a whole journey,
      not a dropdown. Asked first, so a ride row is never told to "pilih
      hewannya" over a cell that has no picker.
    */
    const needsJourney = lines.find(
      (line) =>
        line.fromIndex === null &&
        line.kind === "service" &&
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
        (line) =>
          line.kind === "service" &&
          line.fromIndex === null &&
          !line.petId &&
          !line.ride,
      )
    ) {
      return petOptions.length === 0
        ? "Pelanggan ini belum punya hewan — daftarkan dulu di Master Data."
        : "Ada baris jasa yang belum dipilih hewannya.";
    }

    /* Its own sentence: the price is known, so "belum punya harga" would be
       wrong — the variant exists and is switched off. */
    const inactive = lines.find(variantInactive);

    if (inactive) {
      const pet = pets.find((one) => one._id === inactive.petId);
      return `Varian ${inactive.name} untuk ${pet?.name ?? "hewan ini"} sedang nonaktif — pilih layanan lain atau aktifkan variannya di katalog.`;
    }

    const unpriced = lines.find(
      (line) =>
        line.fromIndex === null &&
        line.kind === "service" &&
        /* ⚠️ A RIDE HAS NO `petId`. Asked for one, an antar-jemput row the
           catalogue has no band for slipped past here and was refused by the
           server instead. */
        (line.petId || line.ride) &&
        line.unitPrice === "0",
    );

    if (unpriced) {
      const pet = pets.find((one) => one._id === unpriced.petId);

      /*
        A RIDE'S ZONE IS ITS OWN JOURNEY'S, so `quoteOf` cannot explain it — it
        measures branch to customer record. Both ends are pinned by the time
        this is reached, so what is left is a fare with no band.
      */
      if (unpriced.ride) {
        const ends = endsOf(unpriced);
        const from = ends && pinOf(ends.origin);
        const to = ends && pinOf(ends.destination);
        const zone = from && to ? variant.zoneBetween(from, to) : null;

        if (zone && !zone.ok) {
          return `${variant.zoneTextOf(zone)} — tarif '${unpriced.name}' ditentukan dari zona.`;
        }

        return `'${unpriced.name}' belum punya tarif untuk perjalanan ini. Tambahkan variannya di katalog.`;
      }

      const lookup = quoteOf(unpriced);
      const missing = lookup.missingAxis;

      if (missing) {
        return `Lengkapi ${AXIS_LABEL[missing]} ${pet?.name ?? "hewannya"} dulu — harga '${unpriced.name}' ditentukan dari situ.`;
      }

      /* Beyond the pet — the server's sentence, once the cards and zones are in. */
      if (lookup.missingZone || lookup.missingChoice) {
        if (variant.loading) return "Sedang memuat katalog.";

        const service = serviceOf(unpriced.refId);
        const beyond = service ? variant.problemOf(service, lookup) : null;
        if (beyond) return `${beyond}.`;
      }

      return `'${unpriced.name}' belum punya harga untuk ${pet?.name ?? "hewan ini"}.`;
    }

    return null;
  })();

  function priceOf(line: Pick<EditLine, "kind" | "refId" | "petId">) {
    if (line.kind === "product") {
      const product = lookups.products.find((one) => one._id === line.refId);
      return String(product?.sellPrice ?? "0");
    }

    const service = lookups.services.find((one) => one._id === line.refId);
    const pet = pets.find((one) => one._id === line.petId);
    // The zone and choices are applied by `lines`, which prices every new row.
    return variant.quote(service, pet).price ?? "0";
  }

  function addLine() {
    if (!picked) return;

    const [kind, refId] = picked.split(":") as ["product" | "service", string];
    const found =
      kind === "product"
        ? lookups.products.find((product) => product._id === refId)
        : lookups.services.find((service) => service._id === refId);

    if (!found) return;

    setLines((current) => [
      ...current,
      {
        key: nextKey(),
        fromIndex: null,
        kind,
        refId,
        name: found.name,
        sku:
          kind === "product" ? ((found as { sku?: string }).sku ?? null) : null,
        unitPrice: priceOf({ kind, refId, petId: "" }),
        qty: "1",
        discountMode: "percent",
        discountValue: "",
        petId: "",
        petName: null,
        booked: false,
        bookingShare: "0",
        choices: [],
        ride: null,
        passengers: [],
        storedVariant: null,
      },
    ]);
    setPicked("");
  }

  function patchLine(key: string, patch: Partial<EditLine>) {
    if (patch.petId !== undefined) setLineRefusals({});

    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        // Re-priced when a NEW service's animal changes — for a variant
        // service that IS the price.
        return patch.petId === undefined || line.fromIndex !== null
          ? next
          : { ...next, unitPrice: priceOf(next) };
      }),
    );
  }

  async function save() {
    if (blocking) return;

    const body = payload();

    if (
      JSON.stringify({
        items: body.items.map((item) => ({
          kind: item.kind,
          refId: item.refId,
          qty: item.qty,
          discount: item.discount ?? null,
          fromIndex: item.fromIndex ?? null,
        })),
        invoiceDiscount: body.invoiceDiscount ?? null,
        dueDate: body.dueDate,
      }) === untouched
    ) {
      swalToast("Belum ada yang diubah.");
      return;
    }

    setSaving(true);
    setLineRefusals({});

    try {
      const updated = await customerInvoiceService.update(invoice._id, body);
      setSaving(false);
      onSaved(updated);
      swalToast(`${invoice.invoiceNumber} diperbarui.`);
    } catch (error) {
      /* A refusal about one NEW row is also said on that row — see Faktur baru. */
      if (error instanceof ApiError) {
        const found = lineRefusalOf(error);
        const optionId = found?.refusal.optionId;
        const added = lines.filter((line) => line.fromIndex === null);
        const asks = (line: EditLine) =>
          Boolean(optionId) &&
          line.kind === "service" &&
          variant
            .cardsFor([serviceOf(line.refId)])
            .some((card) => card.axisKey === optionId);
        const target = !found
          ? undefined
          : found.index !== null
            ? lines[found.index]
            : (added.find(
                (line) => asks(line) && !hasChoice(line.choices, optionId ?? ""),
              ) ?? added.find(asks));

        if (found && target) setLineRefusals({ [target.key]: found.refusal });
      }

      // Eight seconds: a short shelf or a payment that landed first is an
      // instruction, not an acknowledgement.
      swalToast(
        error instanceof ApiError
          ? error.fullMessage
          : "Perubahan gagal disimpan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  if (lookups.loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted">
        <Spinner /> Memuat katalog…
      </div>
    );
  }

  if (lookups.error) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error">{lookups.error}</Alert>
        <div>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Kembali
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Jatuh tempo"
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          disabled={saving}
          required
        />
        {needsWarehouse && (
          <FilterSelect
            layout="form"
            label="Gudang"
            ariaLabel="Gudang"
            value={warehouseId}
            options={namedOptions(warehousesHere)}
            active={false}
            required
            placeholder="Pilih gudang"
            disabled={saving}
            onChange={setWarehouseId}
          />
        )}
      </div>

      {/*
        WIDE ENOUGH FOR ITS INPUTS, scrolling sideways when the card is not —
        a discount field squeezed to two characters cannot be read back.
      */}
      <div className="overflow-x-auto">
        <Table className="min-w-275">
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              {hasServiceLine && <TableHead className="w-44">Hewan</TableHead>}
              <TableHead className="text-right">Harga</TableHead>
              <TableHead className="w-24">Jumlah</TableHead>
              <TableHead className="min-w-64">Diskon</TableHead>
              <TableHead>Pajak</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={line.key}>
                <TableCell>
                  <span className="font-medium">{line.name}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {line.sku ?? "Jasa"}
                    {line.fromIndex === null && " · baru"}
                  </span>
                  {/* WHAT A KEPT LINE WAS PRICED ON, read-only — it is not
                      quoted again. */}
                  {line.storedVariant && (
                    <span className="block text-xs text-muted">
                      {line.storedVariant}
                    </span>
                  )}
                  {line.fromIndex === null && line.kind === "service" && (() => {
                    const service = serviceOf(line.refId);
                    if (!service) return null;

                    const lookup = quoteOf(line);
                    const cards = variant.cardsFor([service]);
                    /*
                      ⚠️ "ARAH" IS ANSWERED BY THE DIRECTION, NOT ASKED TWICE.
                      It carries the price like any owner's option, but a select
                      here beside the direction chosen in the journey dialog is
                      two ways to disagree. Same rule as the create form's.
                    */
                    /* ⚠️ KEYED ON THE SERVICE, NOT ON `line.ride`: before a
                       journey is filled in the row has no `ride` yet, which is
                       exactly when the select was still drawn. The direction
                       only ever comes from the dialog. */
                    const arah = isRideService(line.refId)
                      ? arahCardOf(service, cards)
                      : null;

                    return (
                      <InvoiceLineVariant
                        cards={
                          arah
                            ? cards.filter(
                                (card) => card.axisKey !== arah.card.axisKey,
                              )
                            : cards
                        }
                        choices={line.choices}
                        onChange={(next) => setChoices(line.key, next)}
                        /* A ride's zone is its own journey's — the bill's
                           would be a different distance for a different trip,
                           and before there is a journey it is about a pin the
                           fare will never be measured from. */
                        zoneText={
                          isRideService(line.refId)
                            ? null
                            : variant.needsZone([service])
                              ? variant.zoneText
                              : null
                        }
                        problem={
                          line.petId && !variant.loading
                            ? variant.problemOf(service, lookup)
                            : null
                        }
                        refusal={lineRefusals[line.key] ?? null}
                        disabled={saving}
                      />
                    );
                  })()}
                </TableCell>

                {hasServiceLine && (
                  <TableCell>
                    {line.kind !== "service" ? (
                      <span className="text-xs text-muted">—</span>
                    ) : line.fromIndex !== null ? (
                      /* The animal a kept line was billed for — changing it
                         is removing the line and adding another. On a ride
                         this is the whole van, as the server named it. */
                      <span className="text-sm">{line.petName ?? "—"}</span>
                    ) : line.ride !== null ? (
                      /*
                        ─── A JOURNEY, NOT AN ANIMAL (24 September 2026) ─────

                        An antar-jemput row carries a whole van and two doors;
                        none of it fits beside a quantity and a price. The cell
                        says where it goes and who is in it, and the questions
                        live in the same dialog the create form opens.
                      */
                      <div className="flex flex-col items-start gap-1">
                        {/* THE COLUMN IS "HEWAN", so it says the animals and
                            nothing else — "Cici, Comoo". The direction, the
                            addresses and the linked bookings are a tap away in
                            the dialog (24 September 2026, on request). */}
                        <span className="text-sm text-foreground">
                          {line.passengers
                            .map(
                              (id) => pets.find((one) => one._id === id)?.name,
                            )
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => setRideRow(line.key)}
                        >
                          Ubah perjalanan
                        </Button>
                      </div>
                    ) : isRideService(line.refId) ? (
                      /* NOT FILLED IN YET — the row has no price until it is. */
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={saving}
                        onClick={() => setRideRow(line.key)}
                      >
                        Atur perjalanan
                      </Button>
                    ) : (
                      <FilterSelect
                        layout="field"
                        label=""
                        ariaLabel={`Hewan untuk ${line.name}`}
                        value={line.petId}
                        options={petOptions}
                        placeholder={
                          petOptions.length === 0
                            ? "Belum ada hewan"
                            : "Pilih hewan"
                        }
                        active={false}
                        disabled={saving || petOptions.length === 0}
                        onChange={(value) =>
                          patchLine(line.key, { petId: value })
                        }
                      />
                    )}
                  </TableCell>
                )}

                <TableCell className="text-right tabular-nums">
                  {line.kind === "service" && line.unitPrice === "0" ? (
                    <span className="text-muted">—</span>
                  ) : (
                    formatMoney(line.unitPrice)
                  )}
                  {/* The row the blocking sentence is about, marked in words. */}
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
                      patchLine(line.key, { qty: event.target.value })
                    }
                    // One per animal — see `booked`.
                    disabled={saving || line.booked}
                    title={
                      line.booked
                        ? "Ditagih dari booking — satu per hewan."
                        : undefined
                    }
                  />
                </TableCell>

                <TableCell>
                  <div className="flex gap-1">
                    <select
                      aria-label={`Jenis diskon ${line.name}`}
                      className="h-9 shrink-0 rounded-md border border-border bg-surface px-2 text-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      value={line.discountMode}
                      onChange={(event) =>
                        patchLine(line.key, {
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
                      className="min-w-32 text-right tabular-nums"
                      value={line.discountValue}
                      inputMode="decimal"
                      placeholder="0"
                      onChange={(event) =>
                        patchLine(line.key, {
                          discountValue: event.target.value,
                        })
                      }
                      disabled={saving}
                    />
                  </div>
                  {/* The line's own part only — the share is in the recap. */}
                  {isPositive(
                    subtractDecimals(preview.lineDiscounts[index], line.bookingShare),
                  ) && (
                    <span className="mt-1 block text-xs text-danger-ink tabular-nums">
                      −
                      {formatMoney(
                        subtractDecimals(preview.lineDiscounts[index], line.bookingShare),
                      )}
                    </span>
                  )}
                </TableCell>

                {/*
                  THE PPN THIS ROW WOULD CARRY, beside the discount it is charged
                  after — the same pair the read view shows, so an edit can be
                  checked against the bill it will become.
                */}
                <TableCell className="tabular-nums">
                  {preview.lineTaxes[index] === "0.0000" ? (
                    <span className="text-xs text-muted">Non-PPN</span>
                  ) : (
                    <>
                      <span className="rounded-full bg-tint-brand px-2 py-0.5 text-xs font-semibold text-primary">
                        {`PPN ${lookups.tax.taxRate}%`}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-success">
                        {taxOnTop()
                          ? `+${formatMoney(preview.lineTaxes[index])}`
                          : `termasuk ${formatMoney(preview.lineTaxes[index])}`}
                      </span>
                    </>
                  )}
                </TableCell>

                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(rowTotal(index, line))}
                </TableCell>

                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Hapus ${line.name}`}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((one) => one.key !== line.key),
                      )
                    }
                    disabled={saving}
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <FilterSelect
            layout="form"
            label="Tambah barang atau jasa"
            ariaLabel="Tambah barang atau jasa"
            value={picked}
            options={catalogue}
            active={false}
            placeholder="Cari nama atau SKU"
            disabled={saving}
            onChange={setPicked}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={addLine}
          disabled={saving || !picked}
        >
          Tambah baris
        </Button>
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <span className="text-sm font-medium">Diskon faktur</span>
          <div className="mt-1.5 flex gap-1">
            <select
              aria-label="Jenis diskon faktur"
              className="h-11 rounded-md border border-border bg-surface px-2 text-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              value={invoiceDiscountMode}
              onChange={(event) =>
                setInvoiceDiscountMode(event.target.value as InvoiceDiscountMode)
              }
              disabled={saving}
            >
              <option value="percent">%</option>
              <option value="amount">Rp</option>
            </select>
            <Input
              aria-label="Diskon faktur"
              className="h-11"
              value={invoiceDiscountValue}
              inputMode="decimal"
              placeholder="0"
              onChange={(event) => setInvoiceDiscountValue(event.target.value)}
              disabled={saving}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Dihitung dari subtotal <strong>setelah</strong> diskon item.
          </p>
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(preview.subtotal)}</dd>
          </div>
          {/* The lines' own discounts, then the bookings' shares — as on the read view. */}
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Diskon item</dt>
            <dd className="tabular-nums">
              −{formatMoney(subtractDecimals(preview.itemDiscount, bookingShares))}
            </dd>
          </div>
          {isPositive(bookingShares) && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Diskon booking</dt>
              <dd className="tabular-nums">−{formatMoney(bookingShares)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Diskon faktur</dt>
            <dd className="tabular-nums">
              −{formatMoney(preview.invoiceDiscount)}
            </dd>
          </div>
          {/* THE STORED CHARGES, read-only — this screen does not change them,
              and the server keeps them on the revised bill. */}
          {(invoice.otherCharges ?? []).map((charge, index) => (
            <div
              key={`${charge.label}-${index}`}
              className="flex justify-between gap-4"
            >
              <dt className="text-muted">{charge.label}</dt>
              <dd className="tabular-nums">+{formatMoney(charge.amount)}</dd>
            </div>
          ))}
          {/*
            THE PPN STANDS ON ITS BASE — "Dasar pengenaan pajak" directly above
            it, under a dashed rule, as the read view and Faktur baru draw it
            (16 September 2026). The two are a breakdown of the figure below, not
            two more things added to it, and a tax nobody can check against what
            it was charged on is a tax nobody can check.

            ONLY WHERE TAX IS ADDED ON TOP: on inclusive pricing it is already
            inside the subtotal, and a "PPN Rp 0" row would deny a tax that was
            charged.
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
                {/* One template string, not `PPN {rate}%` — interpolation splits
                    it into three text nodes a query cannot match as a label. */}
                <dt className="text-muted">{`PPN ${lookups.tax.taxRate}%`}</dt>
                <dd className="tabular-nums">{formatMoney(preview.taxAdded)}</dd>
              </div>
            </div>
          )}
          <div className="flex justify-between gap-4 border-t-[1.5px] border-primary pt-2.5 text-base font-bold">
            <dt>Total tagihan</dt>
            <dd className="tabular-nums">{formatMoney(preview.grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-hover px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {blocking ??
            "Menyimpan membalik jurnal & stok versi sebelumnya lalu menerbitkan ulang baris ini. Nomor dan tanggal faktur tetap."}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Buang perubahan
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving || blocking !== null}
          >
            {saving ? "Menyimpan…" : "Simpan faktur"}
          </Button>
        </div>
      </div>

      {/*
        THE JOURNEY OF ONE ROW — the same dialog the create form opens, so a
        ride agreed while raising a bill and one added while revising it cannot
        come to disagree about which end is the customer's or when a booking
        already has a van.

        Mounted only while a row is being filled in: it asks the customer's
        diary the moment its switch is turned on.
      */}
      {rideRow && (
        <RideJourneyDialog
          open
          serviceName={lines.find((line) => line.key === rideRow)?.name ?? ""}
          pets={pets}
          /* A till invoice may have no customer; a journey has nobody to
             fetch for then, and the picker offers nothing. */
          customerId={invoice.customerId ?? ""}
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
          /* The bookings this bill already carries — marked, not closed. */
          alreadyHere={(invoice.items ?? [])
            .map((item) => item.bookingId)
            .filter((id): id is string => Boolean(id))}
          alreadyHereLabel="Sudah ada di faktur ini."
          busy={saving}
          onOpenChange={(next) => {
            if (!next) setRideRow(null);
          }}
          onSave={({ passengerPetIds, journey }) => {
            setLines((current) =>
              current.map((line) =>
                line.key === rideRow
                  ? { ...line, passengers: passengerPetIds, ride: journey }
                  : line,
              ),
            );
            setRideRow(null);
          }}
        />
      )}
    </div>
  );
}
