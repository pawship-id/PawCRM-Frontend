/**
 * PRICING A BASKET ON THE DEVICE (POS offline mode, 19 October 2026).
 *
 * Online, the server is the only pricer — the till sends lines and shows what
 * comes back. Offline there is nobody to ask, so this file prices the same
 * lines the same way, and the sync re-prices them on the server and REFUSES TO
 * POST a sale whose total disagrees (it goes to Perlu Dicek instead). So this
 * is a port, not a reinterpretation, of exactly these server rules:
 *
 *   posTransaction.service  #resolveLine, #priceItems (the subset below),
 *                           #computeTotals, #runningTax, #priceCartDiscount
 *   utils/discount.js       resolve — percent capped at 100, amount at the basis
 *   utils/tax.js            divideRound (half away from zero), baseFromGross
 *   utils/serviceVariant.js resolveServicePrice — pet axes and staff choices
 *
 * All money is BigInt minor units at scale 4, as on the server.
 *
 * WHAT IS NOT PRICED OFFLINE, and refused with a sentence instead of guessed:
 * membership packages and benefits, pulled bookings, home-visit trips and
 * antar-jemput rides, and a service priced by ZONE (it needs the customer's
 * distance). Each needs the server to answer something the device does not
 * hold.
 *
 * A HAND-PICKED LOT IS SOLD OFFLINE (25 Oct 2026, BO) — from the snapshot's
 * lots, by the same rule as online: a lot short on paper is still sold from
 * where the shop allows negative stock, and refused where it does not.
 */
import { ApiError } from "@/services/api-error";
import { divideRound, toDecimalString, toMinor } from "@/utils/decimal";
import type {
  PosCatalogAddon,
  PosCharge,
  PosDiscount,
  PosDiscountMode,
  PosItem,
  PosItemInput,
  PosLineLot,
  PosRunningTotals,
  PosTransaction,
  ServiceVariant,
  VariantChoice,
} from "@/types/api";
import type { OfflineCatalogTile, OfflinePet } from "@/types/posOffline";

import type { OfflineSnapshot } from "./store";

const ONE = 10_000n;
const ONE_HUNDRED = 100n * ONE;

export interface LocalCart {
  _id: string;
  branchId: string;
  warehouseId: string;
  shiftId: string;
  customerId: string | null;
  items: PosItemInput[];
  cartDiscount: { mode: PosDiscountMode; value: string } | null;
  otherCharges: PosCharge[];
  note: string | null;
  status: "active" | "held";
  heldLabel: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** The server basket this one continued after the connection dropped. */
  replacesCartId: string | null;
}

export interface PricingContext {
  snapshot: OfflineSnapshot;
  /** `posTransactions:setPrice` — checked here, since the sync cannot. */
  maySetPrice: boolean;
  /** Units unsent sales named from each lot — see `lotsOf`. */
  pendingLotQty?: Record<string, number>;
}

/** A refusal shaped like the server's, so the cart shows it the same way. */
export function offlineRefusal(message: string): ApiError {
  return new ApiError(message, 400, { reason: message });
}

const NEEDS_ONLINE = (what: string) =>
  offlineRefusal(`${what} butuh koneksi internet — tunggu sampai kasir online lagi.`);

function minor(value: string | null | undefined, label: string): bigint {
  const parsed = toMinor(value ?? null);
  if (parsed === null) throw offlineRefusal(`${label} tidak valid`);
  return parsed;
}

/** utils/discount.js `resolve`, line for line. */
export function resolveDiscount(
  basis: bigint,
  typed: { mode: PosDiscountMode; value: string } | null | undefined,
): { mode: PosDiscountMode; value: bigint; resolved: bigint } | null {
  if (!typed) return null;
  const value = minor(typed.value, "Diskon");
  if (value < 0n) throw offlineRefusal("Diskon tidak boleh minus");

  let resolved: bigint;
  if (typed.mode === "percent") {
    if (value > ONE_HUNDRED) throw offlineRefusal("Diskon tidak boleh lebih dari 100%");
    resolved = divideRound(basis * value, ONE_HUNDRED);
  } else {
    resolved = value;
  }
  if (resolved > basis) resolved = basis;
  return { mode: typed.mode, value, resolved };
}

