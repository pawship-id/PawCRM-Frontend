import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { InfoTooltip } from "./InfoTooltip";

/**
 * One number under a page title — the mockup's `.kartu`, as the module headers
 * use it.
 *
 * THREE STATES, AND ZERO IS NOT ONE OF THE OTHER TWO. A dash while the count is
 * on its way, a dash plus "gagal dimuat" when it did not arrive, and the number
 * itself otherwise. A zero standing in for an error is the most dangerous thing
 * a summary tile can show, because nobody goes and looks.
 *
 * `value` ARRIVES FORMATTED. Thousands separators, currency and units are the
 * caller's business — this component would otherwise need to know that 412 is a
 * count and 4200000 is rupiah.
 *
 * PROMOTED FROM features/customers, where it started as the Pelanggan header's
 * private tile. The catalogue header wanted the same three states and the same
 * shape, which is the rule for promotion (§14) and the point at which a copy
 * would have started drifting.
 *
 * `onClick` MAKES IT A BUTTON — the mockup's `.mcard.click` — for a tile that is
 * also a view of a list elsewhere on the page (Faktur Pembelian's due-soon
 * card drills into the same bucket the figures describe). Omit it for a plain
 * figure; most callers do.
 *
 * `tone` COLOURS THE NUMBER, NEVER THE TILE — absorbed from Penjualan's own
 * stat card (2 October 2026), which existed only to get a red/green figure for
 * Lewat jatuh tempo / Tertagih and drifted into its own uppercase label and
 * radius along the way. A red panel in a row of four turns a dashboard into an
 * alarm; a red numeral says the same thing while the row stays scannable.
 *
 * `hint` IS THE ⓘ, OPTIONAL (2 October 2026) — most callers' labels are
 * self-explanatory and omit it; it exists for the ones that aren't ("berapa
 * persen dari apa", "dihitung sejak kapan"), so the formula lives next to the
 * number instead of nowhere. Always `<InfoTooltip>` (ui-rules §9), never a
 * second caption line.
 */
export function StatTile({
  label,
  value,
  caption,
  hint,
  loading = false,
  error = false,
  dense = false,
  tone = "plain",
  onClick,
}: {
  label: string;
  /** Already formatted for reading — "412", "Rp 4,2 jt". */
  value: string;
  /** What the number means, in a few words. */
  caption?: string;
  /** The longer "what is this and how is it worked out", opened from the ⓘ. */
  hint?: string;
  loading?: boolean;
  error?: boolean;
  /**
   * A ROW OF FIVE OR SIX TILES BESIDE A PANEL, rather than three or four across
   * a page — Hari Ini. The tile keeps its three states and its words; it loses
   * the padding and the two type steps that only fit when there are four of
   * them. Without it a tile 145 px wide breaks "Rp 3,8 jt" across two lines.
   */
  dense?: boolean;
  /** Plain is the default; danger/success colour the value for a figure that is good or bad news. */
  tone?: "plain" | "danger" | "success";
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "div";
  const interactiveProps = interactive
    ? ({ type: "button", onClick } as const)
    : {};
  const toneClass =
    tone === "danger"
      ? "text-danger-ink"
      : tone === "success"
        ? "text-success"
        : undefined;

  if (dense) {
    return (
      <Tag
        {...interactiveProps}
        className={cn(
          "rounded-xl border border-border bg-surface p-4 text-left",
          interactive &&
            "outline-none transition hover:border-primary/50 hover:shadow-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        {/*
          SENTENCE CASE, not the mockup's uppercase. Its labels are 10 px and
          ours cannot go below 13 (§1.6) — "OKUPANSI HOTEL" at 13 px breaks
          across two lines in a 145 px tile, and a row of tiles where half the
          headings wrap reads as broken rather than as dense.
        */}
        <p className="flex items-center gap-1 text-xs font-semibold text-muted">
          {label}
          {hint && <InfoTooltip hint={hint} />}
        </p>
        <p
          className={cn(
            "mt-1.5 text-xl font-bold tabular-nums text-foreground",
            !(loading || error) && toneClass,
          )}
        >
          {loading || error ? "—" : value}
        </p>
        <p className="mt-1 text-xs text-muted tabular-nums">
          {error ? "gagal dimuat" : caption}
        </p>
      </Tag>
    );
  }

  return (
    <Tag
      {...interactiveProps}
      className={cn(
        "rounded-2xl border border-border bg-surface p-5 text-left",
        interactive &&
          "outline-none transition hover:border-primary/50 hover:shadow-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {label}
        {hint && <InfoTooltip hint={hint} />}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums text-foreground",
          !(loading || error) && toneClass,
        )}
      >
        {loading || error ? "—" : value}
      </p>
      <p className="mt-1 text-xs text-muted tabular-nums">
        {error ? "gagal dimuat" : caption}
      </p>
    </Tag>
  );
}

/**
 * A tile the mockup asks for that the database cannot answer yet.
 *
 * BADGED, NOT BLANK, and not filled with a plausible number either. A dash reads
 * as a count that failed to load — the one impression a summary row must not
 * give — while an invented figure is indistinguishable from a real one. The
 * badge says the feature is coming and `blockedBy` says what it is waiting for,
 * which is also the note the next person needs before building it.
 *
 * The same treatment the landing page gives its two dead KPIs.
 */
export function PendingStatTile({
  label,
  blockedBy,
  dense = false,
}: {
  label: string;
  /** What is missing, in one line — "Membership belum ada di sistem". */
  blockedBy: string;
  /** As `StatTile`'s — and the badge drops under the label, which no longer
      fits beside it at this width. */
  dense?: boolean;
}) {
  if (dense) {
    return (
      <div
        aria-disabled="true"
        className="rounded-xl border border-border bg-surface p-4 opacity-60"
      >
        <p className="text-xs font-semibold text-muted">{label}</p>
        <Badge variant="outline" className="mt-1.5">
          Segera
        </Badge>
        <p className="mt-1.5 text-xs text-muted">{blockedBy}</p>
      </div>
    );
  }

  return (
    <div
      aria-disabled="true"
      className="rounded-2xl border border-border bg-surface p-5 opacity-60"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        <Badge variant="outline">Segera</Badge>
      </div>
      <p className="mt-2 text-xs text-muted">{blockedBy}</p>
    </div>
  );
}
