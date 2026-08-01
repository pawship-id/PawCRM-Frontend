import {
  divideRound,
  toDecimalString,
  toMinor,
  weightedAverage,
} from "@/utils/decimal";
import type {
  Category,
  CreateAdjustmentInput,
  CreateTransferInput,
  FefoAllocation,
  JournalLine,
  MovementType,
  Opname,
  OpnameItem,
  Product,
  ProductBatch,
  StockMovement,
  StockWarehouse,
  VariantAxis,
} from "@/types/inventory";

/**
 * An in-memory stand-in for the Inventory API, for the prototype screens.
 *
 * WHY THIS EXISTS RATHER THAN CALLING THE REAL ENDPOINTS. `/api/stock-movements`
 * is live, but nothing has written to it yet — the goods-receipt and POS modules
 * that produce most movements have not shipped. Wiring the screens straight to
 * the API today would render three empty tables, which shows the layout and
 * none of the behaviour these screens exist to demonstrate: FEFO splitting one
 * request into several ledger rows, the weighted average moving on a receipt,
 * a transfer carrying a lot's expiry across to another warehouse.
 *
 * So this module reimplements the backend's decisions faithfully enough to be
 * walked through, and the screens consume it through one hook. Swapping to the
 * real API means changing that hook, not the components.
 *
 * WHAT IS FAITHFUL TO THE BACKEND, deliberately:
 *   - quantities and money are decimal STRINGS, never floats;
 *   - direction is decided by the SIGN, so a positive `adjustment` takes the
 *     inbound path (create a lot, recompute the average) — which is how opening
 *     stock is entered;
 *   - FEFO allocates closest-to-expiring first and writes ONE ROW PER LOT;
 *   - a short pick is NOT refused: the last lot goes negative and the movement
 *     is still written, because the goods physically left the shelf;
 *   - a transfer generates its own mirror rows after FEFO has run, one per lot,
 *     each carrying the source lot's code, expiry and cost;
 *   - a transfer posts NO journal and does NOT touch the average.
 *
 * WHAT IS NOT: no tenant scoping, no transactions, no persistence. Reloading
 * the page resets everything, which is the intended behaviour for a prototype.
 */

/** Account codes this module posts against, as seeded per tenant. */
const ACCOUNT = {
  inventory: { code: "1201", name: "Persediaan Barang Dagangan" },
  cogs: { code: "5101", name: "Harga Pokok Penjualan" },
  loss: { code: "5201", name: "Kerugian Persediaan" },
} as const;

/**
 * Movement types that record no journal entry.
 *
 * The backend also keeps INBOUND/OUTBOUND tables to enforce that a `receipt` is
 * never negative and a `pos_sale` never positive. They are not repeated here:
 * this store only ever writes `adjustment` and the transfer pair, and both take
 * their direction from the SIGN — which is what the real service does for the
 * two-way types too. Copying tables nothing reads would be documentation
 * pretending to be code.
 */
const JOURNAL_EXEMPT: MovementType[] = ["transfer_out", "transfer_in"];