/** utils/tax.js `applyDiscountThenTax` with no discount — `#runningTax`. */
export function runningTax(
  net: bigint,
  rate: bigint,
  inclusive: boolean,
): { tax: bigint; payable: bigint } {
  if (inclusive) {
    const base = divideRound(net * ONE_HUNDRED, ONE_HUNDRED + rate);
    return { tax: net - base, payable: net };
  }
  const tax = divideRound(net * rate, ONE_HUNDRED);
  return { tax, payable: net + tax };
}

/* ───────────────────────── the catalogue, indexed ───────────────────────── */

interface CatalogIndex {
  tiles: Map<string, OfflineCatalogTile>;
  /** An add-on is priced from the service tile that offers it. */
  addons: Map<string, PosCatalogAddon>;
  pets: Map<string, OfflinePet>;
  customers: Map<string, { _id: string; name: string; phone: string | null }>;
}

const indexCache = new WeakMap<object, CatalogIndex>();

export function indexOf(snapshot: OfflineSnapshot): CatalogIndex {
  const key = (snapshot.catalog ?? snapshot) as object;
  const cached = indexCache.get(key);
  if (cached && cached.pets.size === (snapshot.customers?.pets.length ?? 0)) return cached;

  const tiles = new Map<string, OfflineCatalogTile>();
  const addons = new Map<string, PosCatalogAddon>();
  for (const tile of snapshot.catalog?.items ?? []) {
    tiles.set(String(tile._id), tile);
    for (const addon of (tile as { addons?: PosCatalogAddon[] }).addons ?? []) {
      addons.set(String(addon._id), addon);
    }
  }
  const index: CatalogIndex = {
    tiles,
    addons,
    pets: new Map((snapshot.customers?.pets ?? []).map((pet) => [String(pet._id), pet])),
    customers: new Map(
      (snapshot.customers?.customers ?? []).map((customer) => [String(customer._id), customer]),
    ),
  };
  indexCache.set(key, index);
  return index;
}

/* ─────────────────────────── services ─────────────────────────── */

const AXIS_TO_PET_FIELD: Record<string, keyof OfflinePet> = {
  petType: "species",
  sizeCategory: "size",
  furType: "furType",
};

interface PricedService {
  hasVariants?: boolean;
  variantAxes?: string[];
  variants?: ServiceVariant[];
  price: string | null;
}

/** True when this service can be priced without the server. */
export function offlinePriceable(service: PricedService): boolean {
  return !(service.hasVariants && (service.variantAxes ?? []).includes("zone"));
}

/** The staff-chosen axes of a service — what the offline dialog must ask. */
export function staffAxesOf(service: PricedService): string[] {
  return service.hasVariants
    ? (service.variantAxes ?? []).filter(
        (axis) => !AXIS_TO_PET_FIELD[axis] && axis !== "zone",
      )
    : [];
}

