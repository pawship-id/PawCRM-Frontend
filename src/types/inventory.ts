/**
 * The Inventory module's backend contract — `stockmovements`, `productbatches`
 * and the product fields the stock screens read.
 *
 * Kept in sync with PawCRM-Backend by hand, the same rule `types/api.ts`
 * follows. Three things here are NOT arbitrary and must not be "simplified":
 *
 *  1. QUANTITIES AND MONEY ARE STRINGS. The backend stores Decimal128 and
 *     renders decimal strings on the wire ("150000.0000"), never JSON numbers,
 *     because `JSON.parse("199999.99")` is already not 199999.99 before any of
 *     our code runs. Typing these as `number` here would reintroduce exactly the
 *     float error the backend went to some trouble to remove. Parse late, at the
 *     point of display or arithmetic, never at the type boundary.
 *  2. THE SIGN IS THE DIRECTION. `qty` is positive for goods in and negative for
 *     goods out. There is no separate direction field.
 *  3. ONE REQUEST CAN PRODUCE MANY MOVEMENTS. Creating a movement returns an
 *     ARRAY: a withdrawal spanning three lots writes three rows, a transfer
 *     writes at least two. A caller that assumed a single object would silently
 *     drop the rest.
 */

/** What kind of stock change a movement is. Mirrors MOVEMENT_TYPES. */
export type MovementType =
  | "receipt"
  | "pos_sale"
  /**
   * Goods leaving against an issued invoice (PCR-030).
   *
   * ITS OWN TYPE RATHER THAN `pos_sale`, for the same reason `pos_void` has one:
   * a stock card is read to answer "where did this go", and an invoice is not a
   * till sale. One shop sells across a counter and bills a kennel monthly;
   * folding both under `pos_sale` would make "how much went out over the
   * counter" unanswerable.
   */
  | "invoice_sale"
  /**
   * A voided sale's goods coming back.
   *
   * ITS OWN TYPE RATHER THAN `customer_return`, for the reason
   * `opening_balance` has one: a void filed under the returns label would make
   * "what did customers actually bring back" unanswerable, and that number is
   * how a shop notices it stocks something people do not want. Nothing came back
   * in a void — the sale is being unwound because it should not have happened.
   */
  | "pos_void"
  | "opname_diff"
  | "purchase_return"
  | "customer_return"
  | "transfer_out"
  | "transfer_in"
  | "bundle_consume"
  | "adjustment"
  /**
   * The stock a tenant starts with, written only when a product is created
   * carrying `openingStock`. Its journal credits equity (3101 Modal / Saldo
   * Awal) rather than the inventory-loss account an `adjustment` uses — day-one
   * goods are capital the owner brought in, not a miscount.
   */
  | "opening_balance";

/** Which document caused a movement. Mirrors REFERENCE_TYPES. */
export type ReferenceType =
  | "goods_receipt"
  | "pos_transaction"
  /** The invoice the goods left against. See `invoice_sale`. */
  | "customer_invoice"
  /**
   * A void's stock reversal. Distinct from `pos_transaction` so the movements a
   * sale made and the movements unwinding it are separately findable — and so
   * the gateway posts no journal for the second set, since a void's ledger is
   * two reversals of the sale's own entries.
   */
  | "pos_void"
  | "stock_opname"
  | "purchase_return"
  | "customer_return"
  | "transfer_manual"
  | "bundle_consume"
  | "manual_adjustment"
  /** Carries `reference.id: null`. A client cannot create one — see above. */
  | "opening_balance";

/**
 * The two operations a CLIENT may create over HTTP. Everything else is posted
 * service-to-service by the module that owns the document — a client able to
 * claim `goods_receipt` could conjure stock no purchase order accounts for.
 */
export type StockOperation = "adjustment" | "transfer";

/** One row of the immutable stock ledger. */
export interface StockMovement {
  _id: string;
  tenantId: string;
  warehouseId: string;
  branchId: string | null;
  productId: string;
  movementType: MovementType;
  /** Decimal string. Positive = in, negative = out. Never zero. */
  qty: string;
  /** Decimal string — `products.hppAvg` at the moment of this movement. */
  hppAtTime: string | null;
  batchId: string | null;
  /** On `transfer_out` only — descriptive; the paired row drives the credit. */
  destinationWarehouseId: string | null;
  /** On `bundle_consume` only — the bundle whose sale consumed this component. */
  bundleSourceId: string | null;
  reference: { type: ReferenceType; id: string | null };
  createdBy: string | null;
  /**
   * WHY this happened, in the words of whoever did it — the one thing a stock
   * card cannot reconstruct from its own numbers.
   *
   * `notes` belongs to the whole posting and is repeated on every row of it;
   * `lineNotes` belongs to the one product line this row came from, and a
   * transfer's `transfer_in` inherits it from the `transfer_out` it mirrors.
   * Both null for the movements no human typed.
   */
  notes: string | null;
  lineNotes: string | null;
  createdAt: string;
  updatedAt: string;
  /** No `deletedAt`: the ledger is append-only. Corrections are new rows. */

  /* ------------------------------------------- computed by the API, not stored */

  /**
   * The stock level this movement left behind — a decimal string.
   *
   * Summed over the WHOLE ledger of the product/warehouse pair, INCLUDING the
   * rows the request's filters hide. That is why it comes from the server: a
   * card filtered to "only sales" still has to show the true stock level after
   * each sale, and a client can only sum the rows it was sent.
   *
   * NULL unless the request named both `productId` and `warehouseId`. Summed
   * across products a balance adds sacks of feed to bottles of shampoo, so the
   * API answers "does not apply" rather than guessing.
   */
  balanceAfter: string | null;

  /* -------------------------------------------------- labels for the bare ids */
  /* Each may be null where the id is not: a label is for display and its row may
     have been deleted, an id is the thing to link to. */

  /** OURS — generated, unique, and what the lot's label is printed with. */
  batchCode: string | null;
  /** THEIRS — the number on the carton, or null when nobody recorded one. */
  supplierBatchCode: string | null;
  batchExpiryDate: string | null;
  createdByName: string | null;
  warehouseName: string | null;
  destinationWarehouseName: string | null;
  /**
   * The product's own labels.
   *
   * The stock card never needed them — it is one product by definition and its
   * name is in the heading. A view spanning SEVERAL products is the opposite
   * shape: one document, a dozen products, and the name IS the row.
   */
  productName: string | null;
  productSku: string | null;
  productUnit: string | null;
  /**
   * The NUMBER of the document behind this row — "OPN-2026-0007" where
   * `reference.type` only says `stock_opname`.
   *
   * NULL FOR MOST ROWS, and that is the honest answer rather than a gap:
   * `goodsreceipts` and `postransactions` are not collections in the backend
   * yet, so there is no number to read, and a manual adjustment or a transfer
   * has no document at all by design. Only stock opname can fill it today
   * (PawCRM-Backend 0.24.0).
   *
   * A renderer therefore falls back to the type label — never to the raw
   * `reference.id`, which names nothing a human can look up.
   */
  referenceNo: string | null;
}

/**
 * GET /api/stock-movements — a page of the ledger, plus where it starts from.
 *
 * `openingBalance` is the balance immediately BEFORE the page's oldest row, so
 * a reader can check the page's own arithmetic: opening, plus every row's `qty`,
 * equals the newest row's `balanceAfter`.
 *
 * Null when the balance is unanswerable (a list spanning products) and on an
 * empty page — "before nothing" is not zero, and a zero would read as "the
 * warehouse was empty".
 */
export interface StockMovementPage {
  items: StockMovement[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  openingBalance: string | null;
}

/**
 * GET /api/stock-movements/summary — totals for everything matching the filters,
 * not for the page.
 *
 * `totalOut` is NEGATIVE, as the ledger stores it: the sign is the direction
 * everywhere in this module, and flipping it for display would make
 * `totalIn + totalOut === net` false — the one arithmetic a reader checks.
 */
export interface StockMovementSummary {
  /** Decimal strings. */
  totalIn: string;
  totalOut: string;
  net: string;
  movementCount: number;
}

/** One lot of one product at one warehouse. */
export interface ProductBatch {
  _id: string;
  tenantId: string;
  warehouseId: string;
  productId: string;
  /** Null for opening stock — there was no purchase order behind it. */
  receiptId: string | null;
  /**
   * OUR code for this lot — generated, and unique within the tenant the way an
   * SKU is. It is what the label is barcoded with and what a till scans, which
   * is why nothing may type one: see `lib/batchCode`.
   */
  batchCode: string;
  /**
   * THEIR code — the batch number printed on the carton by whoever made it.
   *
   * Optional and deliberately NOT unique: one factory batch split across three
   * deliveries is three lots here, and a recall has to pull all three.
   */
  supplierBatchCode: string | null;
  /** Required by the backend when the product has `hasExpiry: true`. */
  expiryDate: string | null;
  initialQty: string;
  /** Decimal string. May be NEGATIVE when a withdrawal outran the lots. */
  qtyRemaining: string;
  /** This lot's own cost. Does NOT drive the ledger — `hppAvg` does. */
  costPerUnit: string;
  isConsignment: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;

