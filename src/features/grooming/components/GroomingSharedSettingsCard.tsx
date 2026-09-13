"use client";

import Link from "next/link";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";

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
 * The mockup's five lists every grooming service draws from.
 *
 * TWO LEAD SOMEWHERE AND THREE SAY "Segera", the way `GeneralSettingsScreen`
 * draws its pending cards. Tahapan and Add-on are real — they are edited in
 * each service's form, so they link to Layanan & Harga. Opsi Varian, Ras and
 * Zona & Perjalanan have nothing behind them yet; leaving them out would make
 * the page look finished and send people hunting.
 */
const ITEMS: SharedItem[] = [
  {
    title: "Opsi Varian",
    description: "Pilihan jenis hewan, ukuran, dan bulu yang membedakan harga.",
    blockedBy: "Masih daftar tetap, belum bisa diubah",
  },
  {
    title: "Ras",
    description: "Daftar ras yang dipilih di data hewan.",
    blockedBy: "Belum ada daftar ras yang bisa diatur",
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
  /** `services:read` — without it the catalogue tab is a closed door. */
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
