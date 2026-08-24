import { cn } from "@/lib/utils";
import { Input } from "./ui/input";

/**
 * The two batch codes, as every screen that opens a lot renders them.
 *
 * ONE PAIR, FIVE SCREENS. Receiving, penyesuaian, stok awal, opname and the
 * product form all describe a lot, and each used to draw its own single "Kode
 * batch" box. There are two codes now and they behave differently — one is
 * ours and shown, one is theirs and typed — and five copies of that
 * distinction is five chances to explain it differently.
 *
 * WHY OURS IS SHOWN AT ALL, given it cannot be edited. It is what gets printed
 * on the label and scanned at the till, so somebody entering goods has to be
 * able to read it off the screen and write it on the carton. Hiding it until
 * after the save would mean going back to find it.
 *
 * WHICH IS WHY IT IS NO LONGER AN INPUT. It was a disabled `<input>` at first,
 * copying the pattern the receipt form used for a lot the user had NAMED — the
 * value kept in the same box in the same column as the field above it typing
 * one, so the eye read a column of codes rather than a column of two different
 * things. That argument died with the field: NOBODY types this any more, so
 * there is no mixed column left to align against, and the costume was charging
 * a real price for nothing. An `<input>` shows one line clipped at the box
 * width, and a DISABLED one cannot even be selected to copy — so a code wider
 * than the cell was a code that could not be read at all, on the one field a
 * label gets printed from.
 *
 * Rendered as text it wraps, so the whole code is on screen whatever its
 * length, and it can be selected.
 *
 * `<output>` RATHER THAN A `<span>`, because that is exactly what this is: the
 * element for a value the application computed rather than one the user
 * supplied. It is labelable, so a form can point a `<Label>` at it, and it is
 * announced. `aria-live="off"` overrides its implicit `status` role — the code
 * re-derives on every keystroke of the expiry date beside it, and a live region
 * would read it out on each one.
 */

/** Shown while there is nothing to derive a code from yet. */
const PENDING = "otomatis";

const EXPLAINER =
  "Dibuat otomatis dari SKU dan tanggal kedaluwarsa. Kode pastinya muncul setelah disimpan.";

export interface InternalBatchCodeDisplayProps {
  /**
   * The code the SERVER says this lot will be saved with, from a preview — or
   * the code an existing lot already carries.
   *
   * `null` falls back to `hint`. Prefer a previewed code over a locally derived
   * guess: the code is unique across the tenant, so a second lot of the same
   * goods is saved as `…-2`, and nothing in the browser knows what is already
   * taken. See lib/batchCode.
   */
  code: string | null | undefined;
  /**
   * A guess at the code, for the moment before a preview has come back — a row
   * just added, a date just typed.
   *
   * Rendered MUTED, never in the ink a settled code gets, because it may be one
   * suffix out. That difference in colour is the whole of what tells "this is
   * what it will be called" from "this is roughly what it will be called".
   */
  hint?: string;
  /** Named for the screen reader — "Kode batch internal Shampoo Anjing". */
  productName?: string | null;
  /** Set when a `<Label htmlFor>` points at this value. */
  id?: string;
  className?: string;
}

export function InternalBatchCodeDisplay({
  code,
  hint,
  productName,
  id,
  className,
}: InternalBatchCodeDisplayProps) {
  const settled = Boolean(code);
  const shown = code || hint || PENDING;

  return (
    <output
      id={id}
      aria-label={`Kode batch internal ${productName ?? ""}`.trim()}
      aria-live="off"
      title={EXPLAINER}
      className={cn(
        // `break-all`, not `break-words`: a code is one unbroken token, so a
        // word-boundary break has nowhere to break and overflows anyway.
        "block break-all py-1.5 tabular-nums",
        settled ? "font-medium text-foreground" : "text-muted",
        className,
      )}
    >
      {shown}
    </output>
  );
}

export interface SupplierBatchCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Named for the screen reader — "Kode batch supplier Shampoo Anjing". */
  productName?: string | null;
  disabled?: boolean;
  className?: string;
}

export function SupplierBatchCodeInput({
  value,
  onChange,
  productName,
  disabled,
  className,
}: SupplierBatchCodeInputProps) {
  return (
    <Input
      aria-label={`Kode batch supplier ${productName ?? ""}`.trim()}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      // "opsional" rather than an example code: most cartons do not carry one,
      // and a specimen in the box reads as a value somebody has to match.
      placeholder="opsional"
      title="Nomor batch yang tercetak di kartonnya. Dipakai untuk penarikan barang kalau supplier menarik satu batch."
      disabled={disabled}
      maxLength={60}
      className={cn("tabular-nums", className)}
    />
  );
}
