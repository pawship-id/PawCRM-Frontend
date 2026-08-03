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
}

/** POST /api/stock-movements — the manual transfer payload. */
export interface CreateTransferInput {
  operation: "transfer";
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  /** Decimal STRING, and must be POSITIVE — direction comes from the two ids. */
  qty: string;
}

export type CreateStockMovementInput =
  CreateAdjustmentInput | CreateTransferInput;

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

export type OpnameStatus = "draft" | "submitted";

/** One product on a count sheet. */
export interface OpnameItem {
  _id: string;
  opnameId: string;
  productId: string;
  /** What the system believed at the moment the sheet was opened. */
  systemQty: string;
  /** What the counter found. Null until somebody writes a number in. */
  physicalQty: string | null;
  /** `hppAvg` snapshotted when the sheet opened, so the value cannot drift. */
  hppAtOpname: string | null;
}

/** A stock count. Draft until submitted; submitting writes the movements. */
export interface Opname {
  _id: string;
  opnameNumber: string;
  warehouseId: string;
  opnameDate: string;
  status: OpnameStatus;
  /** Decimal string — Σ (selisih × HPP snapshot). Negative is shrinkage. */
  totalDiffValue: string;
  submittedBy: string | null;
  submittedAt: string | null;
  notes: string;
}