  /* ------------------------------------------- labels, resolved by the API */
  /* A lot names its product and its warehouse by id, and the screen that reads
     this collection spans BOTH — so a client would need the whole catalogue in
     memory to render one row. Each may be null where the id is not: a label is
     for display, an id is what a client links to. */

  productName: string | null;
  productSku: string | null;
  productUnit: string | null;
  warehouseName: string | null;
}

/**
 * GET /api/product-batches/summary — the four tiles above the expiry alert.
 *
 * THE BUCKETS ARE MUTUALLY EXCLUSIVE, unlike the `/expiring` list, which is
 * cumulative. That is the difference between a list and a set of tiles: a list
 * is read top-down and leads with the most urgent rows, while tiles sit side by
 * side and must not count the same lot twice. `atRisk` is genuinely the other
 * three added up.
 *
 * `value` is the figure a client cannot produce for itself — summing
 * `qtyRemaining × costPerUnit` needs every row, and summing the page on screen
 * would report a number that grows as the user pages.
 */
export interface BatchExpiryBucket {
  count: number;
  /** Decimal string — Σ sisa × harga beli lot. */
  value: string;
}

export interface BatchExpirySummary {
  /** The date has passed and the goods are still on the shelf. */
  expired: BatchExpiryBucket;
  /** Expires within `criticalDays`. */
  critical: BatchExpiryBucket;
  /** Expires within `withinDays`. */
  soon: BatchExpiryBucket;
  /** The three above, added up. */
  atRisk: BatchExpiryBucket;
  /** Echoed back so a caption need not hardcode its own number. */
  criticalDays: number;
  withinDays: number;
}

/** The product fields the stock screens need. A subset of the catalogue type. */
export interface StockProduct {
  _id: string;
  sku: string;
  name: string;
  unit: string;
  /** When true, an inbound movement MUST carry a batch code and expiry. */
  hasExpiry: boolean;
  /** Decimal string — the perpetual weighted average. Null until first receipt. */
  hppAvg: string | null;
  minStock: number;
}

/** A stock location. */
export interface StockWarehouse {
  _id: string;
  name: string;
  isActive: boolean;
  /** Which books a movement here posts against, before the session fallback. */
  defaultBranchId: string | null;
}

/** POST /api/stock-movements — the manual adjustment payload. */
export interface CreateAdjustmentInput {
  operation: "adjustment";
  productId: string;
  warehouseId: string;
  /** Signed decimal STRING. Negative writes stock off. */
  qty: string;
  /**
   * THEIR code, off the carton. Optional.
   *
   * There is no `batchCode` here and sending one is a 400: ours is generated by
   * the server, because a code a client could choose is a code two lots could
   * end up sharing — and a scanned label has to name one lot.
   */
  supplierBatchCode?: string;
  expiryDate?: string;
  costPerUnit?: string;
  isConsignment?: boolean;
  /** Why the balance was corrected. Stored on the ledger row, ≤500 characters. */
  notes?: string;
  /**
   * A token that makes a RETRY safe, 8–64 characters.
   *
   * A manual adjustment has no upstream document, so the API cannot tell a
   * retried request from a second deliberate one — and stock is the one number
   * where guessing wrong needs a physical count to undo. Send the SAME key when
   * retrying an attempt that may have landed, and a NEW one for a new intent.
   */
  idempotencyKey?: string;
}

/** One product line of a transfer. */
export interface TransferItemInput {
  productId: string;
  /** Decimal STRING, and must be POSITIVE — direction comes from the two ids. */
  qty: string;
  /**
   * WHICH LOT LEAVES THE SHELF — an existing batch at the SOURCE warehouse.
   *
   * REQUIRED by the API for a product with `hasExpiry`, omitted for every other
   * one. A person loading a van is holding a particular carton, and FEFO would
   * answer a question they have already answered — writing off a lot still on
   * the shelf and re-creating its expiry at the destination. Absent, the server
   * runs FEFO exactly as it always has.
   *
   * A lot is NAMED, never described: its expiry and cost travel with the goods,
   * so there is nothing here to disagree with them.
   *
   * THE DESTINATION LOT IS RELABELLED. Codes are unique within the tenant, so
   * the row created at the far warehouse gets a new one — same stem, a suffix —
   * and the carton has to be relabelled when it lands.
   */
  batchId?: string;
  /** This line's own reason, distinct from the transfer's. ≤500 characters. */
  notes?: string;
}

/**
 * POST /api/stock-movements — the manual transfer payload.
 *
 * ONE SOURCE, ONE DESTINATION, MANY PRODUCTS. "Siapkan barang untuk bazar" is
 * normally several products leaving the same warehouse at the same moment, and
 * filing them as separate requests would give each one its own `reference.id` —
 * so nothing could answer "what went to the bazaar", and a failure halfway would
 * leave some goods moved and some not, with no document to unwind.
 *
 * Each product may appear ONCE. The API refuses a duplicate: FEFO reads the
 * source lots once per line and does not subtract what an earlier line of the
 * same posting already took, so two lines for one product would allocate the
 * same goods twice.
 */
export interface CreateTransferInput {
  operation: "transfer";
  fromWarehouseId: string;
  toWarehouseId: string;
  /** At least one, at most 50, and `productId` unique across them. */
  items: TransferItemInput[];
  /** Why the whole transfer happened. Stamped on every row it writes. */
  notes?: string;
  /** See CreateAdjustmentInput — same token, same reason. */
  idempotencyKey?: string;
}

export type CreateStockMovementInput =
  CreateAdjustmentInput | CreateTransferInput;

/**
 * POST /api/stock-movements/preview — what the create WOULD write.
 *
 * Takes the create's payload minus `idempotencyKey`, and writes nothing. It
 * exists so a client never has to reimplement FEFO, the weighted average, or
 * which account a shrinkage books to — three rules that used to live in
 * `features/inventory/utils/preview.ts` and could drift from the server without
 * anything failing.
 */
export type PreviewStockMovementInput =
  | Omit<CreateAdjustmentInput, "idempotencyKey">
  | Omit<CreateTransferInput, "idempotencyKey">;

/** One LEDGER ROW the posting would write — not one per requested line. */
export interface PreviewMovementRow {
  warehouseId: string;
  warehouseName: string;
  productId: string;
  /**
   * Resolved by the server, because a transfer may move several products and a
   * panel that groups its rows by product cannot label the groups from ids.
   */
  productName: string;
  movementType: MovementType;
  /** Decimal string. Signed, as the ledger stores it. */
  qty: string;
  hppAtTime: string;
  /** The existing lot this row would draw from; null when it would create one. */
  batchId: string | null;
  /**
   * THE CODE THE LOT WOULD ACTUALLY BE SAVED WITH, suffix and all.
   *
   * Load-bearing now that nobody types one: this is the only way a form can
   * show the code before the goods are saved and a label is printed. Deriving
   * it in the browser would get the stem right and the suffix wrong.
   */
  batchCode: string | null;
  supplierBatchCode: string | null;
  batchExpiryDate: string | null;
  isNewBatch: boolean;
  destinationWarehouseId: string | null;
  /**
   * True on the row that would drive a lot below zero.
   *
   * The posting is still written — the goods left the shelf — so this is a
   * warning, never a blocker. A negative lot is a visible discrepancy; an
   * unrecorded withdrawal is an invisible one.
   */
  short: boolean;
  /** The note on the requested line this row came from, echoed back. */
  lineNotes: string | null;
}

/**
 * The weighted average a posting would leave behind, and the working behind it.
 *
 * `qtyBefore` is the quantity across EVERY warehouse, because the average is a
 * property of the product: weighting per location would mean a transfer changed
 * the cost of goods nobody traded.
 */
export interface HppCalculation {
  /** Null when no average has formed yet — the first valued receipt. */
  before: string | null;
  after: string;
  qtyBefore: string;
  qtyIn: string;
  unitCost: string;
}

/** `HppCalculation` as the API returns it, which always names its product. */
export interface PreviewHpp extends Omit<HppCalculation, "before"> {
  productId: string;
  before: string;
}

export interface StockMovementPreview {
  movements: PreviewMovementRow[];
  /** Empty when nothing acquires stock — an outbound draws at the average it has. */
  hppAvg: PreviewHpp[];
  /** Empty for a transfer: inventory value does not change, so nothing is posted. */
  journal: JournalLine[];
}

/** One line of a double-entry posting, as the preview renders it. */
export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: string | null;
  credit: string | null;
}

