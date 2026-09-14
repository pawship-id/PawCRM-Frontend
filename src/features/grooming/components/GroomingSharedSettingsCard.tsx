"use client";

import Link from "next/link";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { PET_DATA_PATH } from "@/features/settings/petOptions";

import { GROOMING_CATALOG_PATH } from "../paths";

interface SharedItem {
  title: string;
  description: string;
  /** Present = edited somewhere that exists. Absent = not built. */
  href?: string;
  /** What an unbuilt item is waiting for, in one line. */
  blockedBy?: string;
}

/**
 * The mockup's lists every grooming service draws from.
 *
 * THREE LEAD SOMEWHERE AND ONE SAYS "Segera", the way `GeneralSettingsScreen`
 * draws its pending cards. Leaving the pending one out would make the page look
 * finished and send people hunting.
 *
 * OPSI VARIAN AND RAS ARE ONE ITEM NOW, "Data hewan" (14 September 2026). Both
 * were "Segera" while species, sizes and coats were closed enums and breeds had
 * no list at all; they became tenant data in one collection (`petoptions`),
 * edited on ONE screen — Pengaturan › Layanan › Data hewan. Two cards opening
 * the same page would read as two places to look. It sits first because a
 * size added there is also a new row under Nominal per ukuran on this page.
 *
 * Tahapan and Add-on are edited in each service's form, so they link to
 * Layanan & Harga. Zona & Perjalanan has nothing behind it yet.
 */
const ITEMS: SharedItem[] = [
  {
    title: "Data hewan",
    description:
      "Jenis hewan, ras, ukuran, dan bulu. Ukuran yang ditambah di sana ikut muncul di Nominal per ukuran.",
    href: PET_DATA_PATH,
  },
  {
    title: "Tahapan",
    description:
      "Mandi, gunting, blow dry — beserta bobot komisinya. Diisi di form tiap layanan.",
    href: GROOMING_CATALOG_PATH,
  },
  {
    title: "Add-on",
    description:
      "Layanan tambahan yang bisa ditempel ke layanan utama. Diisi di form tiap layanan.",
    href: GROOMING_CATALOG_PATH,
  },
  {
    title: "Zona & Perjalanan",
    description: "Zona kunjungan rumah dan tarif perjalanannya.",
    blockedBy: "Zona dan trip belum ada di sistem",
  },
];

export function GroomingSharedSettingsCard({
  mayOpenCatalog,
}: {
  /**
   * `services:read` — without it the catalogue tab AND Data hewan are closed
   * doors: that page is gated on the same grant, since it is reached from
   * Pengaturan › Layanan. Every link here is read against this one flag.
   */
  mayOpenCatalog: boolean;
}) {
  return (
    <Card
      title="Diatur bersama semua layanan"
      description="Daftar yang dipakai semua layanan grooming."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item) => (
          <li key={item.title}>
            {item.href && mayOpenCatalog ? (
              <Link
                href={item.href}
                className="group block h-full rounded-xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-foreground group-hover:text-primary-hover">
                    {item.title}
                  </span>
                  <span className="flex-none text-sm font-semibold text-primary">
                    Buka →
                  </span>
                </span>
                <span className="mt-1.5 block text-sm text-muted">
                  {item.description}
                </span>
              </Link>
            ) : (
              <div
                aria-disabled={item.blockedBy ? "true" : undefined}
                className={
                  item.blockedBy
                    ? "h-full rounded-xl border border-border bg-surface p-5 opacity-60"
                    : "h-full rounded-xl border border-border bg-surface p-5"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-foreground">{item.title}</p>
                  {item.blockedBy && <Badge variant="outline">Segera</Badge>}
                </div>
                <p className="mt-1.5 text-sm text-muted">{item.description}</p>
                {item.blockedBy && (
                  <p className="mt-2 text-xs text-muted">{item.blockedBy}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
