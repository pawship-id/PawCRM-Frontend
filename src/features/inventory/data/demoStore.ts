import { batchCodeHint } from "@/lib/batchCode";
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
  Product,
  ProductBatch,
  StockMovement,
  StockWarehouse,
  VariantAxis,
} from "@/types/inventory";
import type {
  GoodsReceipt,
  GoodsReceiptItem,
  PurchaseInvoice,
  PurchaseReturn,
  PurchaseReturnItem,
  ReverseHppPreview,
  SaveSupplierInput,
  SubmitPaymentInput,
  SubmitPurchaseReturnInput,
  SubmitReceiptInput,
  Supplier,
  SupplierPayment,
} from "@/types/purchasing";

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
/**
 * The labels the real API resolves for every lot, stubbed as null.
 *
 * This store backs prototype screens that render a batch code and nothing else;
 * `productName` and friends exist so the demo fixtures still satisfy the type
 * the API defines. Filling them in would mean maintaining a second copy of the
 * catalogue inside the fixture.
 */
const DEMO_BATCH_LABELS = {
  productName: null,
  productSku: null,
  productUnit: null,
  warehouseName: null,
} as const;

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
  suppliers: Supplier[];
  receipts: GoodsReceipt[];
  receiptItems: GoodsReceiptItem[];
  invoices: PurchaseInvoice[];
  payments: SupplierPayment[];
  purchaseReturns: PurchaseReturn[];
  purchaseReturnItems: PurchaseReturnItem[];
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
    isConsignment: false,
    isPreorder: false,
    categoryId: "cat_makanan_kucing",
    unit: "pcs",
    sellPrice: null,
    hppAvg: null,
    isActive: true,
    // The API assembles this per read from `productstocks`; this store keeps its
    // quantities in `state.stock` and answers them through qtyOnHand(), so the
    // field is present and empty rather than absent — a demo product is not a
    // product with unknown stock.
    stockByWarehouse: [],
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
      batchCode: "RCA3KG-260924",
      supplierBatchCode: "RC-B26-0455",
      expiryDate: dayOffset(24),
      initialQty: "10.0000",
      qtyRemaining: "3.0000",
      costPerUnit: "250000.0000",
      isConsignment: false,
      createdBy: "u1",
      createdAt: hoursAgo(600),
      updatedAt: hoursAgo(20),
      ...DEMO_BATCH_LABELS,
    },
    {
      _id: "bt_rc_b",
      tenantId: "t1",
      warehouseId: "wh_utama",
      productId: "prd_rc3kg",
      receiptId: "gr_2",
      batchCode: "RCA3KG-261120",
      supplierBatchCode: "RC-B26-0512",
      expiryDate: dayOffset(180),
      initialQty: "20.0000",
      qtyRemaining: "17.0000",
      costPerUnit: "240000.0000",
      isConsignment: false,
      createdBy: "u1",
      createdAt: hoursAgo(288),
      updatedAt: hoursAgo(20),
      ...DEMO_BATCH_LABELS,
    },
    {
      _id: "bt_wsk_a",
      tenantId: "t1",
      warehouseId: "wh_utama",
      productId: "prd_wsk",
      receiptId: "gr_1",
      batchCode: "WSKM-261120",
      supplierBatchCode: "WSK-B26-0512",
      expiryDate: dayOffset(5),
      initialQty: "60.0000",
      qtyRemaining: "8.0000",
      costPerUnit: "31000.0000",
      isConsignment: false,
      createdBy: "u1",
      createdAt: hoursAgo(600),
      updatedAt: hoursAgo(4),
      ...DEMO_BATCH_LABELS,
    },
    {
      _id: "bt_wsk_b",
      tenantId: "t1",
      warehouseId: "wh_utama",
      productId: "prd_wsk",
      receiptId: "gr_3",
      batchCode: "WSKM-270310",
      supplierBatchCode: "WSK-B26-0640",
      expiryDate: dayOffset(150),
      initialQty: "36.0000",
      qtyRemaining: "36.0000",
      costPerUnit: "31000.0000",
      isConsignment: false,
      createdBy: "u1",
      createdAt: hoursAgo(72),
      updatedAt: hoursAgo(72),
      ...DEMO_BATCH_LABELS,
    },
  ];

  const suppliers: Supplier[] = [
    {
      _id: "sup_sps",
      name: "PT Sumber Pakan Sejahtera",
      supplierType: "beli_putus",
      picName: "Pak Hendra",
      phone: "031-8877-221",
      email: "sales@sumberpakan.co.id",
      address: "Jl. Rungkut Industri 21, Surabaya",
      npwp: "01.234.567.8-609.000",
      paymentTermDays: 30,
      notes: null,
      isActive: true,
    },
    {
      _id: "sup_anugerah",
      name: "CV Anugerah Petshop",
      supplierType: "konsinyasi",
      picName: "Bu Lina",
      phone: "0812-5566-7788",
      email: "lina@anugerahpet.id",
      address: "Jl. Kapas Krampung 5, Surabaya",
      npwp: null,
      paymentTermDays: 0,
      notes: "Titip barang, bayar setelah laku.",
      isActive: true,
    },
    {
      _id: "sup_vetindo",
      name: "PT Vetindo Farma",
      supplierType: "both",
      picName: "Dr. Ratna",
      phone: "031-5544-100",
      email: "order@vetindo.co.id",
      address: "Jl. Raya Darmo 190, Surabaya",
      npwp: "02.999.111.4-609.000",
      paymentTermDays: 14,
      notes: null,
      isActive: true,
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
    suppliers,
    receipts: [],
    receiptItems: [],
    invoices: [],
    payments: [],
    purchaseReturns: [],
    purchaseReturnItems: [],
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
    notes: null,
    lineNotes: null,
    createdAt,
    updatedAt: createdAt,

    /**
     * The fields the real API computes on read, stubbed as null.
     *
     * This store backs the two manual-movement FORMS, which show what a posting
     * would produce — a row that does not exist yet and therefore has no balance
     * and no resolved labels. The stock card, which is the only screen that
     * renders them, reads the real API. Filling them in here would mean
     * reimplementing the server's cumulative sum to decorate a preview nobody
     * displays.
     */
    balanceAfter: null,
    batchCode: null,
    supplierBatchCode: null,
    batchExpiryDate: null,
    createdByName: null,
    warehouseName: null,
    destinationWarehouseName: null,
    productName: null,
    productSku: null,
    productUnit: null,
    referenceNo: null,

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
    suppliers: [...state.suppliers],
    receipts: [...state.receipts],
    receiptItems: [...state.receiptItems],
    invoices: [...state.invoices],
    payments: [...state.payments],
    purchaseReturns: [...state.purchaseReturns],
    purchaseReturnItems: [...state.purchaseReturnItems],
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
        /*
          THE SHAPE, NOT THE UNIQUENESS. The real gateway probes for a free code
          and suffixes past the ones taken (see the server's
          StockMovementService#generateBatchCode); the demo store has one shop's
          worth of rows and no such contention, so the stem alone is honest
          enough for a screen that is only showing what a form would produce.
        */
        batchCode: batchCodeHint(
          product.sku,
          input.expiryDate ?? "",
          dayOffset(0),
        ),
        supplierBatchCode: input.supplierBatchCode ?? null,
        expiryDate: input.expiryDate ?? null,
        initialQty: toDecimalString(qty),
        qtyRemaining: toDecimalString(qty),
        costPerUnit: preview?.unitCost ?? "0.0000",
        isConsignment: input.isConsignment === true,
        createdBy: "u1",
        createdAt: now,
        updatedAt: now,
        ...DEMO_BATCH_LABELS,
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
 * Posts a manual transfer of ONE OR MORE products. Returns AT LEAST two
 * movements per product: for every lot FEFO drew from, one `transfer_out` at the
 * source and one `transfer_in` at the destination — the mirror row carrying that
 * lot's code, expiry and cost across.
 *
 * ONE `reference.id` FOR THE WHOLE TRANSFER, whatever it carries. That id is
 * what ties the products together into one movement; minting one per product
 * would write the same rows and lose the only thing that says they belong
 * together.
 *
 * `receiptId` is dropped on the copy: the goods did not arrive on that receipt,
 * they arrived from another warehouse.
 */
export function postTransfer(input: CreateTransferInput): StockMovement[] {
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new Error("Source and destination warehouse must be different");
  }
  if (input.items.length === 0) {
    throw new Error("A transfer needs at least one product");
  }

  const seen = new Set<string>();
  for (const item of input.items) {
    if (seen.has(item.productId)) {
      // Mirrors the API: FEFO reads the lots once per line, so a product twice
      // would allocate the same goods twice.
      throw new Error(`Duplicate product in transfer: ${item.productId}`);
    }
    seen.add(item.productId);
  }

  const now = new Date().toISOString();
  const transferId = nextId("tf");
  const reference = { type: "transfer_manual" as const, id: transferId };
  const notes = input.notes ?? null;
  const written: StockMovement[] = [];

  for (const item of input.items) {
    const product = state.products.find((p) => p._id === item.productId);
    if (!product) throw new Error(`Unknown product: ${item.productId}`);

    const qty = toMinor(item.qty);
    if (qty === null || qty <= 0n) throw new Error("Quantity must be positive");

    const lineNotes = item.notes ?? null;
    const allocations = previewFefo(
      item.productId,
      input.fromWarehouseId,
      toDecimalString(qty),
    );

    for (const allocation of allocations) {
      if (allocation.batch)
        applyToBatch(allocation.batch._id, `-${allocation.qty}`);

      written.push(
        mv(
          item.productId,
          input.fromWarehouseId,
          "transfer_out",
          `-${allocation.qty}`,
          product.hppAvg,
          allocation.batch?._id ?? null,
          reference,
          now,
          {
            destinationWarehouseId: input.toWarehouseId,
            notes,
            lineNotes,
          },
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
          item.productId,
          input.toWarehouseId,
          "transfer_in",
          allocation.qty,
          product.hppAvg,
          mirrorBatchId,
          reference,
          now,
          // The inbound half inherits the line's reason from the outbound half
          // it mirrors — otherwise the destination warehouse's card is the one
          // that cannot explain itself.
          { notes, lineNotes },
        ),
      );
    }
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

/**
 * The component that caps the availability above — what to restock to move the
 * number.
 *
 * Worth surfacing because the cap is rarely the component a user is looking at.
 * A package of 3 kibble and 1 vitamin, with 14 kibble and 2 vitamins, makes 2;
 * somebody reading "2" next to a shelf of 14 kibble has no way to guess it is
 * the vitamin holding it back. Null when the bundle has no components.
 */
export function bundleLimitedBy(
  productId: string,
  warehouseId: string,
): Product | null {
  const bundle = state.products.find((p) => p._id === productId);
  const components = bundle?.bundleConfig?.components ?? [];

  let lowest: bigint | null = null;
  let limiting: string | null = null;

  for (const component of components) {
    const per = toMinor(component.qty) ?? 0n;
    const have =
      toMinor(qtyOnHand(component.componentProductId ?? "", warehouseId)) ?? 0n;
    const possible = per > 0n && have > 0n ? have / per : 0n;

    if (lowest === null || possible < lowest) {
      lowest = possible;
      limiting = component.componentProductId ?? null;
    }
  }

  return state.products.find((p) => p._id === limiting) ?? null;
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
  /** On a parent it applies to the whole family — the rows below never set it. */
  isConsignment?: boolean;
  /** Per product, never inherited. Absent is `false`, as at the API. */
  isPreorder?: boolean;
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
    /**
     * Opening stock for THIS variant. Per row rather than one number for the
     * family, because a parent holds no stock of its own — 12 of the 1kg and 3
     * of the 3kg is the only shape the answer comes in.
     */
    openingQty?: string;
    openingCost?: string;
  }>;
  /** On a bundle. */
  bundleConfig?: Product["bundleConfig"];
  /**
   * Opening stock for a STANDALONE. A parent carries its own per variant above,
   * and a bundle takes none at all — it holds no stock, so there is nothing to
   * open a balance on.
   */
  openingQty?: string;
  openingCost?: string;
  /** Where every opening quantity in this save lands. Shared by the variants. */
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
    // Same shape as hasExpiry directly above, mirroring the API: a bundle owns
    // no stock to be titipan, and the value set here is what each variant row
    // below copies.
    isConsignment:
      input.productType === "bundle" ? false : (input.isConsignment ?? false),
    // Every type may set this one, and an unanswered flag is `false` — the same
    // rule the API applies.
    isPreorder: input.isPreorder ?? false,
    // See the fixture builder: quantities live in `state.stock`, not here.
    stockByWarehouse: [],
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

  /**
   * Products created by this save that carry an opening quantity.
   *
   * Collected rather than posted inline because a variant's row has to EXIST in
   * `state.products` before an adjustment against it can compute a weighted
   * average — posting mid-loop would price the second variant against a
   * catalogue that does not yet contain the first.
   */
  const opening: Array<{ product: Product; qty: string; cost?: string }> = [];

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
        isConsignment: base.isConsignment,
        // Not inherited, unlike isConsignment directly above: a row that says
        // nothing says no.
        isPreorder: false,
        // Inherited from the parent, never set on the variant: a variant filed
        // under a different category than its parent is a reporting bug, and
        // whether goods expire is a property of the goods rather than the size.
        hasExpiry: base.hasExpiry,
        categoryId: base.categoryId,
        unit: base.unit,
        stockByWarehouse: [],
        sellPrice: variant.sellPrice ?? null,
        hppAvg: previous?.hppAvg ?? null,
        isActive: previous?.isActive ?? true,
      };

      state.products = previous
        ? state.products.map((p) => (p._id === row._id ? row : p))
        : [...state.products, row];

      // Only a variant this save BROUGHT INTO EXISTENCE. Re-saving a family to
      // fix a price must not top the shelves up a second time, and `previous`
      // is what tells the two apart.
      if (!previous && variant.openingQty) {
        opening.push({
          product: row,
          qty: variant.openingQty,
          cost: variant.openingCost,
        });
      }
    }
  }

  if (base.productType === "standalone" && !existing && input.openingQty) {
    opening.push({
      product: base,
      qty: input.openingQty,
      cost: input.openingCost,
    });
  }

  /**
   * Opening stock, entered on the create form rather than as a separate errand.
   *
   * It posts an ordinary inbound adjustment — the same call the Adjustment
   * screen makes — so the stock card explains where the first quantity came
   * from instead of it simply existing. There is no "opening balance" movement
   * type to reach for: the backend's ledger calls this an `adjustment`, and
   * inventing a second vocabulary here would put the prototype out of step with
   * the API it stands in for.
   */
  for (const item of opening) {
    if ((toMinor(item.qty) ?? 0n) <= 0n) continue;

    postAdjustment({
      operation: "adjustment",
      productId: item.product._id,
      warehouseId: input.openingWarehouseId ?? state.warehouses[0]._id,
      qty: item.qty,
      costPerUnit: item.cost,
      supplierBatchCode: undefined,
      expiryDate: item.product.hasExpiry ? dayOffset(180) : undefined,
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

/**
 * Can this product hold a quantity of its own?
 *
 * Only `standalone` and `variant` can. A `parent` is an abstraction over its
 * variants and a `bundle` consumes its components, so the API refuses a movement
 * against either — which makes this the same filter every stock picker needs,
 * and the reason it lives here rather than being retyped in three screens.
 */
export function canHoldStock(product: Product): boolean {
  return (
    product.productType === "standalone" || product.productType === "variant"
  );
}

/** The first product a stock screen can legitimately default to. */
export function firstStockProduct(products: Product[]): Product | undefined {
  return products.find(canHoldStock);
}

/* ============================================================== PURCHASING */

/**
 * Purchasing lives in this module rather than its own because it SHARES state
 * with inventory — a goods receipt writes stock movements, creates lots and
 * moves the weighted average. Splitting the two would mean two modules mutating
 * one set of arrays, which is the bug this file exists to avoid.
 *
 * THE DIVISION OF LABOUR, and it mirrors what the backend will do: purchasing
 * owns the DOCUMENT (who supplied it, what it cost, what is owed) and delegates
 * the stock consequences. Receiving does not reimplement FEFO, batch creation or
 * the average — it calls the same paths an adjustment does.
 */

const ACCOUNT_TAX_IN = { code: "1301", name: "PPN Masukan" };
const ACCOUNT_PAYABLE = { code: "2101", name: "Utang Supplier" };
const ACCOUNT_CASH = { code: "1101", name: "Kas" };
const ACCOUNT_BANK = { code: "1102", name: "Bank" };

let documentSequence = 0;

/** `GR-260802-001` — a human-facing running number, reset per prefix. */
function nextDocumentNumber(prefix: string): string {
  documentSequence += 1;
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `${prefix}-${stamp}-${String(documentSequence).padStart(3, "0")}`;
}

export function suppliersOf(): Supplier[] {
  return state.suppliers;
}

export function receiptItemsOf(receiptId: string): GoodsReceiptItem[] {
  return state.receiptItems.filter((item) => item.receiptId === receiptId);
}

export function receiptsOfSupplier(supplierId: string): GoodsReceipt[] {
  return state.receipts.filter((receipt) => receipt.supplierId === supplierId);
}

export function purchaseReturnItemsOf(returnId: string): PurchaseReturnItem[] {
  return state.purchaseReturnItems.filter((item) => item.returnId === returnId);
}

/** What is still owed on one invoice. */
export function outstandingOf(invoice: PurchaseInvoice): string {
  return toDecimalString(
    (toMinor(invoice.total) ?? 0n) - (toMinor(invoice.paidAmount) ?? 0n),
  );
}

/** What is still owed to one supplier, across every unpaid invoice. */
export function supplierOutstanding(supplierId: string): string {
  const total = state.invoices
    .filter(
      (invoice) =>
        invoice.supplierId === supplierId && invoice.status !== "paid",
    )
    .reduce<bigint>(
      (acc, invoice) => acc + (toMinor(outstandingOf(invoice)) ?? 0n),
      0n,
    );
  return toDecimalString(total);
}

/**
 * How much of a receipt line has already gone back.
 *
 * Caps the return form so the same delivery cannot be returned twice — which
 * would credit the supplier for goods they were only ever sent once, and reverse
 * the weighted average twice over.
 */
export function returnedQtyOf(receiptItemId: string): string {
  const total = state.purchaseReturnItems
    .filter((item) => item.originalReceiptItemId === receiptItemId)
    .reduce<bigint>((acc, item) => acc + (toMinor(item.qty) ?? 0n), 0n);
  return toDecimalString(total);
}

/* --------------------------------------------------------------- suppliers */

export function saveSupplier(input: SaveSupplierInput): Supplier {
  const existing = input.id
    ? state.suppliers.find((supplier) => supplier._id === input.id)
    : undefined;

  const supplier: Supplier = {
    _id: existing?._id ?? nextId("sup"),
    name: input.name.trim(),
    supplierType: input.supplierType,
    picName: input.picName?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    npwp: input.npwp?.trim() || null,
    paymentTermDays: input.paymentTermDays,
    notes: input.notes?.trim() || null,
    isActive: existing?.isActive ?? true,
  };

  state.suppliers = existing
    ? state.suppliers.map((s) => (s._id === supplier._id ? supplier : s))
    : [...state.suppliers, supplier];

  return supplier;
}

/**
 * Removes a supplier, or refuses when its purchase history would be orphaned.
 *
 * A supplier that has ever delivered is deactivated rather than deleted: the
 * receipts that formed the current HPP point at it, and removing it would leave
 * every one of those unable to say where the goods came from.
 */
export function deleteSupplier(supplierId: string): {
  ok: boolean;
  reason?: string;
} {
  const supplier = state.suppliers.find((s) => s._id === supplierId);
  if (!supplier) return { ok: false, reason: "Supplier tidak ditemukan." };

  const receipts = receiptsOfSupplier(supplierId);
  if (receipts.length > 0) {
    return {
      ok: false,
      reason: `Supplier ini punya ${receipts.length} penerimaan barang. Menghapusnya akan memutus jejak pembelian dan HPP — nonaktifkan saja.`,
    };
  }

  state.suppliers = state.suppliers.filter((s) => s._id !== supplierId);
  return { ok: true };
}

export function toggleSupplierActive(supplierId: string): void {
  state.suppliers = state.suppliers.map((supplier) =>
    supplier._id === supplierId
      ? { ...supplier, isActive: !supplier.isActive }
      : supplier,
  );
}

/* --------------------------------------------------------- goods receipts */

/**
 * Records goods arriving — and this is the first real CALLER of the stock
 * gateway rather than a second implementation of it.
 *
 * WHAT HAPPENS, in order, and why the order matters:
 *   1. every line posts an inbound movement, which creates the lot (when the
 *      product expires or the goods are consigned) and recomputes the weighted
 *      average from the price actually paid;
 *   2. the receipt document is written, linking those lines;
 *   3. an OUTRIGHT purchase creates a payable and posts the ledger.
 *
 * CONSIGNMENT DOES NEITHER (3). The goods sit in the warehouse but belong to the
 * supplier until they sell, so nothing has been bought: no payable, no journal.
 * The stock still moves — it is physically there and a customer can buy it —
 * which is exactly why the two halves are separable at all.
 *
 * `costPerUnit` on a consignment line is the HPP entered by hand: there was no
 * purchase to derive a cost from, and a margin report needs some number.
 */
export function submitReceipt(input: SubmitReceiptInput): GoodsReceipt {
  if (input.items.length === 0) {
    throw new Error("Penerimaan butuh minimal satu barang.");
  }

  const supplier = state.suppliers.find((s) => s._id === input.supplierId);
  if (!supplier) throw new Error("Supplier tidak ditemukan.");

  const receiptId = nextId("gr");
  const consignment = input.receiptType === "konsinyasi";
  const lines: GoodsReceiptItem[] = [];
  let subtotal = 0n;

  for (const line of input.items) {
    const qty = toMinor(line.qty);
    const cost = toMinor(line.costPerUnit);
    if (qty === null || qty <= 0n)
      throw new Error("Qty setiap barang harus lebih dari nol.");
    if (cost === null || cost < 0n) throw new Error("Harga beli tidak valid.");

    // The gateway does the stock work: lot creation, the weighted average, and
    // the movement row. Purchasing only says what arrived and what it cost.
    const [movement] = postAdjustment({
      operation: "adjustment",
      productId: line.productId,
      warehouseId: input.warehouseId,
      qty: line.qty,
      costPerUnit: line.costPerUnit,
      supplierBatchCode: line.supplierBatchCode,
      expiryDate: line.expiryDate,
      isConsignment: consignment,
    });

    // Re-stamped as a receipt: the movement was posted through the adjustment
    // path, but the DOCUMENT behind it is a goods receipt, and a stock card that
    // called this "penyesuaian" would hide where the goods came from.
    state.movements = state.movements.map((m) =>
      m._id === movement._id
        ? {
            ...m,
            movementType: "receipt" as MovementType,
            reference: { type: "goods_receipt" as const, id: receiptId },
          }
        : m,
    );

    const lineSubtotal = divideRound(qty * cost, SCALE);
    subtotal += lineSubtotal;

    lines.push({
      _id: nextId("gri"),
      receiptId,
      productId: line.productId,
      batchId: movement.batchId,
      qty: toDecimalString(qty),
      costPerUnit: toDecimalString(cost),
      subtotal: toDecimalString(lineSubtotal),
    });
  }

  const tax = consignment ? 0n : (toMinor(input.taxAmount ?? "0") ?? 0n);

  const receipt: GoodsReceipt = {
    _id: receiptId,
    receiptNumber: nextDocumentNumber("GR"),
    supplierId: input.supplierId,
    warehouseId: input.warehouseId,
    receiptDate: input.receiptDate,
    receiptType: input.receiptType,
    totalAmount: toDecimalString(subtotal),
    taxAmount: toDecimalString(tax),
    invoiceId: null,
    notes: input.notes?.trim() || null,
    createdBy: "u1",
    createdAt: new Date().toISOString(),
  };

  state.receiptItems = [...state.receiptItems, ...lines];

  if (!consignment) {
    const due = new Date(input.receiptDate);
    due.setDate(due.getDate() + supplier.paymentTermDays);

    const invoice: PurchaseInvoice = {
      _id: nextId("pi"),
      invoiceNumber: input.invoiceNumber?.trim() || nextDocumentNumber("PI"),
      supplierId: input.supplierId,
      goodsReceiptId: receiptId,
      invoiceDate: input.receiptDate,
      dueDate: due.toISOString().slice(0, 10),
      subtotal: toDecimalString(subtotal),
      taxAmount: toDecimalString(tax),
      total: toDecimalString(subtotal + tax),
      paidAmount: "0.0000",
      status: "unpaid",
    };

    state.invoices = [invoice, ...state.invoices];
    receipt.invoiceId = invoice._id;
  }

  state.receipts = [receipt, ...state.receipts];
  return receipt;
}

/** The double entry an outright receipt posts. Consignment posts nothing. */
export function previewReceiptJournal(
  subtotal: string,
  tax: string,
  consignment: boolean,
): JournalLine[] {
  if (consignment) return [];

  const sub = toMinor(subtotal) ?? 0n;
  const taxMinor = toMinor(tax) ?? 0n;
  if (sub === 0n && taxMinor === 0n) return [];

  const lines: JournalLine[] = [
    {
      accountCode: ACCOUNT.inventory.code,
      accountName: ACCOUNT.inventory.name,
      debit: toDecimalString(sub),
      credit: null,
    },
  ];

  // PPN is an asset the tenant reclaims, not part of what the goods cost — so
  // it goes to 1301 rather than inflating the inventory value and, through it,
  // every margin computed from HPP.
  if (taxMinor > 0n) {
    lines.push({
      accountCode: ACCOUNT_TAX_IN.code,
      accountName: ACCOUNT_TAX_IN.name,
      debit: toDecimalString(taxMinor),
      credit: null,
    });
  }

  lines.push({
    accountCode: ACCOUNT_PAYABLE.code,
    accountName: ACCOUNT_PAYABLE.name,
    debit: null,
    credit: toDecimalString(sub + taxMinor),
  });

  return lines;
}

/* ---------------------------------------------------------------- payments */

/** Cash and QRIS leave the till; transfer and giro leave the bank. */
export function cashAccountFor(method: SubmitPaymentInput["method"]) {
  return method === "cash" || method === "qris" ? ACCOUNT_CASH : ACCOUNT_BANK;
}

export function previewPaymentJournal(
  amount: string,
  method: SubmitPaymentInput["method"],
): JournalLine[] {
  const value = toMinor(amount) ?? 0n;
  if (value <= 0n) return [];

  const cash = cashAccountFor(method);
  return [
    {
      accountCode: ACCOUNT_PAYABLE.code,
      accountName: ACCOUNT_PAYABLE.name,
      debit: toDecimalString(value),
      credit: null,
    },
    {
      accountCode: cash.code,
      accountName: cash.name,
      debit: null,
      credit: toDecimalString(value),
    },
  ];
}

/**
 * Records a payment against one invoice. Partial payments are ordinary — a
 * tenant paying half now and half next month is the common case, not an edge
 * one, so the status is derived from the running total rather than toggled.
 */
export function submitPayment(input: SubmitPaymentInput): SupplierPayment {
  const invoice = state.invoices.find((i) => i._id === input.invoiceId);
  if (!invoice) throw new Error("Faktur tidak ditemukan.");

  const amount = toMinor(input.amount);
  if (amount === null || amount <= 0n)
    throw new Error("Jumlah pembayaran harus lebih dari nol.");

  const outstanding = toMinor(outstandingOf(invoice)) ?? 0n;
  if (amount > outstanding) {
    throw new Error(
      `Jumlah melebihi sisa tagihan ${toDecimalString(outstanding)}.`,
    );
  }

  const paid = (toMinor(invoice.paidAmount) ?? 0n) + amount;
  const total = toMinor(invoice.total) ?? 0n;

  state.invoices = state.invoices.map((i) =>
    i._id === invoice._id
      ? {
          ...i,
          paidAmount: toDecimalString(paid),
          status: paid <= 0n ? "unpaid" : paid >= total ? "paid" : "partial",
        }
      : i,
  );

  const payment: SupplierPayment = {
    _id: nextId("pay"),
    supplierId: invoice.supplierId,
    invoiceId: invoice._id,
    paymentDate: input.paymentDate,
    amount: toDecimalString(amount),
    method: input.method,
    referenceNumber: input.referenceNumber?.trim() || null,
    notes: input.notes?.trim() || null,
    createdBy: "u1",
  };

  state.payments = [payment, ...state.payments];
  return payment;
}

export function paymentsOf(invoiceId: string): SupplierPayment[] {
  return state.payments.filter((payment) => payment.invoiceId === invoiceId);
}

/* --------------------------------------------------------- purchase return */

/**
 * The REVERSE weighted average: what the remaining stock is worth once goods
 * bought at a known price go back.
 *
 *   newAvg = (qty × avg − qtyReturned × ORIGINAL price) ÷ (qty − qtyReturned)
 *
 * THE ORIGINAL PRICE, NOT THE RUNNING AVERAGE, and this is the whole reason a
 * return is tied to its receipt line. Reversing at today's average would take
 * out a different amount of value than was ever put in, and the stock left
 * behind would be valued at a number nobody paid.
 *
 * The counter-intuitive consequence, worth showing the user: returning goods
 * that were CHEAPER than the average makes the remaining stock more expensive.
 * That is arithmetically correct — the cheap units are gone — but it looks like
 * a bug the first time somebody sees HPP rise after a return.
 *
 * Null when the return empties the stock: there is nothing left to carry a cost.
 */
export function previewReverseHpp(
  productId: string,
  qtyReturned: string,
  originalCost: string,
  isConsignmentLot: boolean,
): ReverseHppPreview | null {
  const product = state.products.find((p) => p._id === productId);
  if (!product) return null;

  const qtyBefore = toMinor(totalQty(productId)) ?? 0n;
  const avgBefore = toMinor(product.hppAvg ?? "0") ?? 0n;
  const returned = toMinor(qtyReturned) ?? 0n;
  const cost = toMinor(originalCost) ?? 0n;
  const qtyAfter = qtyBefore - returned;

  const base: ReverseHppPreview = {
    productName: product.name,
    qtyBefore: toDecimalString(qtyBefore),
    hppBefore: product.hppAvg,
    qtyReturned: toDecimalString(returned),
    originalCost: toDecimalString(cost),
    qtyAfter: toDecimalString(qtyAfter),
    hppAfter: product.hppAvg,
    skipped: isConsignmentLot,
  };

  // A consignment lot carries the supplier's own cost and never contributed to
  // the average, so taking it back must not disturb it either.
  if (isConsignmentLot) return base;

  if (qtyAfter <= 0n) return { ...base, hppAfter: null };

  const remainingValue = avgBefore * qtyBefore - cost * returned;
  return {
    ...base,
    hppAfter: toDecimalString(divideRound(remainingValue, qtyAfter)),
  };
}

/**
 * Sends goods back to the supplier.
 *
 * Three things move together: stock leaves, the weighted average is reversed at
 * the original price, and the payable shrinks. The invoice reduction is what
 * keeps the supplier statement and the ledger agreeing — a return that lowered
 * the stock but not the debt would have the tenant paying for goods it no longer
 * holds.
 */
export function submitPurchaseReturn(
  input: SubmitPurchaseReturnInput,
): PurchaseReturn {
  const receipt = state.receipts.find((r) => r._id === input.originalReceiptId);
  if (!receipt) throw new Error("Penerimaan asal tidak ditemukan.");
  if (input.items.length === 0)
    throw new Error("Pilih minimal satu barang untuk diretur.");

  const returnId = nextId("pr");
  const now = new Date().toISOString();
  const lines: PurchaseReturnItem[] = [];
  let total = 0n;

  for (const line of input.items) {
    const receiptItem = state.receiptItems.find(
      (item) => item._id === line.originalReceiptItemId,
    );
    if (!receiptItem) throw new Error("Baris penerimaan tidak ditemukan.");

    const qty = toMinor(line.qty);
    if (qty === null || qty <= 0n) continue;

    const already = toMinor(returnedQtyOf(receiptItem._id)) ?? 0n;
    const received = toMinor(receiptItem.qty) ?? 0n;
    if (already + qty > received) {
      throw new Error(
        `Qty retur melebihi yang diterima untuk salah satu barang.`,
      );
    }

    const batch = receiptItem.batchId
      ? state.batches.find((b) => b._id === receiptItem.batchId)
      : undefined;
    const consignmentLot = batch?.isConsignment === true;

    // Reverse the average at the ORIGINAL price — see previewReverseHpp.
    const preview = previewReverseHpp(
      receiptItem.productId,
      toDecimalString(qty),
      receiptItem.costPerUnit,
      consignmentLot,
    );
    if (preview && !preview.skipped) {
      state.products = state.products.map((p) =>
        p._id === receiptItem.productId
          ? { ...p, hppAvg: preview.hppAfter }
          : p,
      );
    }

    // Stock leaves from the lot it arrived on, not by FEFO: these specific goods
    // are going back to the supplier who sent them.
    if (receiptItem.batchId) {
      applyToBatch(receiptItem.batchId, `-${toDecimalString(qty)}`);
    }

    state.movements = [
      mv(
        receiptItem.productId,
        receipt.warehouseId,
        "purchase_return",
        toDecimalString(-qty),
        state.products.find((p) => p._id === receiptItem.productId)?.hppAvg ??
          null,
        receiptItem.batchId,
        { type: "purchase_return", id: returnId },
        now,
      ),
      ...state.movements,
    ];

    const subtotal = divideRound(
      qty * (toMinor(receiptItem.costPerUnit) ?? 0n),
      SCALE,
    );
    total += subtotal;

    lines.push({
      _id: nextId("pri"),
      returnId,
      productId: receiptItem.productId,
      batchId: receiptItem.batchId,
      originalReceiptItemId: receiptItem._id,
      qty: toDecimalString(qty),
      costPerUnit: receiptItem.costPerUnit,
      subtotal: toDecimalString(subtotal),
      reason: line.reason,
    });
  }

  const purchaseReturn: PurchaseReturn = {
    _id: returnId,
    returnNumber: nextDocumentNumber("PR"),
    supplierId: receipt.supplierId,
    warehouseId: receipt.warehouseId,
    originalReceiptId: receipt._id,
    returnDate: input.returnDate,
    totalAmount: toDecimalString(total),
    createdBy: "u1",
    createdAt: now,
  };

  state.purchaseReturnItems = [...state.purchaseReturnItems, ...lines];
  state.purchaseReturns = [purchaseReturn, ...state.purchaseReturns];

  // The debt shrinks by what went back, so the statement and the ledger agree.
  state.invoices = state.invoices.map((invoice) => {
    if (invoice.goodsReceiptId !== receipt._id) return invoice;

    const newTotal = (toMinor(invoice.total) ?? 0n) - total;
    const paid = toMinor(invoice.paidAmount) ?? 0n;

    return {
      ...invoice,
      subtotal: toDecimalString((toMinor(invoice.subtotal) ?? 0n) - total),
      total: toDecimalString(newTotal),
      status: paid <= 0n ? "unpaid" : paid >= newTotal ? "paid" : "partial",
    };
  });

  return purchaseReturn;
}

export function previewReturnJournal(total: string): JournalLine[] {
  const value = toMinor(total) ?? 0n;
  if (value <= 0n) return [];

  return [
    {
      accountCode: ACCOUNT_PAYABLE.code,
      accountName: ACCOUNT_PAYABLE.name,
      debit: toDecimalString(value),
      credit: null,
    },
    {
      accountCode: ACCOUNT.inventory.code,
      accountName: ACCOUNT.inventory.name,
      debit: null,
      credit: toDecimalString(value),
    },
  ];
}