/**
 * How FEFO proposes to satisfy an outbound quantity — the preview a user sees
 * BEFORE submitting.
 *
 * Worth surfacing because it is the one thing about this module nobody can
 * predict from the form: "take 10" can become three ledger rows, and which lots
 * they come from decides what the customer physically receives.
 */
export interface FefoAllocation {
  batch: ProductBatch | null;
  /** Decimal string, always positive — the magnitude drawn from this lot. */
  qty: string;
  /** True when this line drives the lot's remaining balance below zero. */
  short: boolean;
}

/* ------------------------------------------------------- catalogue (v2/v2.1) */

/**
 * The four catalogue shapes. Fixed, not tenant-configurable: each has different
 * rules in the service, the POS and the stock ledger, so a fifth would have no
 * defined behaviour anywhere.
 *
 *   standalone — an ordinary item. Has a price, holds stock, is scanned.
 *   parent     — an abstract grouping ("Royal Canin Adult"). Holds NO stock and
 *                has NO price; it exists so the POS shows one tile that expands
 *                into its variants. Owns `variantAxes`.
 *   variant    — a concrete sellable item under a parent. Carries the barcode.
 *   bundle     — a package sold as one line that CONSUMES its components.
 */
export type ProductType = "standalone" | "parent" | "variant" | "bundle";

/** How a bundle is priced. `auto` sums the components at sale time. */
export type BundlePricingMode = "fixed" | "auto";

/** One axis of variation on a parent — `{ name: "Ukuran", values: [...] }`. */
export interface VariantAxis {
  name: string;
  values: string[];
}

/** One component of a bundle. `qty` is decimal — a bundle may consume 0.5 kg. */
export interface BundleComponent {
  componentType: "product" | "service";
  componentProductId: string | null;
  componentServiceId: string | null;
  qty: string;
}

export interface BundleConfig {
  pricingMode: BundlePricingMode;
  /** Set under `fixed` only; null under `auto`. Decimal string. */
  fixedPrice: string | null;
  components: BundleComponent[];
}

/** A tenant's product category — the label the catalogue groups by. */
export interface Category {
  _id: string;
  name: string;
}

/**
 * The full catalogue product, as `/api/products` returns it.
 *
 * `StockProduct` above is the subset the stock screens need; this is the shape
 * the catalogue screens edit. Kept separate so a stock table does not have to
 * carry variant axes it never reads.
 */
export interface Product {
  _id: string;
  /**
   * Null on a `parent` — an abstraction nobody sells, prices or scans. The code
   * staff quote and the till looks up is the VARIANT's, which always has one.
   */
  sku: string | null;
  name: string;
  productType: ProductType;
  /** Set on a `variant` only — the parent it belongs to. */
  parentId: string | null;
  /** On a `parent` only. */
  variantAxes: VariantAxis[];
  /** On a `variant` only — `{ Ukuran: "3kg", Rasa: "Chicken" }`. */
  variantAttributes: Record<string, string> | null;
  /** On a `bundle` only. */
  bundleConfig: BundleConfig | null;
  /** Unique per tenant. Null on a `parent` — nobody scans an abstraction. */
  barcode: string | null;
  minStock: number;
  hasExpiry: boolean;
  /**
   * Goods held on consignment — titipan. On the shelf, not owned: the vendor is
   * paid out of what sells and the rest goes back.
   *
   * NOT NULLABLE and not optional, unlike the marketplace fields below. Every
   * product predates the field, so the API normalises it to a real boolean on
   * read rather than leaving each screen to spell `?? false`.
   *
   * A variant always AGREES with its parent — the API copies it down, the way
   * it copies `hasExpiry` — so this is never read through `resolved`.
   */
  isConsignment: boolean;
  categoryId: string;
  unit: string;
  /** Decimal string. Null on a `parent`, and on a `bundle` priced `auto`. */
  sellPrice: string | null;
  /** Decimal string. Server-owned cache; null on `parent` and `bundle`. */
  hppAvg: string | null;
  isActive: boolean;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt?: string | null;

  /**
   * ─── The marketplace fields ────────────────────────────────────────────
   *
   * These are the STORED values. On a `variant`, `null` means "follow the
   * parent" — read `resolved` below for the effective value.
   *
   * ⚠️ BIND FORM INPUTS TO THESE, never to `resolved`. Loading a resolved value
   * into an input and saving turns an inherited value into an explicit override,
   * silently, on a save the user thought changed something else entirely.
   */
  brand?: string | null;
  /** Sanitised HTML — for a marketplace or storefront listing. */
  description?: string | null;
  /**
   * NOT NULLABLE and not optional, unlike the fields around it — see
   * `isConsignment` and `hasExpiry` above, which it now matches.
   *
   * It sits in this block because it is a marketplace field, but it does not
   * share the block's rule: nothing about it is inherited, so there is no null
   * to store and no `resolved` to read. The API answers a real boolean on every
   * product, including the ones written before the field existed.
   */
  isPreorder: boolean;
  shipping?: ProductShipping;
  /**
   * Where this product's revenue, stock and cost of sale land in the ledger.
   *
   * `salesAccountId` is an `income` account — null means the category's default,
   * then the seeded 4101. `inventoryAccountId` is an `asset` account — null
   * means the category's, then 1201. `cogsAccountId` is an `expense` account —
   * null means the category's, then 5101.
   *
   * ALL THREE ARE THE FIRST TIER of PCR-009's three-level resolution: the item,
   * then its CATEGORY, then the seeded code. Setting one here overrides the
   * category for that field alone.
   *
   * `salesAccountId` WAS REMOVED ONCE and is back — see product.model.js. It
   * does not replace `businessLineId` and never could: the account decides which
   * LINE of the P&L, the business line decides which COLUMN.
   */
  salesAccountId?: string | null;
  inventoryAccountId?: string | null;
  cogsAccountId?: string | null;
  businessLineId?: string | null;

  /**
   * What the fields above EFFECTIVELY are, with the parent's values substituted
   * wherever this product set none.
   *
   * ASSEMBLED PER READ, never stored — the same family as `stockByWarehouse` and
   * `bundleAvailability`. Present on every `productType`: on anything but a
   * variant it equals the product's own values with `inheritedFields: []`, so a
   * client never has to branch.
   *
   * ⚠️ RENDER THESE AS PLACEHOLDERS, never as input values. See `brand` above.
   *
   * Optional in the type although the API always sends it, so existing demo
   * fixtures keep compiling — read it with `?.`.
   */
  /**
   * The gallery — up to 9 images and videos, IN DISPLAY ORDER. The first entry
   * is the primary image; there is no separate sort field, because an index that
   * can disagree with the array position is the drift this avoids.
   *
   * Empty on a variant, which carries `variantImage` instead.
   */
  media?: ProductMedia[];
  /** A variant's single image. Null on every other type. */
  variantImage?: ProductMedia | null;

  resolved?: ResolvedProductFields;
  /**
   * Which paths in `resolved` came from the parent rather than from this
   * product — `["shipping.weight", "brand"]`. Dotted leaf paths, so a variant
   * that overrode only its weight still reports inheriting the box size.
   */
  inheritedFields?: string[];

  /**
   * Assembled per read from `productstocks`, never stored on the product.
   *
   * ALWAYS `[]` on a `parent` and a `bundle`, and that is the backend's answer
   * rather than a missing value: a parent's stock is its variants' (see
   * `variantStock`) and a bundle holds none at all (see `bundleAvailability`).
   */
  stockByWarehouse: ProductStockRow[];

  /** On a `parent` only — how many LIVE variants it has. */
  variantCount?: number;
  /**
   * On a `parent` only — its variants' quantities summed PER WAREHOUSE.
   * A warehouse where no variant has a row is absent, not zero.
   */
  variantStock?: ProductStockRow[];
  /** On a `bundle` only — whole bundles assemblable per warehouse. */
  bundleAvailability?: BundleAvailabilityRow[];
}

/**
 * The unit a shipping weight is expressed in.
 *
 * Two, matching what Indonesian marketplaces accept. Sums are computed in GRAMS
 * server-side; `kg` is what the tenant typed.
 */
export type WeightUnit = "gr" | "kg";

/**
 * What a courier quotes against. Every field nullable and INDIVIDUALLY
 * overridable — a variant that weighs more than its sibling still ships in the
 * same box, so overriding the weight must not orphan the dimensions.
 *
 * Measurements are decimal STRINGS, like every other number in this file.
 */
