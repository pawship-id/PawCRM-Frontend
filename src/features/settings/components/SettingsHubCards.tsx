import Link from "next/link";

import { Badge } from "@/components/ui/badge";

import type { SetupCount } from "../hooks/useSetupCounts";

/**
 * The two cards a Pengaturan hub is drawn with — Umum and Layanan both, which is
 * why they live here rather than inside either screen.
 */

/** "4 cabang", or nothing at all while the figure is unknown. */
export function countMeta(count: SetupCount, unit: string): string | undefined {
  return count.loading || count.error ? undefined : `${count.total} ${unit}`;
}

/** A setting with a screen behind it. */
export function HubLinkCard({
  title,
  description,
  href,
  meta,
}: {
  title: string;
  description: string;
  href: string;
  /** The figure beside the title — "4 cabang". Absent while it is unknown. */
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-foreground group-hover:text-primary-hover">
          {title}
        </p>
        {meta && (
          <p className="flex-none text-xs tabular-nums text-muted">{meta}</p>
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted">{description}</p>
    </Link>
  );
}

export interface PendingHubCard {
  title: string;
  description: string;
  /** What it is waiting for, in one line. */
  blockedBy: string;
}

/**
 * A setting the mockup draws and nothing stands behind yet. Drawn badged rather
 * than left out: the shape of the module is known and the work is not, and a
 * page that looks finished sends people hunting.
 */
export function HubPendingCard({ title, description, blockedBy }: PendingHubCard) {
  return (
    <div
      aria-disabled="true"
      className="rounded-xl border border-border bg-surface p-5 opacity-60"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-foreground">{title}</p>
        <Badge variant="outline">Segera</Badge>
      </div>
      <p className="mt-1.5 text-sm text-muted">{description}</p>
      <p className="mt-2 text-xs text-muted">{blockedBy}</p>
    </div>
  );
}
