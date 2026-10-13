import type { ReactNode } from "react";

import { BerandaShell } from "@/features/dashboard";

/**
 * Beranda's four tabs share this layout, so the Cabang + Periode scope
 * survives moving between them.
 *
 * Rendered per request: the default month, the presets and "today" are dates,
 * and `now` is decided here rather than by a client reading its own clock
 * (the same reason Keuangan's Ringkasan takes one).
 */
export const dynamic = "force-dynamic";

export default function BerandaLayout({ children }: { children: ReactNode }) {
  return <BerandaShell now={new Date().toISOString()}>{children}</BerandaShell>;
}