export interface ProductShipping {
  /** Decimal string. Null on a variant means "use the parent's". */
  weight: string | null;
  weightUnit: WeightUnit | null;
  /** Panjang / Lebar / Tinggi, in centimetres. */
  length: string | null;
  width: string | null;
  height: string | null;
  /** "Isi paket" — what is in the box. */
  packageContents: string | null;
}

/** What kind of asset a media item is. */
export type MediaType = "image" | "video";

/**
 * One uploaded asset, as `POST /api/media/upload` returns it and as whatever
 * stores it keeps it — a product's gallery, a variant's one image, a category's
 * picture.
 *
 * `token` is present only on the upload RESPONSE and must be sent back with the
 * product payload — it is an HMAC the server signed over the tenant, the key,
 * the type and the size, and the API refuses an asset without one. It is never
 * stored, so an asset read back from a product does not carry it.
 *
 * `driver` is stored PER ASSET rather than read from config at display time: a
 * tenant that migrates storage keeps serving the files already written.
 */
export interface MediaAsset {
  _id?: string;
  mediaType: MediaType;
  url: string;
  storageKey: string;
  driver: "local" | "gcs" | "cloudinary";
  mimeType: string;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  /**
   * An 800px derivative — the size a detail-page tile actually draws.
   *
   * NULL ON MEDIA STORED BEFORE IT EXISTED, which is why every reader narrows
   * `mediumUrl ?? thumbUrl ?? url` rather than reaching for it directly.
   */
  mediumUrl?: string | null;
  mediumKey?: string | null;
  /** A 320px derivative. Null on a video, which has a poster instead. */
  thumbUrl?: string | null;
  thumbKey?: string | null;
  /**
   * Video only. Set on everything uploaded since the server started extracting
   * a frame with ffmpeg; null on older videos and where transcoding is off.
   */
  posterUrl?: string | null;
  posterKey?: string | null;
  durationMs?: number | null;
  alt?: string | null;
  /** Upload response only — proof of provenance, never stored. */
  token?: string;
}

/**
 * The product-shaped alias, kept because ~40 call sites spell it this way and
 * the type is not product-specific any more — `categories.image` stores the
 * identical object, which is why the backend's subdocument moved to a shared
 * `models/media.schema.js`.
 *
 * Prefer `MediaAsset` in new code. Renaming the existing uses is a sweep, and a
 * sweep is not what adding a field to categories is.
 */
export type ProductMedia = MediaAsset;

/** The effective values, parent substituted where this product set none. */
export interface ResolvedProductFields {
  brand: string | null;
  description: string | null;
  salesAccountId: string | null;
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  businessLineId: string | null;
  shipping: ProductShipping;

  /**
   * ON A BUNDLE ONLY — where `shipping.weight` above came from.
   *
   *   "components" — the sum of what the bundle packages, always in GRAMS. The
   *                  bundle set no weight of its own.
   *   "own"        — the tenant typed a number, and it wins.
   *
   * Derived per read, never stored, exactly like `bundleAvailability`: a stored
   * total would be a second opinion that drifts the moment a component is
   * re-measured — including when somebody edits that component on its own,
   * which no bundle-side bookkeeping would hear about.
   *
   * ⚠️ A derived weight is a PLACEHOLDER in the form, never an input value.
   * Seeding the input with the sum is what would turn it into an override on the
   * next save, and the bundle would stop following its components.
   */
  weightSource?: "own" | "components";
  /**
   * Component ids with no weight recorded, which therefore contributed zero.
   *
   * The sum is still reported — a total the user cannot explain is worse than
   * no total — and this is what lets the UI show it with a warning. The same
   * move `bundleAvailability.limitedBy` makes.
   */
  weightIncomplete?: string[];

  /**
   * The one image a tile should render — this product's own, or its parent's
   * first when a variant has none.
   *
   * A DISPLAY FALLBACK, NOT INHERITANCE: nothing writes the parent's image onto
   * the variant, and `imageSource` says which it is so a form can show "using
   * the parent's photo" rather than implying this variant has one.
   *
   * All three sizes, so a caller picks by the box it is drawing into. Both
   * derivatives are null on media stored before they existed.
   */
  image?: {
    url: string;
    mediumUrl: string | null;
    thumbUrl: string | null;
    mediaType: MediaType;
  } | null;
  imageSource?: "own" | "parent" | null;
}

/** One warehouse's quantity of one product. `qty` is a decimal string. */
export interface ProductStockRow {
  warehouseId: string;
  qty: string;
}

/** How many whole bundles one warehouse can assemble, and what caps it. */
export interface BundleAvailabilityRow {
  warehouseId: string;
  /** Decimal string, whole bundles only — 14 pcs at 3 each is "4.0000". */
  qty: string;
  /** The scarcest component's product id — what to restock. */
  limitedBy: string | null;
}

/* ------------------------------------------------- catalogue requests (v2.2) */

/**
 * GET /api/products.
 *
 * `excludeVariants` and `productType` are MUTUALLY EXCLUSIVE — the backend
 * returns 400 for the pair, because they select rows the same way. The list
 * hook sends one or the other, never both.
 */
export interface ProductListQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  productType?: ProductType;
  parentId?: string;
  isActive?: boolean;
  /** Top-level rows only; a matched variant surfaces its parent. */
  excludeVariants?: boolean;
  /**
   * Only the types that HOLD stock (`standalone` and `variant`), or only the
   * types that do not.
   *
   * The server owns that list — it is the same one a movement is refused
   * against — so a picker asks for it rather than assembling it from
   * `productType`, which takes a single value and would need two requests.
   *
   * MUTUALLY EXCLUSIVE with `productType` (the same question twice) and with
   * `excludeVariants` (the opposite one); the API returns 400 for either pair.
   */
  holdsStock?: boolean;
  /**
   * Only consignment goods (`true`) or only owned ones (`false`).
   *
   * The receipt picker's filter, so a *Beli putus* delivery cannot be built out
   * of somebody else's stock and a *Konsinyasi* one cannot be built out of the
   * shop's own.
   *
   * `false` INCLUDES PRODUCTS THAT NEVER STORED THE FLAG, which today is all of
   * them — the server matches `$ne: true` rather than an equality. Omit for
   * both kinds, which is what every other screen wants.
   *
   * Not mutually exclusive with anything: it selects by a field where
   * `holdsStock` and friends select by type, and the receipt picker sends both.
   */
  isConsignment?: boolean;
  /**
   * Only products with NO movement in this warehouse.
   *
   * The opening-stock picker's filter — the same rule
   * POST /products/opening-stock enforces, so the picker cannot offer a row the
   * save would refuse. A warehouse id rather than a flag: "never moved" is only
   * meaningful somewhere, and a product trading in one warehouse may
   * legitimately be receiving its opening balance in another.
   */
  neverMovedInWarehouse?: string;
  /**
   * Only products this warehouse HOLDS — quantity above zero.
   *
   * The transfer picker's filter, and the near-mirror of the one above: that
   * asks the ledger what has ever moved here, this asks the balances what is on
   * the shelf now. A transfer draws goods off ONE shelf, so a product with
   * nothing on it can only produce a line the save refuses.
   */
  inStockAtWarehouse?: string;
  includeDeleted?: boolean;
  /**
   * Which ordering to page through. A NAME, not a field plus a direction —
   * the API accepts a closed list, so a client cannot ask for an ordering with
   * no index behind it. Omitted means `newest`, which is what the API defaults
   * to anyway.
   */
  sort?: ProductSort;
}

/** The orderings `GET /api/products` accepts — PRODUCT_SORTS in the model. */
export type ProductSort =
  "newest" | "oldest" | "nameAsc" | "nameDesc" | "skuAsc";

/** GET /api/products/:id/variants — the parent and every variant of it. */
export interface ProductVariantsResult {
  parent: Product;
  items: Product[];
}

/**
 * The quantity a product is born holding, sent WITH the create.
 *
 * Omitted entirely for a product that starts with none — a zero is refused by
 * the backend, because an opening balance brings goods on and a movement
 * recording that nothing happened is a row every stock card has to explain.
 */
export interface OpeningStockInput {
  warehouseId: string;
  /** Decimal string, must be > 0. */
  qty: string;
  /**
   * The purchase price per unit. REQUIRED — it seeds `hppAvg` and it is the
   * figure the opening inventory journal is built from (Dr 1201 Persediaan /
   * Cr 3101 Modal). Without it the movement carries a quantity with no value,
   * the journal line is skipped, and the tenant is left holding stock the
   * balance sheet says is worth nothing.
   *
   * "0" is valid — donated stock and free samples are real, and the ledger
   * declines to write a zero-value line on its own.
   */
  costPerUnit: string;
  /** THEIR code, off the carton. Optional — ours is generated by the server. */
  supplierBatchCode?: string;
  /** REQUIRED by the backend when the product has `hasExpiry: true`. */
  expiryDate?: string;
  isConsignment?: boolean;
}

