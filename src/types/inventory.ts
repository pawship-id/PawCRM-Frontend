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
  | "opname_diff"
  | "purchase_return"
  | "customer_return"
  | "transfer_out"
  | "transfer_in"
  | "bundle_consume"
  | "adjustment";

/** Which document caused a movement. Mirrors REFERENCE_TYPES. */
export type ReferenceType =
  | "goods_receipt"
  | "pos_transaction"
  | "stock_opname"
  | "purchase_return"
  | "customer_return"
  | "transfer_manual"
  | "bundle_consume"
  | "manual_adjustment";

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

  batchCode: string | null;
  batchExpiryDate: string | null;
  createdByName: string | null;
  warehouseName: string | null;
  destinationWarehouseName: string | null;
  /**
   * NOT A FIELD YET. `reference.type` names the KIND of document; naming the
   * document needs `goodsreceipts`, `postransactions` and `stockopnames` to
   * exist, and they do not. It arrives with those modules — until then the
   * ledger shows a document type where a user wants a number.
   */
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
  batchCode: string;
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
  batchCode?: string;
  expiryDate?: string;
  costPerUnit?: string;
  isConsignment?: boolean;
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

/** POST /api/stock-movements — the manual transfer payload. */
export interface CreateTransferInput {
  operation: "transfer";
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  /** Decimal STRING, and must be POSITIVE — direction comes from the two ids. */
  qty: string;
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
  movementType: MovementType;
  /** Decimal string. Signed, as the ledger stores it. */
  qty: string;
  hppAtTime: string;
  /** The existing lot this row would draw from; null when it would create one. */
  batchId: string | null;
  batchCode: string | null;
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
  sku: string;
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
  includeDeleted?: boolean;
}

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
  /** Seeds `hppAvg`. Without it the goods arrive with no cost basis. */
  costPerUnit?: string;
  /** Both REQUIRED by the backend when the product has `hasExpiry: true`. */
  batchCode?: string;
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
}

interface CreateProductBase {
  sku: string;
  name: string;
  categoryId: string;
  unit: string;
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
  sellPrice: string;
  barcode?: string;
  minStock?: number;
  hasExpiry?: boolean;
  openingStock?: OpeningStockInput;
}

export interface CreateParentInput extends CreateProductBase {
  productType: "parent";
  variantAxes: VariantAxis[];
  hasExpiry?: boolean;
  /** The family, written with the parent in ONE transaction. */
  variants?: CreateFamilyVariantInput[];
}

export interface CreateVariantInput {
  productType: "variant";
  sku: string;
  name: string;
  parentId: string;
  variantAttributes: Record<string, string>;
  sellPrice: string;
  barcode?: string;
  minStock?: number;
  isActive?: boolean;
  openingStock?: OpeningStockInput;
  /** `categoryId`, `unit` and `hasExpiry` are inherited — sending them is a 400. */
}

export interface CreateBundleInput extends CreateProductBase {
  productType: "bundle";
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
  sku?: string;
  name?: string;
  categoryId?: string;
  unit?: string;
  /** `""` clears it. */
  barcode?: string | null;
  minStock?: number;
  hasExpiry?: boolean;
  sellPrice?: string;
  variantAxes?: VariantAxis[];
  variantAttributes?: Record<string, string>;
  bundleConfig?: CreateBundleInput["bundleConfig"];
  isActive?: boolean;
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
  movements: StockMovement[];
  error: string | null;
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
 * the `notes` / `batchCode` / `expiryDate` that explain it. Every quantity below
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
  /** Required by the API for FOUND stock of a product that expires. */
  batchCode: string | null;
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
  warehouseId?: string;
  status?: OpnameStatus;
  categoryFilter?: string;
  /** ISO date. Bounds `opnameDate`, the day the shelves were walked. */
  dateFrom?: string;
  /** ISO date. The API refuses a `dateTo` that precedes `dateFrom`. */
  dateTo?: string;
  includeDeleted?: boolean;
}

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
  batchCode?: string;
  expiryDate?: string;
}

/**
 * POST /api/stock-opnames.
 *
 * `items` IS OPTIONAL, and omitting it is the ordinary case: the server fills
 * the sheet with every active stock-tracking product at the warehouse, narrowed
 * by `categoryFilter`. That is what a stock take is — you count the shelves, you
 * do not curate a list first.
 */
export interface CreateOpnameInput {
  warehouseId: string;
  opnameDate?: string;
  categoryFilter?: string | null;
  notes?: string | null;
  items?: OpnameItemInput[];
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
}

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
  hasRemaining?: boolean;
  /** Case-insensitive substring over `batchCode`. */
  search?: string;
  /**
   * ISO bounds on `expiryDate`.
   *
   * Setting either EXCLUDES lots that have no expiry at all — a lot with no
   * date cannot fall inside a date range.
   */
  expiryFrom?: string;
  expiryTo?: string;
}

/** GET /api/product-batches/expiring. */
export interface ExpiringBatchListQuery {
  page?: number;
  limit?: number;
  warehouseId?: string;
  /** 0–365, default 30. Zero means "expired or expiring today". */
  withinDays?: number;
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
