"use client";

import Link from "next/link";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";
import { PET_DATA_PATH } from "@/features/settings/petOptions";
import { serviceSettingsPath } from "@/features/settings/serviceSettingsSections";
import { SERVICE_STEPS_PATH } from "@/features/settings/serviceSteps";


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
 * ALL FOUR LEAD SOMEWHERE since Zona & Perjalanan got its list (17 September
 * 2026). `blockedBy` stays for the next item that is drawn before it is built,
 * the way `GeneralSettingsScreen` draws its pending cards.
 *
 * OPSI VARIAN AND RAS ARE ONE ITEM NOW, "Data hewan" (14 September 2026). Both
 * were "Segera" while species, sizes and coats were closed enums and breeds had
 * no list at all; they became tenant data in one collection (`petoptions`),
 * edited on ONE screen — Pengaturan › Layanan › Data hewan. Two cards opening
 * the same page would read as two places to look. It sits first because a
 * size added there is also a new row under Nominal per ukuran on this page.
 *
 * TAHAPAN OPENS ITS OWN LIST, Pengaturan › Layanan › Tahapan (14 September
 * 2026). It linked to Layanan & Harga while each service typed its steps as
 * free text; now every business line keeps one list the services pick from.
 * The bobot komisi stayed on the service — it weighs a step's place in THAT
 * service — so the description still sends people there for it. Same door as
 * Data hewan, so the same `services:read` flag decides whether it is a link.
 *
 * RAS HAS A CARD OF ITS OWN, before Tahapan (17 September 2026), opening the
 * hub's Ras section — Data hewan opens Opsi Varian, which no longer holds it.
 *
 * Add-on opens Pengaturan › Layanan › Add-on (17 September 2026), where every
 * add-on's price, tahapan, komisi and "dijual terpisah" are edited in one
 * table. Zona & Perjalanan opens Pengaturan › Layanan › Zona since zones became
 * tenant data (`/api/zones`, 17 September 2026); like the others it is a link
 * only with `services:read`, the grant that page asks for.
 */
const ITEMS: SharedItem[] = [
  {
    title: "Data hewan",
    description:
      "Jenis hewan, ukuran, dan bulu. Ukuran yang ditambah di sana ikut muncul di Nominal per ukuran.",
    href: PET_DATA_PATH,
  },
  {
    title: "Ras",
    description:
      "Daftar ras dan ukuran bawaannya",
    href: serviceSettingsPath("ras"),
  },
  {
    title: "Tahapan",
    description:
      "Urutan kerja yang dipakai jadwal dan komisi",
    href: SERVICE_STEPS_PATH,
  },
  {
    title: "Add-on",
    description:
      "Layanan tambahan lintas layanan",
    href: serviceSettingsPath("addon"),
  },
  {
    title: "Zona & Perjalanan",
    description:
      "Zona antar-jemput dan tarifnya",
    href: serviceSettingsPath("zona"),
  },
];

export function GroomingSharedSettingsCard({
  mayOpenCatalog,
  noun = "grooming",
}: {
  /** Which line's page it sits on, in a sentence — see `ServiceLine`. */
  noun?: string;
  /**
   * `services:read` — without it the catalogue tab, Data hewan AND Tahapan are
   * closed doors: both settings pages are gated on the same grant, since they
   * are reached from Pengaturan › Layanan. Every link here is read against
   * this one flag.
   */
  mayOpenCatalog: boolean;
}) {
  return (
    <Card
      title="Diatur bersama semua layanan"
      description={`Daftar yang dipakai semua layanan ${noun}.`}
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
