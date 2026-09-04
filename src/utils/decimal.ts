/**
 * Exact decimal arithmetic for quantities and money, mirroring the backend's
 * `src/utils/money.js`.
 *
 * WHY THIS EXISTS ON THE FRONTEND TOO. The API sends amounts as decimal STRINGS
 * ("150000.0000") precisely so they never pass through a float. If a screen then
 * does `Number(a) + Number(b)` to show a subtotal, the error the backend avoided
 * is reintroduced at the last possible moment — and it shows up in the one place
 * a user is guaranteed to look. Every arithmetic step here runs on BigInt minor
 * units and converts back to a string at the edge.
 *
 * SCALE = 4, the same as the backend, so a value can round-trip through the API
 * and this module without gaining or losing a digit.
 */

const SCALE = 4;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

/**
 * A plain decimal, optionally signed, with at most SCALE fraction digits.
 * Exponent notation is deliberately rejected: a quantity written as "1e3" is a
 * serialisation accident, never something a human typed into a stock form.
 */
const DECIMAL_PATTERN = new RegExp(`^-?\\d{1,16}(\\.\\d{1,${SCALE}})?$`);

/** True when `value` is a well-formed decimal string this module can parse. */
export function isDecimal(value: string): boolean {
  return DECIMAL_PATTERN.test(value.trim());
}

/**
 * Parses a decimal string into BigInt minor units, or null when it is not a
 * well-formed number.
 *
 * Null rather than 0 for garbage, so a caller can tell "not a number" from
 * "zero" — on a stock form those are very different answers, and a function
 * that returned 0 for both would let an empty field submit as a real quantity.
 */
export function toMinor(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  const raw = String(value).trim();
  if (!DECIMAL_PATTERN.test(raw)) return null;

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = BigInt(whole) * SCALE_FACTOR + BigInt(fraction.padEnd(SCALE, "0"));

  return negative ? -minor : minor;
}

/** Minor units back to a canonical string with exactly SCALE fraction digits. */
export function toDecimalString(minor: bigint): string {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / SCALE_FACTOR;
  const fraction = (absolute % SCALE_FACTOR).toString().padStart(SCALE, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * The same value with the zeros nobody typed taken off — "38850.0000" → "38850".
 *
 * WHAT IT IS FOR: a money INPUT. `toDecimalString` always writes four decimal
 * places because that is the scale the ledger stores, and a box pre-filled with
 * `38850.0000` reads at a glance as a far larger number than it is — a cashier
 * looked at one and thought the bill had gone up.
 *
 * IT NEVER LOSES A REAL FRACTION. Only trailing zeros go, so "155400.5000"
 * becomes "155400.5" and "155400.0000" becomes "155400". Rounding to whole
 * rupiah here would quietly change what somebody is about to pay.
 *
 * FOR INPUT VALUES ONLY. Anything being DISPLAYED goes through `formatMoney`,
 * which groups the thousands and prefixes the currency; this is for the string
 * that has to remain typeable and parseable.
 */
export function trimDecimal(value: string): string {
  if (!value.includes(".")) return value;

  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");

  /*
    THE THREE WAYS ZERO COMES OUT OF THAT: "" from ".0000", "-" from "-.0000",
    and "-0" from "-0.0000". An empty box is not the same as zero, and "-0" is
    not a figure anybody would type.
  */
  if (trimmed === "" || trimmed === "-" || trimmed === "-0") return "0";

  return trimmed;
}

/** Integer division with half-up rounding — the weighted average needs it. */
export function divideRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;

  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const quotient = a / b;
  const rounded = (a % b) * 2n >= b ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

/**
 * The new perpetual weighted average after `qtyIn` arrives at `costIn` per unit.
 *
 *   newAvg = (avg × qty + costIn × qtyIn) ÷ (qty + qtyIn)
 *
 * Negative current stock is treated as zero for weighting: it means goods left
 * that were never recorded as arriving, and weighting by it produces an average
 * that is sometimes negative. The arriving cost simply becomes the new one.
 */
export function weightedAverage(
  avg: bigint,
  qty: bigint,
  costIn: bigint,
  qtyIn: bigint,
): bigint {
  const base = qty > 0n ? qty : 0n;
  const total = base + qtyIn;
  if (total <= 0n) return costIn;

  return divideRound(avg * base + costIn * qtyIn, total);
}

/** Sums decimal strings exactly. Unparseable entries count as zero. */
export function sumDecimals(values: Array<string | null>): string {
  const total = values.reduce<bigint>(
    (acc, value) => acc + (toMinor(value ?? "0") ?? 0n),
    0n,
  );
  return toDecimalString(total);
}

/**
 * `a − b` on two decimal strings, exactly. Unparseable operands count as zero.
 *
 * IN MINOR UNITS, like everything else here: `"610000.0000" - "200000.0000"` in
 * JavaScript numbers is a float subtraction that is right until the day it is
 * not, and a figure a customer reads off a bill is not the place to find out.
 * The result may be NEGATIVE — that is a real answer, not an error.
 */
export function subtractDecimals(a: string, b: string): string {
  return toDecimalString((toMinor(a) ?? 0n) - (toMinor(b) ?? 0n));
}

const QTY_FORMAT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });
const MONEY_FORMAT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/**
 * A quantity for display — trailing zeros dropped, so "12.0000" reads "12" and
 * "2.5000" reads "2,5". Stock forms are read at a glance; four fixed decimals
 * on every row is noise that hides the one row that actually has a fraction.
 */
