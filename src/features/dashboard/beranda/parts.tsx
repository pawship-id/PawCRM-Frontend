import type { ReactNode } from "react";
import Link from "next/link";
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

const GROUP_TONES = {
  plain: "border-border",
  warn: "border-warning/40 bg-tint-warning/40",
  bad: "border-danger/40 bg-tint-danger/40",
} as const;

export interface ActionRow {
  key: string;
  title: ReactNode;
  detail: ReactNode;
  /** The row's one act — where it is done, never a button that does nothing. */
  action?: { label: string; href: string };
}

/**
 * One group of "Perlu tindakan" — the mockup's `.na`: a heading with a count,
 * then a row per thing somebody has to do, each linking to where it is done.
 *
 * THREE STATES OF ITS OWN: loading, failed, and nothing to do. "Tidak ada" is
 * an answer and is said; a failure is never drawn as an empty, finished list.
 */
export function ActionGroup({
  icon: Icon,
  title,
  tone = "plain",
  count,
  rows,
  loading,
  failed,
  empty,
  more,
}: {
  icon: LucideIcon;
  title: string;
  tone?: keyof typeof GROUP_TONES;
  count: number | null;
  rows: ActionRow[];
  loading: boolean;
  failed: boolean;
  empty: string;
  /** The "Lihat semua" row, when there are more than the rows shown. */
  more?: { label: string; href: string };
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-xl border px-4 py-3",
        GROUP_TONES[failed ? "plain" : tone],
      )}
    >
      <h3 className="mb-2 flex items-center gap-2 font-sans text-sm font-bold text-foreground">
        <Icon className="size-4 text-muted" aria-hidden />
        {title}
        <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-surface px-2 text-xs font-extrabold tabular-nums">
          {loading || failed || count === null ? "—" : count}
        </span>
      </h3>

      {loading ? (
        <p className="py-2 text-sm text-muted">Memuat…</p>
      ) : failed ? (
        <p className="py-2 text-sm text-muted">Gagal dimuat.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-3 text-center text-sm text-muted">
          {empty}
        </p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-start gap-3 border-t border-border/70 py-2 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{row.title}</p>
                <p className="text-xs text-muted">{row.detail}</p>
              </div>
              {row.action && <ActLink {...row.action} />}
            </li>
          ))}
          {more && (
            <li className="flex items-center gap-3 border-t border-border/70 py-2">
              <p className="text-xs text-muted">{more.label}</p>
              <ActLink label="Lihat semua" href={more.href} />
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** The row's act — the mockup's `.nact`, in the one orange that may be text. */
function ActLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="ml-auto flex-none rounded-md px-1 py-1 text-sm font-bold whitespace-nowrap text-warning hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {label}
    </Link>
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
