import { cardHref, planHref } from "@/features/memberships/labels";

/**
 * The audit-log action vocabulary the UI knows how to label, group and tint.
 *
 * Mirrors the actions the backend writes (KNOWN_ACTIONS in
 * PawCRM-Backend/src/models/auditLog.model.js, plus the booking / membership
 * emitters). Like the permission catalog, this is a hand-synced copy: both
 * change together when a new event is added.
 *
 * THE SCREEN IS A RECORD OF WHO CHANGED THE BOOKS (26 October 2026), not a
 * login log: sign-ins are no longer written, and failed logins / lockouts are
 * recorded but never listed. So there is no auth vocabulary here.
 *
 * The vocabulary is OPEN: an `action` not listed here still renders —
 * `actionLabel` falls back to a humanized slug and `actionTone` to neutral — so
 * a new backend event never shows as broken UI while this list catches up.
 */

/** A badge tint token, mapped to a feedback colour in AuditActionBadge. */
export type ActionTone = "neutral" | "success" | "warning" | "danger";

/** The "Modul" filter. Order is display order — money first. */
export const AUDIT_CATEGORIES = [
  { value: "penjualan", label: "Penjualan" },
  { value: "pembelian", label: "Pembelian" },
  { value: "kas", label: "Kas & Bank" },
  { value: "komisi", label: "Komisi" },
  { value: "stok", label: "Stok" },
  { value: "membership", label: "Membership" },
  { value: "layanan", label: "Layanan" },
  { value: "pengaturan", label: "Pengaturan" },
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]["value"];

interface ActionMeta {
  label: string;
  tone: ActionTone;
  category: AuditCategory;
}

