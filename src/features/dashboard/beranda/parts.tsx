import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components";
import { cn } from "@/lib/utils";

/**
 * The pieces every Beranda tab is drawn from — the mockup's `.panel`,
 * `.blist` and `.na`, in the app's own components and tokens.
 */

const ICON_TONES = {
  navy: "bg-tint-info text-primary",
  orange: "bg-tint-warning text-warning",
  red: "bg-tint-danger text-danger",
  green: "bg-tint-success text-success",
} as const;

/** A card with the mockup's icon chip beside its title, and a small scope tag. */
export function Panel({
  icon: Icon,
  tone = "navy",
  title,
  tag,
  children,
}: {
  icon: LucideIcon;
  tone?: keyof typeof ICON_TONES;
  title: string;
  /** What the figures inside follow — "Cabang · Periode". */
  tag?: string;
  children: ReactNode;
}) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-7 flex-none items-center justify-center rounded-md",
              ICON_TONES[tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          {title}
        </span>
      }
      action={
        tag ? (
          <span className="text-xs font-semibold text-muted">{tag}</span>
        ) : undefined
      }
    >
      {children}
    </Card>
  );
}

/** Four tiles a row on a laptop, two on a tablet, one on a phone. */
export function TileGrid({
  columns = 4,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

export interface BarRow {
  label: string;
  /** What the bar is drawn from. */
  value: number;
  /** What the row says — formatted by the caller. */
  display: string;
}

/**
 * A ranked list with a bar per row and its share of the whole — the mockup's
 * `.blist`. The share is printed, so the bar is never the only way to read it.
 */
export function BarList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: BarRow[];
  /** Said instead of the rows when there are none. */
  empty: string;
}) {
  const max = Math.max(0, ...rows.map((row) => row.value)) || 1;
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;

  return (
    <div className="rounded-xl border border-border px-4 pt-1.5 pb-2.5">
      <p className="py-2.5 text-xs font-semibold text-muted">{title}</p>
      {rows.length === 0 ? (
        <p className="border-t border-border py-3 text-sm text-muted">
          {empty}
        </p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center gap-3 border-t border-border py-2 text-sm"
            >
              <span className="min-w-0 truncate font-semibold text-foreground">
                {row.label}
              </span>
              <span
                aria-hidden
                className="ml-auto hidden h-1.5 w-28 flex-none overflow-hidden rounded-full bg-tint-info sm:block"
              >
                <span
                  className="block h-full rounded-full bg-chart-gross"
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </span>
              <span className="ml-auto flex-none text-right font-semibold whitespace-nowrap text-muted tabular-nums sm:ml-0 sm:w-40">
                {row.display} · {((row.value / total) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "↗ 8,4% vs periode sebelumnya" — or null when there is no before. */
export function deltaCaption(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const arrow = pct > 0.5 ? "↗" : pct < -0.5 ? "↘" : "→";
  return `${arrow} ${Math.abs(pct).toLocaleString("id-ID", {
    maximumFractionDigits: 1,
  })}% vs periode sebelumnya`;
}
