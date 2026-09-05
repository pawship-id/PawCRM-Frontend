/**
 * ONE ANIMAL'S TWO NOTES, ON A SCREEN THAT SHOWS BOTH.
 *
 * ─── WHY THEY ARE LABELLED RATHER THAN JUST PRINTED ────────────────────────
 *
 * There used to be one note and it needed no label: everything in the box had
 * the same audience. Now the box that says "bulunya kusut, sarankan 3 minggu
 * sekali" sits next to the one that says "pemiliknya suka ngeyel soal harga" —
 * and printed as two bare paragraphs they are indistinguishable. Somebody
 * reading a booking aloud at the counter would have no way to know which
 * sentence is the one the owner is meant to hear.
 *
 * So the LABEL is the component. Storing the halves apart is worth nothing if
 * the screen puts them back together.
 *
 * ─── SHARED BETWEEN TWO SCREENS, NOT PROMOTED ──────────────────────────────
 *
 * The booking overview and the per-animal work page both render it. Both are the
 * booking feature, so it lives here rather than in `src/components/` — ui-rules
 * §14 promotes on the second FEATURE, not the second call site.
 *
 * ─── IT RENDERS NOTHING WHEN THERE IS NOTHING ──────────────────────────────
 *
 * Most visits have neither. Two empty labelled boxes on every service would be
 * the fold this form already spent a redesign getting rid of.
 */
export function BookingNotes({
  internalNotes,
  customerNotes,
  className = "",
}: {
  internalNotes: string | null;
  customerNotes: string | null;
  className?: string;
}) {
  if (!internalNotes && !customerNotes) return null;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {internalNotes && (
        <Note label="Catatan internal" tone="neutral" text={internalNotes} />
      )}
      {/*
        THE CUSTOMER'S IS TINTED and the internal one is not — the exception is
        what earns the colour. A shop reads a dozen internal notes a day and one
        message for an owner; making the common one loud would train people to
        skip both.
      */}
      {customerNotes && (
        <Note label="Untuk pelanggan" tone="info" text={customerNotes} />
      )}
    </div>
  );
}

function Note({
  label,
  tone,
  text,
}: {
  label: string;
  tone: "neutral" | "info";
  text: string;
}) {
  return (
    <div
      className={`rounded-md px-2 py-1.5 ${
        tone === "info" ? "bg-tint-info" : "bg-tint-neutral"
      }`}
    >
      {/*
        A WORD, NOT A COLOUR — ui-rules §1.3. The tint distinguishes the two at a
        glance; the label is what makes the distinction survive a greyscale
        print, a colourblind reader, and a screen nobody is looking at closely.
      */}
      <span
        className={`block text-xs font-semibold ${
          tone === "info" ? "text-info" : "text-muted"
        }`}
      >
        {label}
      </span>
      <p className="whitespace-pre-wrap text-xs text-foreground">{text}</p>
    </div>
  );
}