/** One row of a parent's `variants[]` on create. */
export interface CreateFamilyVariantInput {
  sku: string;
  /** Optional — the backend names it after the parent and its values. */
  name?: string;
  variantAttributes: Record<string, string>;
  sellPrice: string;
  barcode?: string;
  minStock?: number;
  isActive?: boolean;
  openingStock?: OpeningStockInput;

  /**
   * The only two marketplace fields a family row takes.
   *
   * `brand`, the two posting accounts and `businessLineId` are absent because
   * they are RESOLVED from the parent — repeating the same brand string across twelve
   * rows is the payload the inheritance design exists to avoid. `description` is
   * absent for an arithmetic reason instead: the request body cap is 1 MB and
   * this array may hold 200 entries. A row that wants its own gets it with a
   * follow-up PATCH.
   *
   * These two ARE here because they are what genuinely differs per row: the 1kg
   * and the 10kg do not weigh the same, which is the whole reason variant-level
   * shipping exists.
   */
  shipping?: Partial<ProductShipping>;
  isPreorder?: boolean;
  /**
   * `isConsignment` is absent for a THIRD reason, and it is not inheritance by
   * resolution: the API COPIES the parent's value onto every row. Sending one
   * here is a 400 rather than a silent strip, because a value that would be
   * overwritten by the next parent edit is a field that only looks like it
   * works. Set it on the parent.
   */
  /** One image per row — the same rule a standalone variant follows. */
  variantImage?: ProductMedia;
}

interface CreateProductBase {
  sku: string;
  name: string;
  categoryId: string;
  /**
   * OPTIONAL — the API stores `pcs` when it is absent, and refuses anything
   * outside `pcs` | `sak` | `dus` with a 400. Typed as a plain string rather
   * than that union because a product catalogued before the list closed may
   * still hold "botol", and an edit form seeded from one has to be able to
   * carry the value it was given.
   */
  unit?: string;
  isActive?: boolean;
}

/**
 * The create payloads, one per shape.
 *
 * A discriminated union rather than one optional-everything interface, because
 * the backend REFUSES a field the type has no use for (a `sellPrice` on a parent
 * is a 400 naming the field, not a silent success). Encoding that here means a
 * payload the API would reject does not compile.
 */
export interface CreateStandaloneInput extends CreateProductBase {
  productType?: "standalone";
  /** Up to 9, in display order. Forbidden on a variant — see `variantImage`. */
  media?: ProductMedia[];
  /**
   * ─── The marketplace fields ────────────────────────────────────────────
   *
   * Optional on every type, required on none. A tenant that never sells online
   * fills none of them in and the catalogue works exactly as it did.
   *
   * On a `variant`, OMITTING a field is what makes it inherit from the parent —
   * there is no "inherit" sentinel to send. Send a value only when this product
   * genuinely disagrees with its family.
   */
  brand?: string | null;
  /** Sanitised server-side. Refused on a family-variant row — PATCH it after. */
  description?: string | null;
  isPreorder?: boolean;
  /** Partial objects are the normal case — send only the leaves you mean. */
  shipping?: Partial<ProductShipping>;
  /** Must be an `income` account of this tenant, or the API answers 400. */
  salesAccountId?: string | null;
  /** Must be an `asset` account of this tenant, or the API answers 400. */
  inventoryAccountId?: string | null;
  /** Must be an `expense` account of this tenant, or the API answers 400. */
  cogsAccountId?: string | null;
  businessLineId?: string | null;

  sellPrice: string;
  barcode?: string;
  minStock?: number;
  hasExpiry?: boolean;
  /** Titipan. Omitted means owned stock, which is what an unflagged item is. */
  isConsignment?: boolean;
  openingStock?: OpeningStockInput;
}

export interface CreateParentInput extends Omit<CreateProductBase, "sku"> {
  productType: "parent";
  /** Up to 9, in display order. Forbidden on a variant — see `variantImage`. */
  media?: ProductMedia[];
  /**
   * ─── The marketplace fields ────────────────────────────────────────────
   *
   * Optional on every type, required on none. A tenant that never sells online
   * fills none of them in and the catalogue works exactly as it did.
   *
   * On a `variant`, OMITTING a field is what makes it inherit from the parent —
   * there is no "inherit" sentinel to send. Send a value only when this product
   * genuinely disagrees with its family.
   */
  brand?: string | null;
  /** Sanitised server-side. Refused on a family-variant row — PATCH it after. */
  description?: string | null;
  isPreorder?: boolean;
  /** Partial objects are the normal case — send only the leaves you mean. */
  shipping?: Partial<ProductShipping>;
  /** Must be an `income` account of this tenant, or the API answers 400. */
  salesAccountId?: string | null;
  /** Must be an `asset` account of this tenant, or the API answers 400. */
  inventoryAccountId?: string | null;
  /** Must be an `expense` account of this tenant, or the API answers 400. */
  cogsAccountId?: string | null;
  businessLineId?: string | null;

  /**
   * OPTIONAL, unlike every other type — a parent holds no stock, carries no
   * price and is never scanned, so the only code that has to exist is on each
   * entry of `variants` below. Sent when a family code is useful, omitted
   * otherwise; the API stores null.
   */
  sku?: string;
  variantAxes: VariantAxis[];
  hasExpiry?: boolean;
  /**
   * Titipan, for the WHOLE family. Set here and nowhere else: the API copies it
   * onto every variant it creates, and onto every existing one on a later
   * PATCH. A row that set its own is a 400 — see CreateFamilyVariantInput.
   */
  isConsignment?: boolean;
  /** The family, written with the parent in ONE transaction. */
  variants?: CreateFamilyVariantInput[];
}

export interface CreateVariantInput {
  productType: "variant";
  /** A variant carries exactly one image; `media` is a 400 here. */
  variantImage?: ProductMedia;
  /**
   * ─── The marketplace fields ────────────────────────────────────────────
   *
   * Optional on every type, required on none. A tenant that never sells online
   * fills none of them in and the catalogue works exactly as it did.
   *
   * On a `variant`, OMITTING a field is what makes it inherit from the parent —
   * there is no "inherit" sentinel to send. Send a value only when this product
   * genuinely disagrees with its family.
   */
  brand?: string | null;
  /** Sanitised server-side. Refused on a family-variant row — PATCH it after. */
  description?: string | null;
  isPreorder?: boolean;
  /** Partial objects are the normal case — send only the leaves you mean. */
  shipping?: Partial<ProductShipping>;
  /** Must be an `income` account of this tenant, or the API answers 400. */
  salesAccountId?: string | null;
  /** Must be an `asset` account of this tenant, or the API answers 400. */
  inventoryAccountId?: string | null;
  /** Must be an `expense` account of this tenant, or the API answers 400. */
  cogsAccountId?: string | null;
  businessLineId?: string | null;

  sku: string;
  name: string;
  parentId: string;
  variantAttributes: Record<string, string>;
  sellPrice: string;
  barcode?: string;
  minStock?: number;
  isActive?: boolean;
  openingStock?: OpeningStockInput;
  /**
   * `categoryId`, `unit`, `hasExpiry` and `isConsignment` are all inherited from
   * the parent — sending any of them is a 400.
   */
}

export interface CreateBundleInput extends CreateProductBase {
  productType: "bundle";
  /** Up to 9, in display order. Forbidden on a variant — see `variantImage`. */
  media?: ProductMedia[];
  /**
   * ─── The marketplace fields ────────────────────────────────────────────
   *
   * Optional on every type, required on none. A tenant that never sells online
   * fills none of them in and the catalogue works exactly as it did.
   *
   * On a `variant`, OMITTING a field is what makes it inherit from the parent —
   * there is no "inherit" sentinel to send. Send a value only when this product
   * genuinely disagrees with its family.
   */
  brand?: string | null;
  /** Sanitised server-side. Refused on a family-variant row — PATCH it after. */
  description?: string | null;
  isPreorder?: boolean;
  /** Partial objects are the normal case — send only the leaves you mean. */
  shipping?: Partial<ProductShipping>;
  /** Must be an `income` account of this tenant, or the API answers 400. */
  salesAccountId?: string | null;
  /** Must be an `asset` account of this tenant, or the API answers 400. */
  inventoryAccountId?: string | null;
  /** Must be an `expense` account of this tenant, or the API answers 400. */
  cogsAccountId?: string | null;
  businessLineId?: string | null;