export interface DemoState {
  products: Product[];
  categories: Category[];
  warehouses: StockWarehouse[];
  batches: ProductBatch[];
  movements: StockMovement[];
  opnames: Opname[];
  opnameItems: OpnameItem[];
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}_${(sequence += 1)}`;

/** Days from now as an ISO date, for readable fixture expiries. */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Hours ago as an ISO timestamp, so the ledger reads in a sensible order. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function seed(): DemoState {
  const warehouses: StockWarehouse[] = [
    {
      _id: "wh_utama",
      name: "Gudang Pawship Timur",
      isActive: true,
      defaultBranchId: "br_timur",
    },
    {
      _id: "wh_barat",
      name: "Gudang Pawship Barat",
      isActive: true,
      defaultBranchId: "br_barat",
    },
    {
      _id: "wh_bazar",
      name: "Bazar Ciputra World",
      isActive: true,
      defaultBranchId: null,
    },
  ];

  const categories: Category[] = [
    { _id: "cat_makanan_kucing", name: "Makanan Kucing" },
    { _id: "cat_makanan_anjing", name: "Makanan Anjing" },
    { _id: "cat_obat", name: "Obat & Vitamin" },
    { _id: "cat_aksesoris", name: "Aksesoris" },
    { _id: "cat_perawatan", name: "Perawatan" },
  ];

  /** Fills in the fields every product shares, so a fixture only names what differs. */
  const product = (
    partial: Partial<Product> & Pick<Product, "_id" | "sku" | "name">,
  ): Product => ({
    productType: "standalone",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 0,
    hasExpiry: false,
    categoryId: "cat_makanan_kucing",
    unit: "pcs",
    sellPrice: null,
    hppAvg: null,
    isActive: true,
    ...partial,
  });

  const products: Product[] = [
    // A PARENT and its two variants — the 2-tier shape the POS expands into.
    // The parent holds no stock and no price; both live on the variants.
    product({
      _id: "prd_rc_parent",
      sku: "RC-ADULT",
      name: "Royal Canin Adult",
      productType: "parent",
      hasExpiry: true,
      variantAxes: [
        { name: "Ukuran", values: ["1kg", "3kg"] },
        { name: "Rasa", values: ["Chicken", "Salmon"] },
      ],
    }),
    product({
      _id: "prd_rc3kg",
      sku: "RC-ADULT-3KG-CHICKEN",
      name: "Royal Canin Adult — 3kg / Chicken",
      productType: "variant",
      parentId: "prd_rc_parent",
      variantAttributes: { Ukuran: "3kg", Rasa: "Chicken" },
      barcode: "8991002345671",
      hasExpiry: true,
      sellPrice: "320000.0000",
      hppAvg: "243750.0000",
      minStock: 4,
    }),
    product({
      _id: "prd_rc1kg",
      sku: "RC-ADULT-1KG-CHICKEN",
      name: "Royal Canin Adult — 1kg / Chicken",
      productType: "variant",
      parentId: "prd_rc_parent",
      variantAttributes: { Ukuran: "1kg", Rasa: "Chicken" },
      hasExpiry: true,
      sellPrice: "145000.0000",
      hppAvg: "115000.0000",
      minStock: 6,
    }),
    product({
      _id: "prd_wsk",
      sku: "WSK-TUNA-12",
      name: "Whiskas Tuna 1.2kg",
      barcode: "8993001112345",
      hasExpiry: true,
      sellPrice: "42000.0000",
      hppAvg: "31000.0000",
      minStock: 12,
    }),
    product({
      _id: "prd_shampoo",
      sku: "SHP-PETCARE-250",
      name: "Shampoo Petcare Anti Kutu 250ml",
      categoryId: "cat_perawatan",
      unit: "botol",
      barcode: "8991002999111",
      sellPrice: "68000.0000",
      hppAvg: "44000.0000",
      minStock: 6,
    }),
    product({
      _id: "prd_pasir",
      sku: "LTR-GUMPAL-10",
      name: "Pasir Gumpal Wangi 10L",
      categoryId: "cat_aksesoris",
      unit: "sak",
      sellPrice: "78000.0000",
      minStock: 5,
    }),
    // A BUNDLE. Holds no stock of its own — selling one consumes 12 of its
    // component, so its availability is derived from the component's.
    product({
      _id: "prd_bnd_wsk",
      sku: "BND-WSK-DUS",
      name: "Whiskas Tuna 1.2kg — Dus isi 12",
      productType: "bundle",
      unit: "dus",
      sellPrice: "480000.0000",
      bundleConfig: {
        pricingMode: "fixed",
        fixedPrice: "480000.0000",
        components: [
          {
            componentType: "product",
            componentProductId: "prd_wsk",
            componentServiceId: null,
            qty: "12.0000",
          },
        ],
      },
    }),
  ];

  const batches: ProductBatch[] = [
    {
      _id: "bt_rc_a",
      tenantId: "t1",
      warehouseId: "wh_utama",
      productId: "prd_rc3kg",
      receiptId: "gr_1",
      batchCode: "RC-B26-0455",
      expiryDate: dayOffset(24),
      initialQty: "10.0000",
      qtyRemaining: "3.0000",
      costPerUnit: "250000.0000",
      isConsignment: false,
      createdBy: "u1",
      createdAt: hoursAgo(600),
      updatedAt: hoursAgo(20),
    },
    {
      _id: "bt_rc_b",
      tenantId: "t1",
      warehouseId: "wh_utama",
      productId: "prd_rc3kg",
      receiptId: "gr_2",
      batchCode: "RC-B26-0512",
      expiryDate: dayOffset(180),
      initialQty: "20.0000",
      qtyRemaining: "17.0000",
      costPerUnit: "240000.0000",
      isConsignment: false,
      createdBy: "u1",
      createdAt: hoursAgo(288),
      updatedAt: hoursAgo(20),
    },
    {
      _id: "bt_wsk_a",
      tenantId: "t1",
      warehouseId: "wh_utama",
      productId: "prd_wsk",
      receiptId: "gr_1",
      batchCode: "WSK-B26-0512",
      expiryDate: dayOffset(5),
      initialQty: "60.0000",
      qtyRemaining: "8.0000",
      costPerUnit: "31000.0000",
      isConsignment: false,
      createdBy: "u1",
      createdAt: hoursAgo(600),
      updatedAt: hoursAgo(4),
    },
    {
      _id: "bt_wsk_b",
      tenantId: "t1",
      warehouseId: "wh_utama",
      productId: "prd_wsk",
      receiptId: "gr_3",
      batchCode: "WSK-B26-0640",
      expiryDate: dayOffset(150),
      initialQty: "36.0000",
      qtyRemaining: "36.0000",
      costPerUnit: "31000.0000",
      isConsignment: false,
      createdBy: "u1",
      createdAt: hoursAgo(72),
      updatedAt: hoursAgo(72),
    },
  ];

  const movements: StockMovement[] = [
    mv(
      "prd_rc3kg",
      "wh_utama",
      "receipt",
      "10.0000",
      "250000.0000",
      "bt_rc_a",
      {
        type: "goods_receipt",
        id: "gr_1",
      },
      hoursAgo(600),
    ),
    mv(
      "prd_wsk",
      "wh_utama",
      "receipt",
      "60.0000",
      "31000.0000",
      "bt_wsk_a",
      {
        type: "goods_receipt",
        id: "gr_1",
      },
      hoursAgo(600),
    ),
    mv(
      "prd_rc3kg",
      "wh_utama",
      "receipt",
      "20.0000",
      "243750.0000",
      "bt_rc_b",
      {
        type: "goods_receipt",
        id: "gr_2",
      },
      hoursAgo(288),
    ),
    mv(
      "prd_wsk",
      "wh_utama",
      "receipt",
      "36.0000",
      "31000.0000",
      "bt_wsk_b",
      {
        type: "goods_receipt",
        id: "gr_3",
      },
      hoursAgo(72),
    ),
    mv(
      "prd_wsk",
      "wh_utama",
      "pos_sale",
      "-40.0000",
      "31000.0000",
      "bt_wsk_a",
      {
        type: "pos_transaction",
        id: "trx_1",
      },
      hoursAgo(48),
    ),
    mv(
      "prd_rc3kg",
      "wh_utama",
      "pos_sale",
      "-7.0000",
      "243750.0000",
      "bt_rc_a",
      {
        type: "pos_transaction",
        id: "trx_2",
      },
      hoursAgo(24),
    ),
    mv(
      "prd_rc3kg",
      "wh_utama",
      "pos_sale",
      "-3.0000",
      "243750.0000",
      "bt_rc_b",
      {
        type: "pos_transaction",
        id: "trx_2",
      },
      hoursAgo(24),
    ),
    mv(
      "prd_wsk",
      "wh_utama",
      "pos_sale",
      "-12.0000",
      "31000.0000",
      "bt_wsk_a",
      {
        type: "pos_transaction",
        id: "trx_3",
      },
      hoursAgo(4),
    ),
    mv(
      "prd_shampoo",
      "wh_utama",
      "receipt",
      "15.0000",
      "44000.0000",
      null,
      {
        type: "goods_receipt",
        id: "gr_2",
      },
      hoursAgo(288),
    ),
    mv(
      "prd_shampoo",
      "wh_utama",
      "pos_sale",
      "-2.0000",
      "44000.0000",
      null,
      {
        type: "pos_transaction",
        id: "trx_3",
      },
      hoursAgo(4),
    ),
  ];

  return {
    products,
    categories,
    warehouses,
    batches,
    movements,
    opnames: [],
    opnameItems: [],
  };
}

function mv(
  productId: string,
  warehouseId: string,
  movementType: MovementType,
  qty: string,
  hppAtTime: string | null,
  batchId: string | null,
  reference: StockMovement["reference"],
  createdAt: string,
  extra: Partial<StockMovement> = {},
): StockMovement {
  return {
    _id: nextId("mv"),
    tenantId: "t1",
    warehouseId,
    branchId: "br_timur",
    productId,
    movementType,
    qty,
    hppAtTime,
    batchId,
    destinationWarehouseId: null,
    bundleSourceId: null,
    reference,
    createdBy: "u1",
    createdAt,
    updatedAt: createdAt,
    ...extra,
  };
}

let state: DemoState = seed();

/** A snapshot for the hooks to render. Fresh arrays, so React sees a change. */
export function getState(): DemoState {
  return {
    products: [...state.products],
    categories: [...state.categories],
    warehouses: [...state.warehouses],
    batches: [...state.batches],
    movements: [...state.movements],
    opnames: [...state.opnames],
    opnameItems: [...state.opnameItems],
  };
}

/** Restores the fixtures. Wired to the "Reset data" button on the hub. */
export function resetState(): void {
  sequence = 0;
  state = seed();
}

/* ------------------------------------------------------------------ reads */

export function qtyOnHand(productId: string, warehouseId: string): string {
  const total = state.movements
    .filter((m) => m.productId === productId && m.warehouseId === warehouseId)
    .reduce<bigint>((acc, m) => acc + (toMinor(m.qty) ?? 0n), 0n);

  return toDecimalString(total);
}

/**
 * The lots FEFO would draw from, closest to expiring first.
 *
 * Only lots that still hold something: an exhausted lot cannot be picked from,
 * and an expired-but-empty one is not an action anybody has to take. Lots with
 * no expiry sort first (null leads an ascending sort), which degrades to plain
 * FIFO for them — those rows exist because the goods are consignment, not
 * because they rot.
 */
export function liveBatches(
  productId: string,
  warehouseId: string,
): ProductBatch[] {
  return state.batches
    .filter(
      (b) =>
        b.productId === productId &&
        b.warehouseId === warehouseId &&
        (toMinor(b.qtyRemaining) ?? 0n) > 0n,
    )
    .sort((a, b) => {
      const left = a.expiryDate ?? "";
      const right = b.expiryDate ?? "";
      if (left === right) return a.createdAt.localeCompare(b.createdAt);
      return left.localeCompare(right);
    });
}

/** Every lot at a warehouse, exhausted ones included — the batch list reads it. */
export function batchesAt(
  productId: string,
  warehouseId: string,
): ProductBatch[] {
  return state.batches
    .filter((b) => b.productId === productId && b.warehouseId === warehouseId)
    .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));
}

export function movementsFor(
  productId: string,
  warehouseId: string,
): StockMovement[] {
  return state.movements
    .filter((m) => m.productId === productId && m.warehouseId === warehouseId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* -------------------------------------------------------------- previews */

/**
 * How FEFO would satisfy `qty` — computed WITHOUT writing anything, so the form
 * can show it before the user commits.
 *
 * A short pick is reported rather than refused: the surplus is attached to the
 * last lot and flagged `short`, which is what the backend does. The goods left
 * the shelf; a negative lot is a visible discrepancy, an unrecorded sale is an
 * invisible one.
 */
export function previewFefo(
  productId: string,
  warehouseId: string,
  qty: string,
): FefoAllocation[] {
  const wanted = toMinor(qty);
  if (wanted === null || wanted <= 0n) return [];

  const lots = liveBatches(productId, warehouseId);
  if (lots.length === 0) {
    return [{ batch: null, qty: toDecimalString(wanted), short: true }];
  }

  const allocations: FefoAllocation[] = [];
  let remaining = wanted;

  for (const lot of lots) {
    if (remaining <= 0n) break;
    const available = toMinor(lot.qtyRemaining) ?? 0n;
    const take = available < remaining ? available : remaining;
    if (take > 0n) {
      allocations.push({
        batch: lot,
        qty: toDecimalString(take),
        short: false,
      });
      remaining -= take;
    }
  }

  if (remaining > 0n) {
    if (allocations.length > 0) {
      const last = allocations[allocations.length - 1];
      last.qty = toDecimalString((toMinor(last.qty) ?? 0n) + remaining);
      last.short = true;
    } else {
      allocations.push({
        batch: null,
        qty: toDecimalString(remaining),
        short: true,
      });
    }
  }

  return allocations;
}

export interface HppPreview {
  /** The average before this movement. */
  before: string | null;
  /** The average after it. Equal to `before` when nothing acquires stock. */
  after: string;
  /** Quantity on hand across every warehouse, which is what weights the average. */
  qtyBefore: string;
  qtyIn: string;
  unitCost: string;
  /** False for a transfer or an outbound movement — the average does not move. */
  changes: boolean;
}

/** Total quantity across every warehouse — the average is per PRODUCT. */
export function totalQty(productId: string): string {
  const total = state.movements
    .filter((m) => m.productId === productId)
    .reduce<bigint>((acc, m) => acc + (toMinor(m.qty) ?? 0n), 0n);
  return toDecimalString(total);
}

/**
 * What the weighted average becomes if `qtyIn` arrives at `costPerUnit`.
 *
 * An absent cost means "no new information" — an adjustment that found two extra
 * units on the shelf does not change what the stock cost, so it arrives at the
 * current average and the average does not move.
 */
export function previewHpp(
  productId: string,
  qtyIn: string,
  costPerUnit: string | null,
): HppPreview | null {
  const product = state.products.find((p) => p._id === productId);
  if (!product) return null;

  const incoming = toMinor(qtyIn);
  if (incoming === null || incoming <= 0n) return null;

  const currentAvg = toMinor(product.hppAvg ?? "0") ?? 0n;
  const currentQty = toMinor(totalQty(productId)) ?? 0n;
  const cost =
    costPerUnit && costPerUnit.trim() !== ""
      ? (toMinor(costPerUnit) ?? currentAvg)
      : currentAvg;

  const after = weightedAverage(currentAvg, currentQty, cost, incoming);

  return {
    before: product.hppAvg,
    after: toDecimalString(after),
    qtyBefore: toDecimalString(currentQty),
    qtyIn: toDecimalString(incoming),
    unitCost: toDecimalString(cost),
    changes: after !== currentAvg,
  };
}

/**
 * The double entry a movement produces, or an empty list when it produces none.
 *
 * Goods in debit Inventory; goods out credit it. The counter-account is what
 * separates a sale from a loss: shrinkage goes to `5201` rather than `5101` so
 * gross margin stays readable, which is why `movementType` is granular at all.
 */
export function previewJournal(
  movementType: MovementType,
  qty: string,
  hpp: string | null,
): JournalLine[] {
  if (JOURNAL_EXEMPT.includes(movementType)) return [];

  const quantity = toMinor(qty);
  const unit = toMinor(hpp ?? "0");
  if (quantity === null || unit === null) return [];

  const magnitude = quantity < 0n ? -quantity : quantity;
  const value = divideRound(magnitude * unit, 10n ** 4n);
  if (value === 0n) return [];

  const counter =
    movementType === "pos_sale" || movementType === "bundle_consume"
      ? ACCOUNT.cogs
      : ACCOUNT.loss;
  const inbound = quantity > 0n;
  const amount = toDecimalString(value);

  return inbound
    ? [
        {
          accountCode: ACCOUNT.inventory.code,
          accountName: ACCOUNT.inventory.name,
          debit: amount,
          credit: null,
        },
        {
          accountCode: counter.code,
          accountName: counter.name,
          debit: null,
          credit: amount,
        },
      ]
    : [
        {
          accountCode: counter.code,
          accountName: counter.name,
          debit: amount,
          credit: null,
        },
        {
          accountCode: ACCOUNT.inventory.code,
          accountName: ACCOUNT.inventory.name,
          debit: null,
          credit: amount,
        },
      ];
}

/* ------------------------------------------------------------------ writes */

/**
 * Posts a manual adjustment. Returns the movements written — an ARRAY, because
 * an outbound adjustment fans out across the lots FEFO drew from.
 */
export function postAdjustment(input: CreateAdjustmentInput): StockMovement[] {
  const product = state.products.find((p) => p._id === input.productId);
  if (!product) throw new Error(`Unknown product: ${input.productId}`);

  const qty = toMinor(input.qty);
  if (qty === null || qty === 0n) throw new Error("Quantity cannot be zero");

  const now = new Date().toISOString();
  const written: StockMovement[] = [];

  // Direction by SIGN, not by type. A positive adjustment takes the inbound
  // path — creating a lot and moving the average — because that is how opening
  // stock is entered.
  if (qty > 0n) {
    const preview = previewHpp(
      input.productId,
      input.qty,
      input.costPerUnit ?? null,
    );
    const needsBatch = product.hasExpiry || input.isConsignment === true;
    let batchId: string | null = null;

    if (needsBatch) {
      const batch: ProductBatch = {
        _id: nextId("bt"),
        tenantId: "t1",
        warehouseId: input.warehouseId,
        productId: input.productId,
        receiptId: null,
        batchCode: input.batchCode ?? "AUTO",
        expiryDate: input.expiryDate ?? null,
        initialQty: toDecimalString(qty),
        qtyRemaining: toDecimalString(qty),
        costPerUnit: preview?.unitCost ?? "0.0000",
        isConsignment: input.isConsignment === true,
        createdBy: "u1",
        createdAt: now,
        updatedAt: now,
      };
      state.batches = [...state.batches, batch];
      batchId = batch._id;
    }

    if (preview) product.hppAvg = preview.after;

    written.push(
      mv(
        input.productId,
        input.warehouseId,
        "adjustment",
        toDecimalString(qty),
        preview?.after ?? product.hppAvg,
        batchId,
        { type: "manual_adjustment", id: null },
        now,
      ),
    );
  } else {
    // Outbound: FEFO decides which lots supply it, one row per lot.
    const allocations = previewFefo(
      input.productId,
      input.warehouseId,
      toDecimalString(-qty),
    );

    for (const allocation of allocations) {
      if (allocation.batch) {
        applyToBatch(allocation.batch._id, `-${allocation.qty}`);
      }
      written.push(
        mv(
          input.productId,
          input.warehouseId,
          "adjustment",
          `-${allocation.qty}`,
          product.hppAvg,
          allocation.batch?._id ?? null,
          { type: "manual_adjustment", id: null },
          now,
        ),
      );
    }
  }

  state.movements = [...written, ...state.movements];
  return written;
}

/**
 * Posts a manual transfer. Returns AT LEAST two movements: for every lot FEFO
 * drew from, one `transfer_out` at the source and one `transfer_in` at the
 * destination — the mirror row carrying that lot's code, expiry and cost across.
 *
 * `receiptId` is dropped on the copy: the goods did not arrive on that receipt,
 * they arrived from another warehouse.
 */
export function postTransfer(input: CreateTransferInput): StockMovement[] {
  const product = state.products.find((p) => p._id === input.productId);
  if (!product) throw new Error(`Unknown product: ${input.productId}`);
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new Error("Source and destination warehouse must be different");
  }

  const qty = toMinor(input.qty);
  if (qty === null || qty <= 0n) throw new Error("Quantity must be positive");

  const now = new Date().toISOString();
  const transferId = nextId("tf");
  const reference = { type: "transfer_manual" as const, id: transferId };
  const allocations = previewFefo(
    input.productId,
    input.fromWarehouseId,
    toDecimalString(qty),
  );
  const written: StockMovement[] = [];

  for (const allocation of allocations) {
    if (allocation.batch)
      applyToBatch(allocation.batch._id, `-${allocation.qty}`);

    written.push(
      mv(
        input.productId,
        input.fromWarehouseId,
        "transfer_out",
        `-${allocation.qty}`,
        product.hppAvg,
        allocation.batch?._id ?? null,
        reference,
        now,
        { destinationWarehouseId: input.toWarehouseId },
      ),
    );

    let mirrorBatchId: string | null = null;
    if (allocation.batch) {
      const mirror: ProductBatch = {
        ...allocation.batch,
        _id: nextId("bt"),
        warehouseId: input.toWarehouseId,
        receiptId: null,
        initialQty: allocation.qty,
        qtyRemaining: allocation.qty,
        createdAt: now,
        updatedAt: now,
      };
      state.batches = [...state.batches, mirror];
      mirrorBatchId = mirror._id;
    }

    written.push(
      mv(
        input.productId,
        input.toWarehouseId,
        "transfer_in",
        allocation.qty,
        product.hppAvg,
        mirrorBatchId,
        reference,
        now,
      ),
    );
  }

  state.movements = [...written, ...state.movements];
  return written;
}

function applyToBatch(batchId: string, delta: string): void {
  state.batches = state.batches.map((batch) =>
    batch._id === batchId
      ? {
          ...batch,
          qtyRemaining: toDecimalString(
            (toMinor(batch.qtyRemaining) ?? 0n) + (toMinor(delta) ?? 0n),
          ),
          updatedAt: new Date().toISOString(),
        }
      : batch,
  );
}

/* --------------------------------------------------------------- catalogue */

/** Products of a given type, or all of them. Deleted rows are not kept here. */
export function productsOfType(type?: Product["productType"]): Product[] {
  return type
    ? state.products.filter((p) => p.productType === type)
    : state.products;
}

/** The variants hanging off one parent, in creation order. */
export function variantsOf(parentId: string): Product[] {
  return state.products.filter((p) => p.parentId === parentId);
}

/**
 * A bundle's availability, derived rather than stored.
 *
 * A bundle holds no stock of its own: selling one consumes its components, so
 * how many you can sell is capped by whichever component runs out first. Storing
 * a number here would be a second opinion that drifts the moment a component
 * moves.
 */
export function bundleAvailability(
  productId: string,
  warehouseId: string,
): string {
  const bundle = state.products.find((p) => p._id === productId);
  const components = bundle?.bundleConfig?.components ?? [];
  if (components.length === 0) return "0.0000";

  const possible = components.map((component) => {
    const per = toMinor(component.qty) ?? 0n;
    if (per <= 0n) return 0n;
    const have =
      toMinor(qtyOnHand(component.componentProductId ?? "", warehouseId)) ?? 0n;
    // Whole bundles only — a half-built dus is not sellable.
    return have > 0n ? (have / per) * SCALE : 0n;
  });

  return toDecimalString(
    possible.reduce((min, v) => (v < min ? v : min), possible[0]),
  );
}

const SCALE = 10n ** 4n;

/**
 * What a product costs to make, for a bundle: the sum of its components'
 * averages, weighted by how many of each go in. Null when any component has no
 * cost basis yet — a partial answer here would read as a real margin.
 */
export function bundleHpp(productId: string): string | null {
  const bundle = state.products.find((p) => p._id === productId);
  const components = bundle?.bundleConfig?.components ?? [];
  if (components.length === 0) return null;

  let total = 0n;
  for (const component of components) {
    const item = state.products.find(
      (p) => p._id === component.componentProductId,
    );
    if (!item?.hppAvg) return null;
    total += divideRound(
      (toMinor(item.hppAvg) ?? 0n) * (toMinor(component.qty) ?? 0n),
      SCALE,
    );
  }
  return toDecimalString(total);
}

/** The price a bundle sells at — the fixed one, or its components' sum. */
export function bundlePrice(productId: string): string | null {
  const bundle = state.products.find((p) => p._id === productId);
  const config = bundle?.bundleConfig;
  if (!config) return null;
  if (config.pricingMode === "fixed") return config.fixedPrice;

  let total = 0n;
  for (const component of config.components) {
    const item = state.products.find(
      (p) => p._id === component.componentProductId,
    );
    if (!item?.sellPrice) return null;
    total += divideRound(
      (toMinor(item.sellPrice) ?? 0n) * (toMinor(component.qty) ?? 0n),
      SCALE,
    );
  }
  return toDecimalString(total);
}

/**
 * The cartesian product of a parent's axes — every variant that will be created.
 *
 * Pure, and exported so the form can PREVIEW the combinations before anything is
 * saved. Two axes of three and two values make six variants; a user who cannot
 * see that number before pressing save finds out by scrolling a list.
 */
export function variantCombinations(axes: VariantAxis[]): string[][] {
  const filled = axes.filter((axis) => axis.values.length > 0);
  if (filled.length === 0) return [];

  return filled.reduce<string[][]>(
    (acc, axis) =>
      acc.flatMap((combo) => axis.values.map((value) => [...combo, value])),
    [[]],
  );
}

export interface SaveProductInput {
  id?: string;
  sku: string;
  name: string;
  productType: Product["productType"];
  categoryId: string;
  unit: string;
  barcode?: string;
  sellPrice?: string;
  minStock?: number;
  hasExpiry?: boolean;
  /** On a parent. */
  variantAxes?: VariantAxis[];
  /** On a parent — one row per combination, carrying its own SKU and price. */
  variants?: Array<{
    id?: string;
    combo: string[];
    sku: string;
    barcode?: string;
    sellPrice?: string;
    minStock?: number;
  }>;
  /** On a bundle. */
  bundleConfig?: Product["bundleConfig"];
  /** Opening stock, standalone only — posts an inbound adjustment on create. */
  openingQty?: string;
  openingCost?: string;
  openingWarehouseId?: string;
}

/**
 * Creates or updates a catalogue product, including its variants.
 *
 * A PARENT WRITES ITS CHILDREN TOO. The form edits one thing — "Royal Canin
 * Adult, in sizes and flavours" — while the catalogue stores a parent plus one
 * row per combination. Splitting that across two screens would make an
 * incomplete family representable, and the POS would show a tile that expands
 * into nothing.
 *
 * `productType` is fixed after creation, mirroring the backend: turning a
 * standalone into a parent would strand the stock rows written against the old
 * shape.
 */
export function saveProduct(input: SaveProductInput): Product {
  const now = new Date().toISOString();
  const existing = input.id
    ? state.products.find((p) => p._id === input.id)
    : undefined;

  const base: Product = {
    _id: existing?._id ?? nextId("prd"),
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    productType: existing?.productType ?? input.productType,
    parentId: null,
    variantAxes:
      input.productType === "parent" ? (input.variantAxes ?? []) : [],
    variantAttributes: null,
    bundleConfig:
      input.productType === "bundle" ? (input.bundleConfig ?? null) : null,
    // A parent is an abstraction nobody scans and nothing counts.
    barcode:
      input.productType === "parent" ? null : input.barcode?.trim() || null,
    minStock:
      input.productType === "standalone"
        ? (input.minStock ?? 0)
        : (existing?.minStock ?? 0),
    hasExpiry:
      input.productType === "bundle" ? false : (input.hasExpiry ?? false),
    categoryId: input.categoryId,
    unit: input.unit.trim(),
    // A parent carries no price; a bundle's mirrors its fixed price.
    sellPrice:
      input.productType === "parent"
        ? null
        : input.productType === "bundle"
          ? (input.bundleConfig?.fixedPrice ?? null)
          : (input.sellPrice ?? null),
    hppAvg: existing?.hppAvg ?? null,
    isActive: existing?.isActive ?? true,
  };

  state.products = existing
    ? state.products.map((p) => (p._id === base._id ? base : p))
    : [...state.products, base];

  if (base.productType === "parent") {
    const axisNames = (input.variantAxes ?? [])
      .filter((axis) => axis.values.length > 0)
      .map((axis) => axis.name);

    for (const variant of input.variants ?? []) {
      const attributes: Record<string, string> = {};
      variant.combo.forEach((value, index) => {
        attributes[axisNames[index]] = value;
      });

      const previous = variant.id
        ? state.products.find((p) => p._id === variant.id)
        : undefined;

      const row: Product = {
        _id: previous?._id ?? nextId("prd"),
        sku: variant.sku.trim().toUpperCase(),
        name: `${base.name} — ${variant.combo.join(" / ")}`,
        productType: "variant",
        parentId: base._id,
        variantAxes: [],
        variantAttributes: attributes,
        bundleConfig: null,
        barcode: variant.barcode?.trim() || null,
        minStock: variant.minStock ?? 0,
        // Inherited from the parent, never set on the variant: a variant filed
        // under a different category than its parent is a reporting bug, and
        // whether goods expire is a property of the goods rather than the size.
        hasExpiry: base.hasExpiry,
        categoryId: base.categoryId,
        unit: base.unit,
        sellPrice: variant.sellPrice ?? null,
        hppAvg: previous?.hppAvg ?? null,
        isActive: previous?.isActive ?? true,
      };

      state.products = previous
        ? state.products.map((p) => (p._id === row._id ? row : p))
        : [...state.products, row];
    }
  }

  // Opening stock, entered on the create form rather than as a separate errand.
  // It posts an ordinary inbound adjustment, so the ledger explains where the
  // first quantity came from instead of it simply existing.
  if (!existing && input.openingQty && (toMinor(input.openingQty) ?? 0n) > 0n) {
    postAdjustment({
      operation: "adjustment",
      productId: base._id,
      warehouseId: input.openingWarehouseId ?? state.warehouses[0]._id,
      qty: input.openingQty,
      costPerUnit: input.openingCost,
      batchCode: base.hasExpiry ? "OPENING" : undefined,
      expiryDate: base.hasExpiry ? dayOffset(180) : undefined,
    });
  }

  void now;
  return base;
}

/**
 * Removes a product, or refuses when its history would be orphaned.
 *
 * Mirrors the backend's three guards. A product that has ever moved is
 * deactivated rather than deleted: deleting it would leave stock-card rows
 * pointing at something no report can name.
 */
export function deleteProduct(productId: string): {
  ok: boolean;
  reason?: string;
} {
  const product = state.products.find((p) => p._id === productId);
  if (!product) return { ok: false, reason: "Produk tidak ditemukan." };

  const variants = variantsOf(productId);
  if (variants.length > 0) {
    return {
      ok: false,
      reason: `Produk ini masih punya ${variants.length} varian. Hapus variannya dulu, atau nonaktifkan saja.`,
    };
  }

  const inBundle = state.products.filter((p) =>
    p.bundleConfig?.components.some((c) => c.componentProductId === productId),
  );
  if (inBundle.length > 0) {
    return {
      ok: false,
      reason: `Produk ini komponen dari ${inBundle.length} bundle. Keluarkan dari bundle-nya dulu.`,
    };
  }

  const moved = state.movements.some((m) => m.productId === productId);
  if (moved) {
    return {
      ok: false,
      reason:
        "Produk ini sudah punya riwayat pergerakan stok. Nonaktifkan saja supaya kartu stok dan HPP tetap utuh.",
    };
  }

  state.products = state.products.filter((p) => p._id !== productId);
  return { ok: true };
}

/** Flips a product between active and inactive — the alternative to deleting. */
export function toggleProductActive(productId: string): void {
  state.products = state.products.map((p) =>
    p._id === productId ? { ...p, isActive: !p.isActive } : p,
  );
}

export function addCategory(name: string): Category {
  const category: Category = { _id: nextId("cat"), name: name.trim() };
  state.categories = [...state.categories, category];
  return category;
}

/* ------------------------------------------------------------ stock opname */

let opnameSequence = 0;

/**
 * Opens a count sheet, SNAPSHOTTING the system quantity and cost of every
 * product at this warehouse.
 *
 * The snapshot is the point. A count takes an afternoon, and sales keep
 * happening while it runs; comparing tonight's physical count against tonight's
 * system number would fold every sale made during the count into the variance.
 * Freezing both numbers when the sheet opens means the difference measures what
 * it claims to.
 */
export function startOpname(warehouseId: string, notes = ""): Opname {
  opnameSequence += 1;
  const opname: Opname = {
    _id: nextId("op"),
    opnameNumber: `OP-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${String(
      opnameSequence,
    ).padStart(3, "0")}`,
    warehouseId,
    opnameDate: new Date().toISOString().slice(0, 10),
    status: "draft",
    totalDiffValue: "0.0000",
    submittedBy: null,
    submittedAt: null,
    notes,
  };

  const items: OpnameItem[] = state.products
    // Only what can actually hold stock: a parent's quantity is its variants'
    // and a bundle has none of its own, so neither can be counted.
    .filter(
      (p) =>
        p.isActive &&
        (p.productType === "standalone" || p.productType === "variant"),
    )
    .map((p) => ({
      _id: nextId("opi"),
      opnameId: opname._id,
      productId: p._id,
      systemQty: qtyOnHand(p._id, warehouseId),
      physicalQty: null,
      hppAtOpname: p.hppAvg,
    }));

  state.opnames = [opname, ...state.opnames];
  state.opnameItems = [...state.opnameItems, ...items];
  return opname;
}

export function opnameItemsOf(opnameId: string): OpnameItem[] {
  return state.opnameItems.filter((item) => item.opnameId === opnameId);
}

/** Records a counted quantity. Null clears it back to "not counted yet". */
export function setOpnameCount(
  itemId: string,
  physicalQty: string | null,
): void {
  state.opnameItems = state.opnameItems.map((item) =>
    item._id === itemId ? { ...item, physicalQty } : item,
  );
}

/** The variance on one line: counted minus system, and what that is worth. */
export function opnameDiff(
  item: OpnameItem,
): { qty: bigint; value: bigint } | null {
  if (item.physicalQty === null) return null;
  const qty =
    (toMinor(item.physicalQty) ?? 0n) - (toMinor(item.systemQty) ?? 0n);
  const value = divideRound(
    qty * (toMinor(item.hppAtOpname ?? "0") ?? 0n),
    SCALE,
  );
  return { qty, value };
}

/** The whole sheet's variance — what the journal will post. */
export function opnameTotal(opnameId: string): string {
  const total = opnameItemsOf(opnameId).reduce<bigint>((acc, item) => {
    const diff = opnameDiff(item);
    return diff ? acc + diff.value : acc;
  }, 0n);
  return toDecimalString(total);
}

/**
 * Finalises a count: writes one `opname_diff` movement per line that differs,
 * and freezes the sheet.
 *
 * Lines counted equal to the system write NOTHING — a movement of zero is a row
 * with no meaning that every report then has to skip. Lines left blank are
 * skipped too: "not counted" is not the same claim as "counted zero", and
 * treating them alike would write off every product the counter did not reach.
 */
export function submitOpname(
  opnameId: string,
  submittedBy = "Fitria",
): StockMovement[] {
  const opname = state.opnames.find((o) => o._id === opnameId);
  if (!opname) throw new Error("Opname tidak ditemukan");
  if (opname.status === "submitted") throw new Error("Opname ini sudah final");

  const now = new Date().toISOString();
  const written: StockMovement[] = [];

  for (const item of opnameItemsOf(opnameId)) {
    const diff = opnameDiff(item);
    if (!diff || diff.qty === 0n) continue;

    written.push(
      mv(
        item.productId,
        opname.warehouseId,
        "opname_diff",
        toDecimalString(diff.qty),
        item.hppAtOpname,
        null,
        { type: "stock_opname", id: opnameId },
        now,
      ),
    );
  }

  state.movements = [...written, ...state.movements];
  state.opnames = state.opnames.map((o) =>
    o._id === opnameId
      ? {
          ...o,
          status: "submitted",
          totalDiffValue: opnameTotal(opnameId),
          submittedBy,
          submittedAt: now,
        }
      : o,
  );

  return written;
}

/**
 * Can this product hold a quantity of its own?
 *
 * Only `standalone` and `variant` can. A `parent` is an abstraction over its
 * variants and a `bundle` consumes its components, so the API refuses a movement
 * against either — which makes this the same filter every stock picker needs,
 * and the reason it lives here rather than being retyped in three screens.
 */
export function canHoldStock(product: Product): boolean {
  return product.productType === "standalone" || product.productType === "variant";
}

/** The first product a stock screen can legitimately default to. */
export function firstStockProduct(products: Product[]): Product | undefined {
  return products.find(canHoldStock);
}