/** utils/serviceVariant.js `resolveServicePrice`, without zones. */
export function resolveServicePrice(
  service: PricedService,
  pet: OfflinePet | null,
  choices: VariantChoice[] = [],
  name = "Layanan ini",
): bigint {
  if (!service.hasVariants) {
    if (service.price === null || service.price === undefined) {
      throw offlineRefusal(`${name} belum punya harga`);
    }
    return minor(service.price, "Harga");
  }

  const axes = service.variantAxes ?? [];
  if (axes.includes("zone")) throw NEEDS_ONLINE(`Harga ${name} (per zona)`);
  if (axes.length === 0 || !service.variants?.length) {
    throw offlineRefusal(`${name} tidak punya varian harga untuk hewan ini`);
  }

  const chosen = new Map(choices.map((choice) => [String(choice.optionId), choice.code]));
  const wanted: Record<string, string> = {};
  for (const axis of axes) {
    const petField = AXIS_TO_PET_FIELD[axis];
    if (petField) {
      const value = pet?.[petField] ?? null;
      if (value === null) {
        throw offlineRefusal(
          pet
            ? `Data ${pet.name} belum lengkap untuk harga ${name} — lengkapi saat online`
            : `Pilih hewannya dulu untuk ${name}`,
        );
      }
      wanted[axis] = String(value);
    } else {
      const code = chosen.get(String(axis));
      if (!code) throw offlineRefusal(`Pilih varian ${name} dulu`);
      wanted[axis] = code;
    }
  }

  const valueOn = (variant: ServiceVariant, axis: string): string | null => {
    if (AXIS_TO_PET_FIELD[axis]) {
      const value = (variant as unknown as Record<string, string | null>)[axis];
      return value ? String(value) : null;
    }
    return (
      (variant.choices ?? []).find((choice) => String(choice.optionId) === String(axis))?.code ??
      null
    );
  };

  const match = service.variants.find((variant) =>
    axes.every((axis) => valueOn(variant, axis) === wanted[axis]),
  );
  if (!match) throw offlineRefusal(`${name} tidak punya harga untuk hewan ini`);
  if ((match as { isActive?: boolean }).isActive === false) {
    throw offlineRefusal(`Varian ${name} untuk hewan ini sedang nonaktif`);
  }
  return minor(match.price, "Harga");
}

/* ─────────────────────────── the basket ─────────────────────────── */

function refuseOnlineOnly(line: PosItemInput) {
  if (line.kind === "membership") throw NEEDS_ONLINE("Paket membership");
  if (line.benefit) throw NEEDS_ONLINE("Benefit membership");
  if (line.bookingId) throw NEEDS_ONLINE("Booking yang ditarik");
  if (line.homeTripId) throw NEEDS_ONLINE("Biaya kunjungan");
  if (line.trip || (line.passengerPetIds?.length ?? 0) > 0) throw NEEDS_ONLINE("Antar-jemput");
}

/**
 * A line's named lots, checked as the server checks them and labelled from the
 * snapshot. A lot the snapshot does not hold is left for the sync to judge.
 */
function lotsOf(line: PosItemInput, qty: bigint, context: PricingContext): PosLineLot[] {
  if (!line.lots?.length) return [];
  if (line.kind !== "product") throw offlineRefusal("Batch hanya untuk produk");

  const { snapshot, pendingLotQty = {} } = context;
  const shelf = snapshot.stock?.lots?.[String(line.refId)] ?? [];
  const allowShort = snapshot.stock?.allowNegativeStock !== false;
  let total = 0n;
  const lots = line.lots.map((share) => {
    const wanted = minor(share.qty, "Jumlah dari batch");
    if (wanted <= 0n) throw offlineRefusal("Jumlah dari batch harus lebih dari 0");
    total += wanted;

    const lot = shelf.find((row) => row._id === share.batchId);
    if (lot && !allowShort) {
      const held =
        minor(lot.qtyRemaining, "Sisa batch") -
        minor(String(pendingLotQty[lot._id] ?? 0), "Sisa batch");
      if (held < wanted) {
        throw offlineRefusal(`Batch ${lot.batchCode} hanya tersisa ${toDecimalString(held)}`);
      }
    }
    return {
      batchId: share.batchId,
      batchCode: lot?.batchCode ?? null,
      qty: toDecimalString(wanted),
    };
  });
  if (total !== qty) {
    throw offlineRefusal(
      `Jumlah dari batch (${toDecimalString(total)}) harus sama dengan jumlah barang (${toDecimalString(qty)})`,
    );
  }
  return lots;
}

/**
 * The main service an add-on line hangs off — `#resolveAdhocParents` on the
 * server, rule for rule: only an ADD-ON for a named animal, and only when
 * exactly one other service line for that animal offers it.
 */