  bundleConfig: {
    pricingMode: BundlePricingMode;
    fixedPrice?: string;
    components: Array<{ componentProductId: string; qty: string }>;
  };
  barcode?: string;
}

export type CreateProductInput =
  | CreateStandaloneInput
  | CreateParentInput
  | CreateVariantInput
  | CreateBundleInput;

/**
 * PATCH /api/products/:id — send only what changed.
 *
 * No `productType` and no `parentId`: both are fixed at create time, because
 * changing either would strand the stock rows and sales history written against
 * the old shape.
 */
export interface UpdateProductInput {
  /** `""` clears it — accepted on a `parent` alone, a 400 on every other type. */
  sku?: string | null;
  name?: string;
  categoryId?: string;
  unit?: string;
  /** `""` clears it. */
  barcode?: string | null;
  minStock?: number;
  hasExpiry?: boolean;
  /**
   * Accepted on a `standalone` and a `parent`; a 400 on a `variant` and a
   * `bundle`. On a parent it CASCADES to every live variant in one transaction,
   * so switching a family to titipan is one request rather than one per row.
   */
  isConsignment?: boolean;
  sellPrice?: string;
  variantAxes?: VariantAxis[];
  variantAttributes?: Record<string, string>;
  bundleConfig?: CreateBundleInput["bundleConfig"];
  isActive?: boolean;

  /**
   * ─── The marketplace fields ────────────────────────────────────────────
   *
   * `null` is how an override is CLEARED — there is no separate reset verb. On a
   * variant, patching `brand: null` or `shipping: { weight: null }` makes the
   * field resolve from the parent again.
   *
   * `shipping` MERGES leaf by leaf server-side, so sending `{ weight }` alone
   * leaves the box dimensions alone rather than wiping them.
   */
  brand?: string | null;
  description?: string | null;
  isPreorder?: boolean;
  shipping?: Partial<ProductShipping>;
  /** Must be an `income` account of this tenant, or the API answers 400. */
  salesAccountId?: string | null;
  inventoryAccountId?: string | null;
  cogsAccountId?: string | null;
  businessLineId?: string | null;

  /**
   * Sent WHOLE, never patched item by item. The array's order IS the display
   * order, so a reorder and a delete are both just a new array — and a partial
   * patch would need an addressing scheme for a list whose indices are exactly
   * what is changing.
   */
  media?: ProductMedia[];
  /** `null` removes it — the same clear-by-null the shipping overrides use. */
  variantImage?: ProductMedia | null;
}

/**
 * What `POST /api/products` returns.
 *
 * The two extra fields appear ONLY when the request asked for them, so a plain
 * standalone create reads back exactly as a `Product`.
 */
export interface CreatedProduct extends Product {
  /** Present when the payload carried `variants[]`. */
  variants?: Product[];
  /** Present when the payload asked for opening stock. */
  openingStock?: OpeningStockReport;
}

/**
 * Whether the opening stock actually landed.
 *
 * `posted: false` ARRIVES ON A SUCCESSFUL CREATE (201). The products are
 * committed before the ledger runs, so a failure there is reported rather than
 * thrown — the caller must tell the user the product exists and its opening
 * stock does not.
 */
export interface OpeningStockReport {
  posted: boolean;
  /**
   * The opening stock documents the create filed — one per warehouse the
   * payload named, because a document's header names a single one.
   *
   * These are what the Stok Awal screen lists. Before they existed, stock
   * entered on the create form moved the quantity and posted the journal and
   * left no paperwork, so a tenant that entered its day-one balances the obvious
   * way found that screen empty.
   *
   * Empty whenever `posted` is false: the documents and their movements are one
   * transaction, so a refusal leaves neither.
   */
  entries: OpeningStockEntryRef[];
  movements: StockMovement[];
  error: string | null;
}

/**
 * Just enough of a filed opening stock document to name it and link to it —
 * `GET /api/stock-entries/opening-stock/:id` has the rest.
 */
export interface OpeningStockEntryRef {
  _id: string;
  /** "OPB-2026-0001". */
  entryNumber: string;
  warehouseId: string;
}

/* ------------------------------------------------------------ stock opname */

/**
 * A physical stock count, against /api/stock-opnames.
 *
 * TWO STATES, ONE WAY. `draft` is a sheet somebody is still counting against;
 * `submitted` is one that has moved stock and hit the ledger. There is no
 * un-submit — the movements and journal entry a submit produced are themselves
 * immutable, so a sheet that could go back would claim to describe a count whose
 * corrections had already been booked.
 */
export type OpnameStatus = "draft" | "submitted";

/**
 * One product on a count sheet.
 *
 * A LINE HAS NO `_id`. It is identified by its `productId`, which is unique
 * within a sheet — the array is embedded on the opname document rather than
 * being a collection of its own, so there is nothing else for an id to mean.
 *
 * ONE FIELD HERE IS AN INPUT: `physicalQty`, what was found on the shelf, plus
 * the `notes` / `supplierBatchCode` / `expiryDate` that explain it. Every
 * quantity below
 * it is computed by the server and recomputed at submit — a count sheet whose
 * author could also type the system quantity is one that can be made to balance.
 */
export interface OpnameItem {
  productId: string;
  /**
   * What the system believed. A DISPLAY HINT: it is re-read at submit, because a
   * draft may sit open for hours while the shop keeps selling, and diffing
   * against an hours-old snapshot would book those sales a second time as
   * shrinkage.
   */
  systemQty: string;
  /**
   * What the counter found. Never null — a fresh line opens PRE-FILLED with the
   * system quantity, so a line nobody reaches is a no-op rather than a write-off
   * of everything the counter did not get to.
   */
  physicalQty: string;
  /** `physicalQty − systemQty`. Positive = found more, negative = short. */
  diffQty: string;
  /** `hppAvg` snapshotted at submit, so a March variance is not restated in June. */
  hppAtOpname: string;
  /** `diffQty × hppAtOpname` — what this line's discrepancy was worth. */
  diffValue: string;
  /**
   * When a human last put a number against this line, or null.
   *
   * THE FIELD THAT TELLS "NOT COUNTED YET" FROM "COUNTED, AND IT MATCHED".
   * Both post nothing, so the ledger cannot distinguish them — but a counter
   * deciding whether the sheet is finished must. Server-stamped from the
   * `counted` flag on the save; never sent as a date.
   */
  countedAt: string | null;
  notes: string | null;
  /** THEIR code, off the carton. Optional even for found stock that expires. */
  supplierBatchCode: string | null;
  /**
   * OURS, once the sheet has been SUBMITTED and the lot exists — the id of the
   * lot this found stock went into. Null on a draft and on every line whose
   * difference was zero or negative: a shortage is picked by FEFO across lots
   * that already existed, so there is nothing single to name.
   */
  postedBatchId?: string | null;
  /** The generated code of `postedBatchId`, resolved on a detail read. */
  postedBatchCode?: string | null;
  /** REQUIRED by the API for FOUND stock of a product that expires. */
  expiryDate: string | null;
  /* --- labels, on the DETAIL read only. Null for a product since deleted. --- */
  productSku?: string | null;
  productName?: string | null;
  /** So a sheet asking for "8" can say "8 kg". */
  productUnit?: string | null;
  /**
   * Whether a POSITIVE difference on this line will need a lot. Sent so the form
   * can ask WHILE the counter is at the shelf rather than surfacing a 400 after
   * the sheet is filled in.
   */
  productHasExpiry?: boolean | null;
}

/** A count sheet. Draft until submitted; submitting writes the movements. */
export interface Opname {
  _id: string;
  opnameNumber: string;
  warehouseId: string;
  /**
   * Which set of books the variance was declared against — the sheet's own
   * choice, not its warehouse's default.
   *
   * NULL ON THE SHEETS THAT PREDATE THE FIELD, and on nothing else: every sheet
   * opened since carries one. Those older rows read as unset rather than
   * borrowing their warehouse's default, which is the honest answer — nobody
   * ever said which shop they belonged to.
   */
  branchId: string | null;
  /** When the shelves were walked — not when the row was written. */
  opnameDate: string;
  status: OpnameStatus;
  categoryFilter: string | null;
  /** Decimal string — Σ (selisih × HPP). Negative is shrinkage. */
  totalDiffValue: string;
  /**
   * The ledger entry the submit posted. Null on a draft — and legitimately null
   * on a submitted sheet whose differences were worth nothing.
   */
  journalEntryId: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on the DETAIL read; the list projects the array away. */
  items?: OpnameItem[];
  /* ----------------------- labels and counts the server resolves ----------- */
  warehouseName?: string | null;
  /**
   * Resolved on the list AND on the detail. Null when the sheet declared no
   * branch, and null when the branch it declared has since been deleted — the
   * reader is told the same thing either way, and `branchId` remains the thing
   * to link to.
   */
  branchName?: string | null;
  createdByName?: string | null;
  submittedByName?: string | null;
  /** LIST only: how many lines, and how many have actually been counted. */
  itemCount?: number;
  countedCount?: number;
}

