/**
 * Client-side field validators — a UX nicety only.
 *
 * They mirror the backend bounds (user.model.js / *.validation.js) so the form
 * can flag an obvious mistake before a round trip, but the SERVER remains the
 * authority: every rule here also runs there, and its per-field errors surface
 * through ApiError.fieldErrors. Keep these constants in step with the backend.
 */

import type { WarehouseScopeEntry } from "@/types/api";

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const FULL_NAME_MAX_LENGTH = 120;
export const RESET_TOKEN_LENGTH = 64;
export const BRANCH_NAME_MAX_LENGTH = 120;
export const BRANCH_ADDRESS_MAX_LENGTH = 255;
export const WAREHOUSE_NAME_MAX_LENGTH = 120;
export const WAREHOUSE_ADDRESS_MAX_LENGTH = 255;
export const WAREHOUSE_PIC_NAME_MAX_LENGTH = 120;
export const WAREHOUSE_PIC_PHONE_MAX_LENGTH = 32;
// Coordinate bounds, mirroring models/location.schema.js on the backend.
export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;
export const CUSTOMER_NAME_MAX_LENGTH = 120;
export const CUSTOMER_EMAIL_MAX_LENGTH = 254;
export const CUSTOMER_PHONE_MAX_LENGTH = 32;
export const CUSTOMER_ADDRESS_MAX_LENGTH = 255;
export const ROLE_NAME_MAX_LENGTH = 80;
export const ROLE_DESCRIPTION_MAX_LENGTH = 255;
export const SUPPLIER_NAME_MAX_LENGTH = 120;
export const SUPPLIER_PIC_MAX_LENGTH = 120;
export const SUPPLIER_PHONE_MAX_LENGTH = 32;
export const SUPPLIER_EMAIL_MAX_LENGTH = 254;
export const SUPPLIER_ADDRESS_MAX_LENGTH = 255;
export const SUPPLIER_NPWP_MAX_LENGTH = 24;
export const SUPPLIER_NOTES_MAX_LENGTH = 500;
export const SUPPLIER_PAYMENT_TERM_DAYS_MAX = 365;

// Deliberately permissive, matching the backend's { tlds: false } stance.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-.\s]+$/;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * NPWP — the Indonesian taxpayer number. Copied verbatim from
 * supplier.model.js, which accepts the three forms the number is actually
 * written in: the dotted DJP presentation, the same 15 digits unformatted, and
 * the 16-digit NIK-based form mandatory from 2024.
 */
const NPWP_PATTERN = /^(\d{15,16}|\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3})$/;

/** Returns an error message, or undefined when valid. */
export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Email is required";
  if (email.length > EMAIL_MAX_LENGTH) return "Email is too long";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address";
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) return "Password is required";
  if (value.length < PASSWORD_MIN_LENGTH)
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (value.length > PASSWORD_MAX_LENGTH)
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  return undefined;
}

/** A non-empty presence check, for the login password (any stored value is ok). */
export function validateRequired(
  value: string,
  label = "This field",
): string | undefined {
  return value.trim() ? undefined : `${label} is required`;
}

export function validateFullName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Full name is required";
  if (name.length > FULL_NAME_MAX_LENGTH) return "Full name is too long";
  return undefined;
}

/** Phone is optional and clearable. */
export function validatePhone(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return undefined;
  if (!PHONE_PATTERN.test(phone))
    return "Only digits, spaces and + ( ) - . are allowed";
  return undefined;
}

export function validateBranchName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Branch name is required";
  if (name.length > BRANCH_NAME_MAX_LENGTH) return "Branch name is too long";
  return undefined;
}

/** Address is optional and clearable. */
export function validateAddress(value: string): string | undefined {
  const address = value.trim();
  if (!address) return undefined;
  if (address.length > BRANCH_ADDRESS_MAX_LENGTH) return "Address is too long";
  return undefined;
}

export function validateWarehouseName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Warehouse name is required";
  if (name.length > WAREHOUSE_NAME_MAX_LENGTH)
    return "Warehouse name is too long";
  return undefined;
}

/** The warehouse address is optional and clearable. */
export function validateWarehouseAddress(value: string): string | undefined {
  const address = value.trim();
  if (!address) return undefined;
  if (address.length > WAREHOUSE_ADDRESS_MAX_LENGTH)
    return "Address is too long";
  return undefined;
}

