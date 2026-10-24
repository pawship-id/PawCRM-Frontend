/**
 * POS OFFLINE MODE (19 October 2026) — the shapes the device and offline
 * endpoints exchange. Kept beside `types/api.ts` rather than inside it so the
 * till's offline half reads as one unit.
 */
import type {
  PaymentChannelType,
  PosCatalogItem,
  PosCharge,
  PosDiscountMode,
  PosItemInput,
  PosPaymentInput,
} from "./api";

export interface PosDevice {
  _id: string;
  branchId: string;
  branchCode: string | null;
  branchName: string | null;
  code: string;
  name: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  lastSeenBy: string | null;
  pendingCount: number;
  createdAt: string;
}

/** Only on registration — the one time the secret leaves the server. */
export interface RegisteredPosDevice extends PosDevice {
  secret: string;
}

export interface PosNumberingInfo {
  series: {
    key: string;
    prefix: string;
    padding: number;
    reset: "never" | "yearly" | "monthly" | "daily";
    separator: string;
    timeZone: string;
  };
  branchCode: string | null;
  deviceCode: string;
  scope: string;
  lastSequence: number;
}

export interface OfflineChannel {
  _id: string;
  type: PaymentChannelType;
  name: string;
  requiresReference: boolean;
  branchId: string | null;
}

export interface OfflineSettings {
  device: { _id: string; code: string; name: string | null };
  branch: { _id: string; code: string | null; name: string };
  shift: {
    _id: string;
    shiftNumber: string | null;
    warehouseId: string;
    openedAt: string;
  } | null;
  tax: { rate: string; inclusive: boolean };
  numbering: PosNumberingInfo;
  channels: OfflineChannel[];
  receiptHeader: {
    tenantName: string;
    branchName: string;
    logoUrl?: string;
    headerText?: string;
    address: string;
    phone: string;
    receiptFooter: string;
  };
}

export type OfflineCatalogTile = Omit<PosCatalogItem, "stock" | "sellable">;

export interface OfflineCatalogSection {
  items: OfflineCatalogTile[];
  categories: Array<{ _id: string; name: string; parentId: string | null }>;
}

export interface OfflineStockSection {
  warehouseId: string | null;
  qty: Record<string, string>;
  allowNegativeStock: boolean;
}

export interface OfflinePet {
  _id: string;
  customerId: string;
  name: string;
  species: string | null;
  size: string | null;
  furType: string | null;
}

export interface OfflineCustomersSection {
  customers: Array<{ _id: string; name: string; phone: string | null; code: string | null }>;
  pets: OfflinePet[];
}

export interface OfflineSnapshotResponse {
  serverTime: string;
  settings: OfflineSettings;
  versions: { catalog: string; stock: string; customers: string };
  catalog?: OfflineCatalogSection;
  stock?: OfflineStockSection;
  customers?: OfflineCustomersSection;
}

/** One sale as the offline till sends it — the server's `offlineSale`. */
export interface OfflineSaleInput {
  clientTxnId: string;
  transactionNumber: string;
  receiptToken: string | null;
  shiftId: string;
  cashierUserId: string;
  cashierName?: string | null;
  paidAt: string;
  customerId: string | null;
  note?: string | null;
  items: PosItemInput[];
  cartDiscount?: { mode: PosDiscountMode; value: string } | null;
  otherCharges?: PosCharge[];
  payments: PosPaymentInput[];
  totals: { grandTotal: string };
  replacesCartId?: string | null;
}

export type OfflineSyncStatus =
  | "pending"
  | "synced"
  | "needs_review"
  | "rejected"
  | "waiting_cashier";

export interface OfflineReason {
  code: string;
  message: string;
}

export interface OfflineSyncResult {
  clientTxnId: string;
  status: OfflineSyncStatus;
  transactionNumber?: string;
  posTransactionId?: string | null;
  reasons?: OfflineReason[];
  flags?: OfflineReason[];
  message?: string;
}

export interface OfflineSubmission {
  _id: string;
  branchId: string;
  deviceId: string;
  deviceCode: string | null;
  clientTxnId: string;
  transactionNumber: string;
  cashierUserId: string;
  cashierName: string | null;
  shiftId: string;
  paidAt: string;
  grandTotal: string | null;
  status: "pending" | "synced" | "needs_review" | "rejected";
  reasons: OfflineReason[];
  flags: OfflineReason[];
  reviewOpen: boolean;
  posTransactionId: string | null;
  attempts: number;
  receivedAt: string;
  syncedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  payload: {
    customerId: string | null;
    items: PosItemInput[];
    payments: PosPaymentInput[];
    totals: { grandTotal: string } | null;
  };
}