export interface OpnamePage {
  items: Opname[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** GET /api/stock-opnames. */
export interface OpnameListQuery {
  page?: number;
  limit?: number;
  /** Substring over the opname number and the sheet note. */
  search?: string;
  /**
   * BOTH SCOPES ARE OFFERED because branch and warehouse are not 1:1 — a central
   * warehouse can serve three branches, and a branch can hold two warehouses.
   * Narrowing by one never implies the other.
   */
  branchId?: string;
  warehouseId?: string;
  status?: OpnameStatus;
  categoryFilter?: string;
  /** ISO date. Bounds `opnameDate`, the day the shelves were walked. */
  dateFrom?: string;
  /** ISO date. The API refuses a `dateTo` that precedes `dateFrom`. */
  dateTo?: string;
  includeDeleted?: boolean;
  /**
   * Which ordering to page through. A NAME, not a field plus a direction — the
   * API accepts a closed list. Omitted means `newest`, its own default.
   */
  sort?: OpnameSort;
}

/** The orderings `GET /api/stock-opnames` accepts — OPNAME_SORTS in the model. */
export type OpnameSort = "newest" | "oldest" | "numberDesc" | "numberAsc";

/**
 * One line as the CLIENT sends it — four fields, and not one of them a quantity
 * the server computes.
 */
export interface OpnameItemInput {
  productId: string;
  physicalQty: string;
  /**
   * "Somebody has walked this shelf." Omitting it PRESERVES whatever is stored,
   * so an auto-save with no opinion never resets progress; `false` clears it.
   */
  counted?: boolean;
  notes?: string | null;
  supplierBatchCode?: string;
  expiryDate?: string;
}

/**
 * One line as a sheet is OPENED with — `physicalQty` optional, unlike the
 * auto-save's.
 *
 * A create may say no more than "put this product on the sheet": the server
 * pre-fills the line with the system quantity, so an untouched line posts
 * nothing. That difference is load-bearing rather than cosmetic — a line the
 * caller sends a quantity for is stamped COUNTED, so listing products with a
 * quantity attached would open a sheet that claims every shelf was already
 * walked, and the progress figure would read 40 / 40 before anybody left the
 * office.
 */
export type CreateOpnameItemInput = Omit<OpnameItemInput, "physicalQty"> & {
  physicalQty?: string;
};

/**
 * POST /api/stock-opnames.
 *
 * `items` NARROWS THE SHEET TO A CHOSEN SET OF PRODUCTS. Omitting it is the
 * whole-warehouse count: the server fills the sheet with every active
 * stock-tracking product there, narrowed by `categoryFilter`.
 *
 * SEND ONE OR THE OTHER, not both. `categoryFilter` is stored on the sheet as
 * the record of how its lines were populated, so pairing it with an explicit
 * `items` would describe a scope the lines do not match.
 */
export interface CreateOpnameInput {
  warehouseId: string;
  /**
   * Which set of books the variance lands on at submit.
   *
   * OPTIONAL: omitting it lets the ledger fall back to the warehouse's own
   * `defaultBranchId`, then to the session's branch. Asked because branch and
   * warehouse are not 1:1 — a central warehouse serving three branches has one
   * default that cannot speak for all of them.
   *
   * Declared at CREATE rather than at submit: the sheet is the document, and a
   * branch decided an afternoon later would let two people disagree about where
   * the counting belongs.
   */
  branchId?: string;
  opnameDate?: string;
  categoryFilter?: string | null;
  notes?: string | null;
  items?: CreateOpnameItemInput[];
}

/**
 * PATCH /api/stock-opnames/:id — the auto-save.
 *
 * `items` REPLACES the whole array, so the client sends the entire sheet. A
 * patch-by-line protocol would need a stable line id, an ordering rule and a
 * conflict story for two tablets counting one warehouse; replacing a bounded
 * array in one atomic write needs none of them.
 */
export interface UpdateOpnameInput {
  opnameDate?: string;
  notes?: string | null;
  items?: OpnameItemInput[];
}

/**
 * POST /api/stock-opnames/:id/preview — what submitting would post.
 *
 * Reuses the stock-movement preview shapes, because it IS that preview: the
 * opname service asks the same gateway the manual adjustment form does, so the
 * FEFO allocation and the resolved journal accounts are the ones that will
 * actually be written.
 *
 * A PERFECT COUNT ANSWERS WITH EMPTY ARRAYS rather than an error — every shelf
 * agreed, and there is nothing to post.
 */
export interface OpnameSubmitPreview {
  opnameId: string;
  opnameNumber: string;
  /** The lines recomputed against LIVE stock, which is what submit will use. */
  items: OpnameItem[];
  totalDiffValue: string;
  movements: PreviewMovementRow[];
  hppAvg: PreviewHpp[];
  journal: JournalLine[];
}

/* -------------------------------------------------- ledger & lot requests */

/**
 * GET /api/stock-movements.
 *
 * With `productId` + `warehouseId` this IS the stock card — the backend has no
 * separate route, because a stock card is these rows in this order.
 *
 * `limit` is capped at 100 by the API, and there is NO running balance on a
 * row. Both facts drive useStockCard's design; see PawCRM-Backend
 * docs/stock-card-gaps.md for what would remove the constraint.
 *
 * `from` / `to` bound `createdAt`, which is the only date a movement has:
 * insert order is calculation order for the weighted average, so nothing can be
 * backdated and there is nothing else to filter on.
 */
export interface StockMovementListQuery {
  page?: number;
  limit?: number;
  productId?: string;
  warehouseId?: string;
  batchId?: string;
  movementType?: MovementType;
  referenceType?: ReferenceType;
  referenceId?: string;
  /** ISO date string. */
  from?: string;
  /** ISO date string. The backend refuses a `to` that precedes `from`. */
  to?: string;
  /**
   * Free text over the row's own note and its lot code.
   *
   * NOT over the document number: `referenceNo` is resolved forward from
   * whichever collection the reference type names, and only two of the nine
   * types carry a number at all today.
   */
  search?: string;
  /**
   * Which ordering to page through. CHRONOLOGICAL ONLY — this ledger carries a
   * running balance, and "opening plus every row equals the closing" is a
   * statement about order. Omitted means `newest`, the API's own default.
   *
   * List only. A summary has no order and an export has its own.
   */
  sort?: MovementSort;
}

/**
 * GET /api/stock-movements/transfers — one row per TRANSFER, not per movement.
 *
 * WHY A SEPARATE SHAPE AND NOT `StockMovement[]`. A transfer is the one manual
 * posting with no document behind it: there is no `stocktransfers` collection,
 * so its rows are held together only by the correlation id the server mints
 * into `reference.id`. The server groups on that id and pages the GROUPS —
 * grouping a page of the ledger in the browser would page ROWS, so one transfer
 * could straddle a boundary and be listed twice with half its lots each time.
 *
 * `transferId` is that correlation id. It is not any collection's primary key;
 * what a client does with it is ask for the transfer's own rows:
 * `list({ referenceType: "transfer_manual", referenceId: transferId })`.
 */
export interface StockTransferSummary {
  transferId: string;
  /** ISO date string — when the posting was written. */
  transferredAt: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  /**
   * TWO COUNTS THAT MEAN DIFFERENT THINGS. `productCount` is what somebody
   * typed; `lotCount` is how many lots FEFO drew from to satisfy it. More lots
   * than products is the row saying "one of these came off three shelves" — and
   * the ledger holds twice `lotCount` rows, because every lot moved writes a
   * pair.
   */
  productCount: number;
  lotCount: number;
  /**
   * Decimal string — Σ |qty| × the average each line was drawn at.
   *
   * NOT A QUANTITY, deliberately: summed across products a quantity adds sacks
   * of feed to bottles of shampoo. Rupiah is the one unit every line shares.
   * Note that this value does not move between accounts — a transfer posts no
   * journal, because the goods are still the tenant's.
   */
  value: string;
  /** The reason for the whole posting, stamped on every row it wrote. */
  notes: string | null;
  createdBy: string | null;

  /* -------------------------------------------------- labels for the bare ids */
  /* Null where the id is not: a warehouse renamed out of existence or a user
     since deleted still owns the transfer it wrote. */

  fromWarehouseName: string | null;
  toWarehouseName: string | null;
  createdByName: string | null;
}

export interface StockTransferPage {
  items: StockTransferSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * GET /api/stock-movements/transfers.
 *
 * THE LEDGER'S ROW-LEVEL FILTERS ARE ABSENT and that is not an oversight:
 * `productId`, `batchId` and `movementType` narrow to rows INSIDE a posting, so
 * a list of transfers filtered to one product would report each transfer's lot
 * count and value as though the other products it carried did not exist.
 *
 * `warehouseId` matches EITHER end. A transfer belongs to both warehouses it
 * touches, so a filter that only looked at the source would answer "what left
 * Gudang Bazar" when the user asked what Gudang Bazar had to do with.
 */
export interface StockTransferListQuery {
  page?: number;
  limit?: number;
  warehouseId?: string;
  /** ISO date string. */
  from?: string;
  /** ISO date string. The backend refuses a `to` that precedes `from`. */
  to?: string;
  /** Free text over the posting's note — the only text a transfer has. */
  search?: string;
  /** Defaults to `newest` on the server. Every list has an ordering. */
  sort?: StockTransferSort;
}

/**
 * The orderings this endpoint names, and they are NOT the ledger's.
 *
 * It sorts GROUPS by the date the server computes over the rows of one posting,
 * where `GET /stock-movements` sorts rows by their own `createdAt`. Chronological
 * only: a transfer is an event, and ranking one by product count or value is a
 * report rather than a list of what happened.
 */
export type StockTransferSort = "newest" | "oldest";

/** The orderings `GET /api/stock-movements` accepts — MOVEMENT_SORTS in the model. */
export type MovementSort = "newest" | "oldest";

/**
 * GET /api/product-batches.
 *
 * `hasRemaining` is TRI-STATE: left unset the API returns exhausted lots too,
 * which is what an audit of a sold-out lot needs. The lot tab leaves it unset
 * deliberately and sorts the spent rows to the bottom itself.
 */
export interface ProductBatchListQuery {
  page?: number;
  limit?: number;
  productId?: string;
  warehouseId?: string;
  /**
   * WHICH SHOP, rather than which shelf.
   *
   * A lot has no branch of its own — it belongs to a warehouse, and the API
   * resolves the branch to the warehouses under it (its own, plus the shared
   * central ones). Sent alongside `warehouseId` the two INTERSECT, so an
   * inconsistent pair returns nothing rather than one of them quietly winning.
   */
  branchId?: string;
  hasRemaining?: boolean;
  /**
   * Case-insensitive substring over BOTH lot codes and the product's name and
   * SKU — whoever is searching has one of the two labels in front of them.
   */
  search?: string;
  /**
   * EVERY LOT THAT CAME OUT OF ONE SUPPLIER BATCH — the recall query.
   *
   * EXACT, not a substring, unlike `search`: a recall is a decision to pull
   * goods off a shelf, so the set has to be the set the supplier named.
   */
  supplierBatchCode?: string;
  /**
   * ISO bounds on `expiryDate`.
   *
   * Setting either EXCLUDES lots that have no expiry at all — a lot with no
   * date cannot fall inside a date range.
   */
  expiryFrom?: string;
  expiryTo?: string;
  /**
   * Which ordering to page through. A NAME, not a field plus a direction — the
   * API accepts a closed list. Omitted means `expirySoonest`, its own default.
   */
  sort?: BatchSort;
}

/** The orderings the batch endpoints accept — BATCH_SORTS in the model. */
export type BatchSort = "expirySoonest" | "expiryLatest" | "newest" | "oldest";

/** GET /api/product-batches/expiring. */
export interface ExpiringBatchListQuery {
  page?: number;
  limit?: number;
  warehouseId?: string;
  /** Same meaning as on the audit list — see `ProductBatchListQuery`. */
  branchId?: string;
  /** 0–365, default 30. Zero means "expired or expiring today". */
  withinDays?: number;
  /** Same closed list as the audit endpoint's — both screens share one control. */
  sort?: BatchSort;
}

/**
 * GET /api/product-batches/expiring — a page, plus the question it answered.
 *
 * `withinDays` and `before` are echoed back so a client rendering "kedaluwarsa
 * dalam 30 hari" does not have to remember what it asked for.
 */
export interface ExpiringBatchesResult {
  items: ProductBatch[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  withinDays: number;
  /** ISO date — the computed cutoff. */
  before: string;
}

/* ------------------------------------------------------- hand-typed documents */

/**
 * Which kind of hand-typed stock document, and through it which account the
 * value lands on.
 *
 * `adjustment` credits 5201 Kerugian Persediaan — goods that vanished, broke, or
 * were used by the shop. `opening_balance` credits 3101 Modal / Saldo Awal —
 * goods a tenant already owned, bought from nobody in this system.
 */
export type StockEntryKind = "adjustment" | "opening_balance";

/** One product on a document, as the API returns it. */
export interface StockEntryLine {
  productId: string;
  /** The SIGNED change: negative took goods off the shelf. */
  qty: string;
  /**
   * What the system believed the balance was when the change was posted, or
   * null on an opening balance where it held nothing by definition. Kept because
   * it cannot be recovered — every movement since has moved it.
   */
  systemQty: string | null;
  /** The price somebody typed on this document, or null if they named none. */
  costPerUnit: string | null;
  /**
   * What the NAMED lot came in at.
   *
   * Kept separate from `costPerUnit` rather than folded into it: they are
   * different facts, and a silent fallback would leave a screen unable to say
   * which of the two it is showing. Null when the line created its own lot —
   * there, `costPerUnit` is the answer.
   */
  batchCostPerUnit: string | null;
  /** OURS, always read off the lot — the document itself stores no code. */
  batchCode: string | null;
  /** THEIRS, as this document recorded it. */
  supplierBatchCode: string | null;
  expiryDate: string | null;
  /** The lot the line moved: named by the user, or minted by the posting. */
  batchId: string | null;
  isConsignment: boolean;
  /** Resolved by the server on a detail read; absent on a list row. */
  productSku?: string | null;
  productName?: string | null;
  productUnit?: string | null;
}

export interface StockEntry {
  _id: string;
  kind: StockEntryKind;
  /** Server-allocated, unique per tenant: "ADJ-2026-0007". */
  entryNumber: string;
  /** The date the correction BELONGS to, distinct from `createdAt`. */
  entryDate: string;
  /** The set of books this document is attributed to. Always present. */
  branchId: { _id: string; name: string } | string;
  warehouseId: { _id: string; name: string } | string;
  notes: string | null;
  /**
   * How many products the document names.
   *
   * Denormalised on the server and safe to be — lines are written once and never
   * edited. It exists because the list projects `lines` away: a page of twenty
   * documents each carrying two hundred lines is megabytes for a column that
   * renders a number.
   */
  lineCount: number;
  /** Projected away on a list row — a page of documents renders a count. */
  lines?: StockEntryLine[];
  /** The rows this document wrote. Its length is FEFO made visible. */
  movementIds: string[];
  journalEntryId: string | null;
  createdBy: { _id: string; name: string } | string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The orderings the API names. A closed list, so a client cannot ask for one
 * with no index behind it.
 */
export type StockEntrySort = "newest" | "oldest" | "numberDesc" | "numberAsc";

export interface StockEntryListQuery {
  page?: number;
  limit?: number;
  /** Required by the API — see stockEntryService.list. */
  kind: StockEntryKind;
  /**
   * Branch and warehouse are BOTH filterable because they are not 1:1 — a
   * central warehouse can serve three branches, and a branch can hold two
   * warehouses. Narrowing by one never implies the other.
   */
  branchId?: string;
  warehouseId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Defaults to `newest` on the server. Every list has an ordering. */
  sort?: StockEntrySort;
}

/** The writable half. `entryNumber` and the linkage are server-owned. */
export interface StockEntryInput {
  warehouseId: string;
  /**
   * The set of books this document lands on.
   *
   * OPTIONAL on the wire: omitting it lets the ledger fall back to the
   * warehouse's own `defaultBranchId`, which is the right answer for a tenant
   * whose branches each have their own warehouse. The forms send it because they
   * pre-fill it with exactly that fallback — so the payload matches what would
   * have been written anyway, and a shared warehouse can be pointed elsewhere.
   */
  branchId?: string;
  entryDate: string;
  notes?: string;
  lines: Array<{
    productId: string;
    /** Signed: negative takes goods off the shelf. */
    qty: string;
    systemQty?: string;
    costPerUnit?: string;
    batchId?: string;
    /** THEIR code. Mutually exclusive with `batchId` — the API refuses both. */
    supplierBatchCode?: string;
    expiryDate?: string;
    isConsignment?: boolean;
    notes?: string;
  }>;
}