/** The person accountable for stock here — optional, a plain name. */
export function validatePicName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return undefined;
  if (name.length > WAREHOUSE_PIC_NAME_MAX_LENGTH) return "PIC name is too long";
  return undefined;
}

/** Optional and clearable; mirrors the backend's 32-char limit and pattern. */
export function validatePicPhone(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return undefined;
  if (phone.length > WAREHOUSE_PIC_PHONE_MAX_LENGTH)
    return "PIC phone is too long";
  if (!PHONE_PATTERN.test(phone))
    return "Only digits, spaces and + ( ) - . are allowed";
  return undefined;
}

/**
 * A coordinate is optional and clearable, so blank is valid. `Number("")` is 0,
 * not NaN, which is why the blank check comes before the parse — without it an
 * empty field would validate as a pin on the equator.
 */
export function validateLatitude(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const lat = Number(raw);
  if (!Number.isFinite(lat)) return "Latitude must be a number";
  if (lat < LATITUDE_MIN || lat > LATITUDE_MAX)
    return `Latitude must be between ${LATITUDE_MIN} and ${LATITUDE_MAX}`;
  return undefined;
}

export function validateLongitude(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const lng = Number(raw);
  if (!Number.isFinite(lng)) return "Longitude must be a number";
  if (lng < LONGITUDE_MIN || lng > LONGITUDE_MAX)
    return `Longitude must be between ${LONGITUDE_MIN} and ${LONGITUDE_MAX}`;
  return undefined;
}

/**
 * The pair is all-or-nothing, mirroring the backend's Joi `.and("lat", "lng")`.
 * A latitude with no longitude is not a partial pin — it resolves to the
 * Greenwich meridian, a marker in the Atlantic.
 *
 * Reported against whichever field is empty, so the message lands on the input
 * the user still has to fill in rather than the one they already did.
 */
export function validateCoordinatePair(
  lat: string,
  lng: string,
): { field: "lat" | "lng"; message: string } | undefined {
  const hasLat = lat.trim() !== "";
  const hasLng = lng.trim() !== "";
  if (hasLat === hasLng) return undefined;

  return {
    field: hasLat ? "lng" : "lat",
    message: "Latitude and longitude must be filled in together",
  };
}

export function validateCustomerName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Customer name is required";
  if (name.length > CUSTOMER_NAME_MAX_LENGTH) return "Customer name is too long";
  return undefined;
}

/** Email is optional for a customer (a walk-in may be recorded with only a name). */
export function validateOptionalEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return undefined;
  if (email.length > CUSTOMER_EMAIL_MAX_LENGTH) return "Email is too long";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address";
  return undefined;
}

/** Phone is optional and clearable; mirrors the backend's 32-char limit. */
export function validateCustomerPhone(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return undefined;
  if (phone.length > CUSTOMER_PHONE_MAX_LENGTH) return "Phone is too long";
  if (!PHONE_PATTERN.test(phone))
    return "Only digits, spaces and + ( ) - . are allowed";
  return undefined;
}

/** Address is optional and clearable. */
export function validateCustomerAddress(value: string): string | undefined {
  const address = value.trim();
  if (!address) return undefined;
  if (address.length > CUSTOMER_ADDRESS_MAX_LENGTH) return "Address is too long";
  return undefined;
}

/* ----------------------------------------------------------------- supplier */

export function validateSupplierName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Nama supplier wajib diisi";
  if (name.length > SUPPLIER_NAME_MAX_LENGTH) return "Nama supplier terlalu panjang";
  return undefined;
}

export function validateSupplierPic(value: string): string | undefined {
  const pic = value.trim();
  if (!pic) return undefined;
  if (pic.length > SUPPLIER_PIC_MAX_LENGTH) return "Nama PIC terlalu panjang";
  return undefined;
}

export function validateSupplierPhone(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return undefined;
  if (phone.length > SUPPLIER_PHONE_MAX_LENGTH) return "Nomor telepon terlalu panjang";
  if (!PHONE_PATTERN.test(phone))
    return "Hanya angka, spasi, dan karakter + ( ) - .";
  return undefined;
}

