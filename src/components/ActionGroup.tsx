import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/*
  PROMOTED FROM features/dashboard (Beranda's "Perlu tindakan") when Grooming's
  Ringkasan needed the same worklist — ui-rules §14.
*/

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
  control,
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
  /**
   * A control in the heading, after the title — Grooming's "belum kembali ≥
   * [45 hari]" picks its own window there.
   */
  control?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-xl border px-4 py-3",
        GROUP_TONES[failed ? "plain" : tone],
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 font-sans text-sm font-bold text-foreground">
          <Icon className="size-4 text-muted" aria-hidden />
          {title}
        </h3>
        {control}
        <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-surface px-2 text-xs font-extrabold tabular-nums">
          {loading || failed || count === null ? "—" : count}
        </span>
      </div>

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