const ACTION_META: Record<string, ActionMeta> = {
  invoice_create: {
    label: "Faktur dibuat",
    tone: "neutral",
    category: "penjualan",
  },
  invoice_update: {
    label: "Faktur diubah",
    tone: "warning",
    category: "penjualan",
  },
  invoice_void: {
    label: "Faktur dibatalkan",
    tone: "danger",
    category: "penjualan",
  },
  invoice_payment_record: {
    label: "Pembayaran faktur dicatat",
    tone: "success",
    category: "penjualan",
  },
  invoice_payment_void: {
    label: "Pembayaran faktur dibatalkan",
    tone: "danger",
    category: "penjualan",
  },

  purchase_invoice_create: {
    label: "Faktur pembelian dicatat",
    tone: "neutral",
    category: "pembelian",
  },
  purchase_invoice_update: {
    label: "Faktur pembelian diubah",
    tone: "warning",
    category: "pembelian",
  },
  purchase_invoice_delete: {
    label: "Faktur pembelian dihapus",
    tone: "danger",
    category: "pembelian",
  },
  purchase_invoice_payment: {
    label: "Pembayaran ke supplier dicatat",
    tone: "success",
    category: "pembelian",
  },
  purchase_invoice_payment_void: {
    label: "Pembayaran ke supplier dibatalkan",
    tone: "danger",
    category: "pembelian",
  },
  goods_receipt_create: {
    label: "Penerimaan barang dibuat",
    tone: "neutral",
    category: "pembelian",
  },
  goods_receipt_receive: {
    label: "Barang diterima",
    tone: "neutral",
    category: "pembelian",
  },
  goods_receipt_correct: {
    label: "Qty diterima dikoreksi",
    tone: "warning",
    category: "pembelian",
  },
  goods_receipt_close: {
    label: "Penerimaan ditutup",
    tone: "warning",
    category: "pembelian",
  },
  purchase_return_create: {
    label: "Retur pembelian dibuat",
    tone: "neutral",
    category: "pembelian",
  },
  purchase_return_submit: {
    label: "Retur pembelian diajukan",
    tone: "warning",
    category: "pembelian",
  },
  purchase_return_delete: {
    label: "Retur pembelian dihapus",
    tone: "danger",
    category: "pembelian",
  },

  cash_transaction_record: {
    label: "Transaksi kas dicatat",
    tone: "success",
    category: "kas",
  },
  cash_transaction_update: {
    label: "Transaksi kas diubah",
    tone: "warning",
    category: "kas",
  },
  cash_transaction_void: {
    label: "Transaksi kas dibatalkan",
    tone: "danger",
    category: "kas",
  },
  consignment_settlement_record: {
    label: "Setor ke konsinyor",
    tone: "success",
    category: "kas",
  },

  commission_payment_record: {
    label: "Komisi dibayar",
    tone: "success",
    category: "komisi",
  },
  commission_payment_void: {
    label: "Pembayaran komisi dibatalkan",
    tone: "danger",
    category: "komisi",
  },
  commission_reversed_after_payment: {
    label: "Komisi dibalik setelah dibayar",
    tone: "danger",
    category: "komisi",
  },
  commission_override: {
    label: "Komisi diubah manual",
    tone: "warning",
    category: "komisi",
  },

  stock_adjustment_create: {
    label: "Penyesuaian stok",
    tone: "warning",
    category: "stok",
  },
  transfer_stock_create: {
    label: "Pindah stok",
    tone: "neutral",
    category: "stok",
  },
  stock_transfer_create: {
    label: "Transfer stok dibuat",
    tone: "neutral",
    category: "stok",
  },
  stock_transfer_update: {
    label: "Transfer stok diubah",
    tone: "warning",
    category: "stok",
  },
  stock_transfer_receive: {
    label: "Transfer stok diterima",
    tone: "neutral",
    category: "stok",
  },
  stock_transfer_cancel: {
    label: "Transfer stok dibatalkan",
    tone: "danger",
    category: "stok",
  },
  stock_opname_create: {
    label: "Stok opname dibuat",
    tone: "neutral",
    category: "stok",
  },
  stock_opname_submit: {
    label: "Stok opname diajukan",
    tone: "warning",
    category: "stok",
  },
  stock_opname_delete: {
    label: "Stok opname dihapus",
    tone: "danger",
    category: "stok",
  },
  product_bulk_import: {
    label: "Impor produk",
    tone: "neutral",
    category: "stok",
  },

  membership_plan_created: {
    label: "Paket membership dibuat",
    tone: "neutral",
    category: "membership",
  },
  membership_plan_updated: {
    label: "Paket membership diubah",
    tone: "warning",
    category: "membership",
  },
  membership_plan_deleted: {
    label: "Paket membership dihapus",
    tone: "danger",
    category: "membership",
  },
  membership_plan_restored: {
    label: "Paket membership dipulihkan",
    tone: "neutral",
    category: "membership",
  },
  pet_membership_issued: {
    label: "Kartu membership dibuat",
    tone: "neutral",
    category: "membership",
  },
  pet_membership_paid: {
    label: "Kartu membership dibayar",
    tone: "success",
    category: "membership",
  },
  pet_membership_updated: {
    label: "Kartu membership diubah",
    tone: "warning",
    category: "membership",
  },
  pet_membership_paused: {
    label: "Kartu membership dijeda",
    tone: "warning",
    category: "membership",
  },
  pet_membership_transferred: {
    label: "Kartu membership dipindah",
    tone: "warning",
    category: "membership",
  },
  pet_membership_renewed: {
    label: "Kartu membership diperpanjang",
    tone: "neutral",
    category: "membership",
  },
  pet_membership_dates_adjusted: {
    label: "Tanggal membership diubah",
    tone: "warning",
    category: "membership",
  },
  pet_membership_quota_adjusted: {
    label: "Kuota membership diubah",
    tone: "warning",
    category: "membership",
  },
  pet_membership_redemption_moved: {
    label: "Pemakaian membership dipindah",
    tone: "warning",
    category: "membership",
  },
  pet_membership_cancelled: {
    label: "Kartu membership dibatalkan",
    tone: "danger",
    category: "membership",
  },

  booking_clash_override: {
    label: "Booking bentrok diizinkan",
    tone: "warning",
    category: "layanan",
  },
  booking_session_record: {
    label: "Catatan sesi diisi",
    tone: "neutral",
    category: "layanan",
  },
  booking_session_crew: {
    label: "Petugas sesi diubah",
    tone: "warning",
    category: "layanan",
  },
  booking_session_claim: {
    label: "Sesi diambil groomer",
    tone: "neutral",
    category: "layanan",
  },
  booking_session_work: {
    label: "Status sesi diubah",
    tone: "neutral",
    category: "layanan",
  },
  booking_session_times: {
    label: "Jam mulai/selesai dikoreksi",
    tone: "warning",
    category: "layanan",
  },
  booking_media: {
    label: "Foto booking diubah",
    tone: "neutral",
    category: "layanan",
  },
  pet_preferences_update: {
    label: "Preferensi hewan diubah",
    tone: "neutral",
    category: "layanan",
  },
  pet_medical_update: {
    label: "Catatan medis hewan diubah",
    tone: "neutral",
    category: "layanan",
  },

  tenant_identity_updated: {
    label: "Identitas usaha diubah",
    tone: "warning",
    category: "pengaturan",
  },
  grooming_settings_updated: {
    label: "Pengaturan grooming diubah",
    tone: "warning",
    category: "pengaturan",
  },
  antar_jemput_settings_updated: {
    label: "Pengaturan antar jemput diubah",
    tone: "warning",
    category: "pengaturan",
  },
  groomer_app_settings_updated: {
    label: "Pengaturan aplikasi groomer diubah",
    tone: "warning",
    category: "pengaturan",
  },
};