export function validateSupplierEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return undefined;
  if (email.length > SUPPLIER_EMAIL_MAX_LENGTH) return "Email terlalu panjang";
  if (!EMAIL_PATTERN.test(email)) return "Alamat email tidak valid";
  return undefined;
}

export function validateSupplierAddress(value: string): string | undefined {
  const address = value.trim();
  if (!address) return undefined;
  if (address.length > SUPPLIER_ADDRESS_MAX_LENGTH) return "Alamat terlalu panjang";
  return undefined;
}

/**
 * NPWP is optional but strictly shaped when present.
 *
 * Whitespace is stripped before the pattern runs, exactly as the backend service
 * does — "01.234.567.8 - 901.000" and "01.234.567.8-901.000" are the same tax
 * number typed twice, and rejecting the first here would flag a number the
 * server would have accepted.
 */
export function validateSupplierNpwp(value: string): string | undefined {
  const npwp = value.trim().replace(/\s+/g, "");
  if (!npwp) return undefined;
  if (npwp.length > SUPPLIER_NPWP_MAX_LENGTH) return "NPWP terlalu panjang";
  if (!NPWP_PATTERN.test(npwp))
    return "NPWP harus 15 atau 16 digit, boleh diformat 01.234.567.8-901.000";
  return undefined;
}

export function validateSupplierNotes(value: string): string | undefined {
  const notes = value.trim();
  if (!notes) return undefined;
  if (notes.length > SUPPLIER_NOTES_MAX_LENGTH) return "Catatan terlalu panjang";
  return undefined;
}

/**
 * Credit terms in whole days. 0 is a real value — cash on delivery — so the
 * emptiness check comes first and blank is rejected outright rather than being
 * quietly read as zero.
 */
export function validateSupplierPaymentTerm(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return "Termin pembayaran wajib diisi (0 = bayar saat terima)";
  const days = Number(raw);
  if (!Number.isInteger(days))
    return "Termin pembayaran harus bilangan bulat hari";
  if (days < 0) return "Termin pembayaran tidak boleh negatif";
  if (days > SUPPLIER_PAYMENT_TERM_DAYS_MAX)
    return `Termin pembayaran maksimal ${SUPPLIER_PAYMENT_TERM_DAYS_MAX} hari`;
  return undefined;
}

export function validateRoleName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Role name is required";
  if (name.length > ROLE_NAME_MAX_LENGTH) return "Role name is too long";
  return undefined;
}

/** Description is optional and clearable. */
export function validateRoleDescription(value: string): string | undefined {
  const description = value.trim();
  if (!description) return undefined;
  if (description.length > ROLE_DESCRIPTION_MAX_LENGTH)
    return "Description is too long";
  return undefined;
}

export function validateResetToken(value: string): string | undefined {
  if (!value) return "This reset link is missing its token";
  if (value.length !== RESET_TOKEN_LENGTH || !HEX_PATTERN.test(value))
    return "This reset link is invalid or malformed";
  return undefined;
}

export function validateConfirmPassword(
  password: string,
  confirm: string,
): string | undefined {
  if (!confirm) return "Please confirm your password";
  if (password !== confirm) return "Passwords do not match";
  return undefined;
}

/**
 * The client-side half of the warehouse-scope rule: a branch narrowed to
 * "specific warehouses" must name at least one.
 *
 * Returns a map keyed by branch id, so the picker can put the message under the
 * branch it belongs to rather than at the bottom of the form — with several
 * branches on screen, one shared message cannot say which is wrong.
 *
 * Only granted branches are judged. Rows for branches that were unticked are
 * dropped by the backend rather than refused, so blocking a save on one would
 * refuse a payload the server accepts.
 */
export function validateWarehouseScope(
  branchAccess: string[],
  warehouseAccess: WarehouseScopeEntry[],
): Record<string, string> {
  const errors: Record<string, string> = {};

  warehouseAccess
    .filter((entry) => branchAccess.includes(entry.branchId))
    .forEach((entry) => {
      if (!entry.allWarehouses && entry.warehouseIds.length === 0) {
        errors[entry.branchId] = "Pilih minimal satu gudang";
      }
    });

  return errors;
}
