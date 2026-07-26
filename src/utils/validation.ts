/**
 * Client-side field validators — a UX nicety only.
 *
 * They mirror the backend bounds (user.model.js / *.validation.js) so the form
 * can flag an obvious mistake before a round trip, but the SERVER remains the
 * authority: every rule here also runs there, and its per-field errors surface
 * through ApiError.fieldErrors. Keep these constants in step with the backend.
 */

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const FULL_NAME_MAX_LENGTH = 120;
export const RESET_TOKEN_LENGTH = 64;
export const BRANCH_NAME_MAX_LENGTH = 120;
export const BRANCH_ADDRESS_MAX_LENGTH = 255;
export const CUSTOMER_NAME_MAX_LENGTH = 120;
export const CUSTOMER_EMAIL_MAX_LENGTH = 254;
export const CUSTOMER_PHONE_MAX_LENGTH = 32;
export const CUSTOMER_ADDRESS_MAX_LENGTH = 255;
export const ROLE_NAME_MAX_LENGTH = 80;
export const ROLE_DESCRIPTION_MAX_LENGTH = 255;

// Deliberately permissive, matching the backend's { tlds: false } stance.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-.\s]+$/;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

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