function parentOf(
  line: PosItemInput,
  lines: PosItemInput[],
  index: CatalogIndex,
): string | null {
  if (line.kind !== "service" || !line.petId) return null;

  const tile = index.tiles.get(String(line.refId)) as { serviceType?: string } | undefined;
  const isAddon = tile ? tile.serviceType === "addon" : index.addons.has(String(line.refId));
  if (!isAddon) return null;

  const offered = lines.filter((other) => {
    if (other === line || other.kind !== "service") return false;
    if (String(other.petId ?? "") !== String(line.petId ?? "")) return false;
    const service = index.tiles.get(String(other.refId)) as
      | { addons?: PosCatalogAddon[] }
      | undefined;
    return (service?.addons ?? []).some((addon) => String(addon._id) === String(line.refId));
  });

  return offered.length === 1 ? String(offered[0].refId) : null;
}

function presentDiscount(
  resolved: ReturnType<typeof resolveDiscount>,
): PosDiscount | null {
  if (!resolved) return null;
  return {
    mode: resolved.mode,
    value: toDecimalString(resolved.value),
    resolvedAmount: toDecimalString(resolved.resolved),
    approvedBy: null,
    source: "manual",
  };
}

/**
 * Prices the basket and presents it in the server's `PosTransaction` shape, so
 * every component that draws a cart draws this one without knowing.
 */
