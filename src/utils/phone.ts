/**
 * Turning a phone number somebody typed into a `wa.me` link.
 *
 * WHY THIS EXISTS ON THE CLIENT AT ALL, when the backend already owns the rule
 * (PawCRM-Backend/src/utils/phone.js) and says plainly that a second place
 * deciding what a WhatsApp number looks like is a second place to get the trunk
 * prefix wrong.
 *
 * The invoice screens do not need this: the server hands them `customerWhatsApp`
 * already normalised. A CUSTOMER'S OWN PHONE IS NOT NORMALISED — `customer.phone`
 * is stored exactly as the shop typed it ("0812-3456-7890", "+62 812 3456 7890",
 * "62812 3456 7890" are all valid stored values), and `GET /customers` returns no
 * derived WhatsApp field. So the Pelanggan list has the choice of duplicating
 * this rule or having no chat button, and the button is the one thing on that row
 * staff use twenty times a day.
 *
 * THE RULES ARE COPIED, NOT REINVENTED — the four accepted forms, the narrow
 * `62`-prefix case and the 8–15 digit floor are the backend's, so a number that
 * opens a chat from an invoice opens the same chat from the customer list. If
 * `phone.js` changes, change this too; better still, the day the API grows a
 * derived `whatsapp` field on a customer, delete this file and read that.
 */

/** The country a bare local number is assumed to belong to. */
const DEFAULT_COUNTRY_CODE = "62";

/** E.164 as the backend stores it: `+`, a non-zero country digit, 7–14 more. */
const PHONE_STORAGE_PATTERN = /^\+[1-9]\d{7,14}$/;

/** Everything a human types between the digits. */
const SEPARATORS_PATTERN = /[\s().-]/g;

/**
 * The `wa.me` digits for a stored phone, or `null` when the value is empty or is
 * not a number this rule can read.
 *
 * `null` IS THE ONLY FAILURE MODE, and callers hide the button on it rather than
 * linking to a chat that opens on the wrong person. A half-right number is worse
 * than a missing button: the message goes to a stranger.
 */
export function toWhatsAppDigits(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const stripped = value.replace(SEPARATORS_PATTERN, "");
  if (stripped === "") return null;

  // A `+` means something in first position only; anywhere else the value was
  // never a phone number, and dropping it would invent one.
  const explicitlyInternational = stripped.startsWith("+");
  const digits = explicitlyInternational ? stripped.slice(1) : stripped;
  if (!/^\d+$/.test(digits)) return null;

  let e164: string;
  if (explicitlyInternational) {
    // The shop stated the country — keep it.
    e164 = `+${digits}`;
  } else if (digits.startsWith("0")) {
    // National form: the trunk `0` is REPLACED by the country code, never kept
    // beside it. "+6208123…" is a number that does not exist.
    e164 = `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  } else if (digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    // International without the `+`. Narrow on purpose: a local number can
    // begin "62" once its trunk zero is gone, which is why this branch is only
    // reachable when the value did NOT start with one.
    e164 = `+${digits}`;
  } else {
    // A bare subscriber number — country and trunk prefix both left unsaid.
    e164 = `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  return PHONE_STORAGE_PATTERN.test(e164) ? e164.slice(1) : null;
}

/**
 * `https://wa.me/…` for a stored phone, or `null` when there is no chat to open.
 *
 * NO PREFILLED TEXT. The invoice button carries one because it is sending a
 * specific document; opening a chat with a customer from their row has no message
 * to put in their mouth, and a canned "Halo" is one a staff member has to delete.
 */
export function whatsAppLink(value: string | null | undefined): string | null {
  const digits = toWhatsAppDigits(value);
  return digits ? `https://wa.me/${digits}` : null;
}