/** Old rows written before a rename; labelled, but not offered as a filter. */
const LEGACY_LABEL: Record<string, string> = {
  customer_invoice_payment: "Pembayaran faktur dicatat",
  // The till's own events, written with a dotted slug — labelled so the list
  // never shows "Pos device register" (27 October 2026).
  "pos.device_register": "Perangkat kasir didaftarkan",
  "pos.void": "Transaksi kasir dibatalkan",
  "pos.return": "Retur kasir dicatat",
  "pos.discountOverride": "Diskon kasir melewati batas",
};

/** The actions offered in the "Aksi" filter — one module's, or all of them. */
export function actionOptions(
  category: AuditCategory | "",
): { value: string; label: string }[] {
  return Object.entries(ACTION_META)
    .filter(([, meta]) => !category || meta.category === category)
    .map(([value, meta]) => ({ value, label: meta.label }));
}

/** Every action of one module — what the "Modul" filter sends the server. */
export function categoryActions(category: AuditCategory): string[] {
  return actionOptions(category).map((option) => option.value);
}

/** "Faktur dibatalkan"; humanizes an unknown slug gracefully. */
export function actionLabel(action: string): string {
  return (
    ACTION_META[action]?.label ??
    LEGACY_LABEL[action] ??
    action.replace(/[_.]/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** The badge tint for an action; neutral for anything not in the catalog. */
export function actionTone(action: string): ActionTone {
  return ACTION_META[action]?.tone ?? "neutral";
}

/**
 * Where the acted-upon document lives, or null when it has no page of its own
 * (a booking session, a bulk import). Keyed by `entityType`, which the model
 * lowercases — hence `petmembership`.
 */
const ENTITY_HREF: Partial<Record<string, (id: string) => string>> = {
  customer_invoice: (id) => `/dashboard/sales/invoice/${id}`,
  purchase_invoice: (id) => `/dashboard/purchasing/payables/${id}`,
  goods_receipt: (id) => `/dashboard/purchasing/receipts/${id}`,
  purchase_return: (id) => `/dashboard/purchasing/returns/${id}`,
  cash_transaction: (id) => `/dashboard/finance/cash-bank/transactions/${id}`,
  stock_opname: (id) => `/dashboard/inventory/opname/${id}`,
  stock_transfer: (id) => `/dashboard/inventory/transfers/${id}`,
  petmembership: cardHref,
  membershipplan: planHref,
};

export function entityHref(
  entityType: string,
  entityId: string | null,
): string | null {
  const href = ENTITY_HREF[entityType];
  return href && entityId ? href(entityId) : null;
}