export function priceCart(cart: LocalCart, context: PricingContext): PosTransaction {
  const { snapshot } = context;
  if (!snapshot.catalog || !snapshot.settings) {
    throw offlineRefusal("Data kasir offline belum tersedia — buka kasir sekali saat online");
  }
  const index = indexOf(snapshot);
  const items: PosItem[] = [];

  for (const line of cart.items) {
    refuseOnlineOnly(line);

    let name: string;
    let sku: string | null;
    let qty: bigint;
    let catalogued: bigint;
    let variantChoices: PosItem["variantChoices"] = [];
    const pet = line.petId ? (index.pets.get(String(line.petId)) ?? null) : null;

    if (line.petId && !pet) {
      throw offlineRefusal("Hewan ini belum ada di data offline — tambahkan saat online");
    }
    if (pet && cart.customerId && String(pet.customerId) !== String(cart.customerId)) {
      throw offlineRefusal(`${pet.name} bukan hewan pelanggan ini`);
    }

    if (line.kind === "product") {
      const tile = index.tiles.get(String(line.refId));
      if (!tile || tile.kind !== "product") {
        throw offlineRefusal("Produk ini tidak ada di data offline");
      }
      if (tile.productType === "parent") {
        throw offlineRefusal(`${tile.name} punya varian — pilih salah satu`);
      }
      name = tile.name;
      sku = tile.code ?? null;
      qty = minor(line.qty ?? "1", "Jumlah");
      if (qty <= 0n) throw offlineRefusal("Jumlah harus lebih dari nol");
      catalogued = minor(tile.price, `Harga ${tile.name}`);
    } else {
      const tile = index.tiles.get(String(line.refId));
      const addon = index.addons.get(String(line.refId));
      const service = (tile?.kind === "service" ? tile : null) ?? addon ?? null;
      if (!service) throw offlineRefusal("Layanan ini tidak ada di data offline");
      if (!offlinePriceable(service as PricedService)) {
        throw NEEDS_ONLINE(`Harga ${service.name} (per zona)`);
      }

      /* An add-on inherits its main line's staff choices for the same animal. */
      const parentId = parentOf(line, cart.items, index);
      const parentLine = parentId
        ? cart.items.find(
            (candidate) =>
              String(candidate.refId) === parentId &&
              String(candidate.petId ?? "") === String(line.petId ?? ""),
          )
        : null;
      const choices = [
        ...new Map(
          [...(parentLine?.variantChoices ?? []), ...(line.variantChoices ?? [])].map(
            (choice) => [String(choice.optionId), choice],
          ),
        ).values(),
      ];

      name = service.name;
      sku = (tile?.code as string | null | undefined) ?? null;
      qty = ONE;
      catalogued = resolveServicePrice(service as PricedService, pet, choices, service.name);
      variantChoices = (line.variantChoices ?? []).map((choice) => ({
        optionId: choice.optionId,
        code: choice.code,
        name: "Pilihan",
        label: choice.code,
      }));
    }

    const typed =
      line.unitPrice === undefined || line.unitPrice === null
        ? null
        : minor(line.unitPrice, "Harga");
    if (typed !== null && typed < 0n) throw offlineRefusal("Harga tidak boleh minus");
    const overridden = typed !== null && typed !== catalogued;
    if (overridden && !context.maySetPrice) {
      throw offlineRefusal("Kamu tidak punya izin mengubah harga");
    }
    const unitPrice = overridden ? (typed as bigint) : catalogued;
    const lineTotal = divideRound(qty * unitPrice, ONE);
    const discount = resolveDiscount(lineTotal, line.discount ?? null);

    items.push({
      kind: line.kind,
      refId: String(line.refId),
      name,
      sku,
      qty: toDecimalString(qty),
      unitPrice: toDecimalString(unitPrice),
      listPrice: overridden ? toDecimalString(catalogued) : null,
      lineTotal: toDecimalString(lineTotal),
      discount: presentDiscount(discount),
      bookingDiscount: null,
      membershipDiscount: null,
      hppAtTime: null,
      bookingId: null,
      parentServiceId: parentOf(line, cart.items, index),
      variantChoices,
      lots: lotsOf(line, qty, context),
      note: line.note ?? null,
      petId: line.petId ? String(line.petId) : null,
      petName: pet?.name ?? null,
      groomerName: null,
      bookingStatus: null,
      bookingOwned: false,
      bookingNumber: null,
    });
  }

  /* #computeTotals and #priceCartDiscount. */
  let subtotal = 0n;
  let itemDiscount = 0n;
  for (const item of items) {
    subtotal += minor(item.lineTotal, "Subtotal");
    if (item.discount) itemDiscount += minor(item.discount.resolvedAmount, "Diskon");
  }
  const cartDiscount = resolveDiscount(subtotal - itemDiscount, cart.cartDiscount);
  const charges = cart.otherCharges.reduce((sum, charge) => {
    const amount = minor(charge.amount, "Biaya lain");
    if (amount <= 0n) throw offlineRefusal("Biaya lain harus lebih dari nol");
    return sum + amount;
  }, 0n);
  const net = subtotal - itemDiscount - (cartDiscount?.resolved ?? 0n) + charges;

  const rateText = snapshot.settings.tax.rate ?? "0";
  const rate = toMinor(rateText) ?? 0n;
  const { tax, payable } = runningTax(net, rate, snapshot.settings.tax.inclusive);

  const runningTotals: PosRunningTotals = {
    subtotal: toDecimalString(subtotal),
    itemDiscount: toDecimalString(itemDiscount),
    cartDiscount: toDecimalString(cartDiscount?.resolved ?? 0n),
    otherCharges: toDecimalString(charges),
    net: toDecimalString(net),
    tax: toDecimalString(tax),
    payable: toDecimalString(payable),
    taxRate: Number(rateText),
    taxAdded: !snapshot.settings.tax.inclusive,
  };

  const customer = cart.customerId ? (index.customers.get(String(cart.customerId)) ?? null) : null;
  if (cart.customerId && !customer) {
    throw offlineRefusal("Pelanggan ini belum ada di data offline");
  }

  return {
    _id: cart._id,
    tenantId: "",
    branchId: cart.branchId,
    warehouseId: cart.warehouseId,
    shiftId: cart.shiftId,
    transactionNumber: null,
    customerId: cart.customerId,
    customer: customer
      ? { _id: String(customer._id), name: customer.name, phone: customer.phone ?? null }
      : null,
    items,
    cartDiscount: presentDiscount(cartDiscount),
    otherCharges: cart.otherCharges,
    note: cart.note,
    payments: [],
    totals: null,
    customerInvoiceId: null,
    runningTotals,
    status: cart.status,
    heldLabel: cart.heldLabel,
    cartNumber: null,
    syncOnline: false,
    createdBy: cart.createdBy,
    bookingIds: [],
    paidAt: null,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
}