export function formatQty(value: string | null | undefined): string {
  const minor = toMinor(value ?? "");
  if (minor === null) return "—";
  return QTY_FORMAT.format(Number(toDecimalString(minor)));
}

/**
 * A stored decimal as an EDITABLE string: trailing zeros dropped, dot kept.
 *
 * DISTINCT FROM `formatQty`, which is for reading. That one localises — "2,5",
 * "1.000" — and a localised number typed back into a form is a payload the API
 * rejects, because a decimal comma is not a decimal point. This one only
 * shortens: `"10.0000"` → `"10"`, `"2.5000"` → `"2.5"`, `"0.0000"` → `"0"`.
 *
 * The four fixed decimals are how the API stores a quantity, and they are right
 * for a ledger. In an input they are noise a counter has to read past — and
 * worse, typing `1` into a box that answers back `1.0000` reads as the form
 * having changed the number.
 *
 * APPLY IT TO VALUES ARRIVING FROM THE API, never to a keystroke. `"1.50"` is a
 * well-formed decimal, so this would shorten it to `"1.5"` — which is the same
 * number, and exactly the wrong thing to do to somebody halfway through typing
 * it. Anything that is NOT a plain decimal comes back untouched, `"1."`
 * included, so a value on its way to becoming one survives.
 */
export function trimQty(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = value.trim();
  if (!isDecimal(text) || !text.includes(".")) return text;

  return text.replace(/0+$/, "").replace(/\.$/, "");
}

/** Rupiah for display. Rounded to whole units — nobody prices in sen. */
export function formatMoney(value: string | null | undefined): string {
  const minor = toMinor(value ?? "");
  if (minor === null) return "—";
  return `Rp ${MONEY_FORMAT.format(Number(toDecimalString(minor)))}`;
}

/** Rupiah keeping 2 decimals — for a computed average, where the sen matter. */
export function formatMoneyPrecise(value: string | null | undefined): string {
  const minor = toMinor(value ?? "");
  if (minor === null) return "—";
  return `Rp ${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(toDecimalString(minor)))}`;
}

/** `a × b` on two decimal strings, returned as a decimal string. */
export function multiplyDecimals(a: string, b: string): string {
  const left = toMinor(a) ?? 0n;
  const right = toMinor(b) ?? 0n;
  return toDecimalString(divideRound(left * right, SCALE_FACTOR));
}

/** True when the decimal string parses and is greater than zero. */
export function isPositive(value: string): boolean {
  const minor = toMinor(value);
  return minor !== null && minor > 0n;
}

/** Absolute value of a decimal string. */
export function absDecimal(value: string): string {
  const minor = toMinor(value) ?? 0n;
  return toDecimalString(minor < 0n ? -minor : minor);
}
