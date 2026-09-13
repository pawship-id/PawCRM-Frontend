import { cn } from "@/lib/utils";

type Tone = "default" | "danger" | "warning";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-foreground",
  danger: "text-danger",
  warning: "text-warning",
};

/**
 * One card on the Grooming board — `StatTile`'s three states, plus what the
 * mockup's cards add: a row of split figures, a footnote, and a press that
 * narrows the table.
 *
 * KEPT IN THIS FEATURE (§14). Nothing else in the app has a card that doubles
 * as a filter; it is promoted the day a second screen wants one.
 *
 * SPANS, NOT PARAGRAPHS, because the pressable card is a `<button>` and a button
 * may only hold phrasing content.
 */
export function GroomingStatCard({
  label,
  value,
  caption,
  tone = "default",
  splits = [],
  footnote,
  pressed = false,
  onPress,
  loading = false,
  error = false,
}: {
  label: string;
  /** Already formatted — "Rp 3,1 jt". */
  value: string;
  caption: string;
  tone?: Tone;
  splits?: { label: string; value: string }[];
  footnote?: string;
  /** Whether this card's lens is the one narrowing the table. */
  pressed?: boolean;
  /** Present = the card is a toggle. */
  onPress?: () => void;
  loading?: boolean;
  error?: boolean;
}) {
  const body = (
    <>
      <span className="block text-sm text-muted">{label}</span>
      <span
        className={cn(
          "mt-2 block text-3xl font-semibold tabular-nums",
          VALUE_TONE[tone],
        )}
      >
        {loading || error ? "—" : value}
      </span>
      <span className="mt-1 block text-xs text-muted">
        {error ? "gagal dimuat" : loading ? " " : caption}
      </span>

      {splits.length > 0 && !error && (
        <span
          className={cn(
            "mt-3 flex gap-4 border-t pt-3",
            tone === "danger" ? "border-danger/30" : "border-border",
          )}
        >
          {splits.map((split) => (
            <span key={split.label} className="min-w-0 flex-1">
              <span className="block text-xs text-muted">{split.label}</span>
              <span className="block text-sm font-semibold tabular-nums text-foreground">
                {loading ? "—" : split.value}
              </span>
            </span>
          ))}
        </span>
      )}

      {footnote && (
        <span className="mt-3 block border-t border-dashed border-border pt-2 text-xs text-muted">
          {footnote}
        </span>
      )}
    </>
  );

  const shell = cn(
    "block rounded-2xl border p-5 text-left",
    tone === "danger"
      ? "border-danger/30 bg-tint-danger"
      : "border-border bg-surface",
  );

  if (!onPress) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        shell,
        "w-full transition hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        pressed && (tone === "danger" ? "ring-2 ring-danger" : "ring-2 ring-primary"),
      )}
    >
      {body}
    </button>
  );
}
