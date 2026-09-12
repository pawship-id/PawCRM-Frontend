"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions";

import { useSetupCounts, type SetupCount } from "../hooks/useSetupCounts";

/**
 * Pengaturan → Umum: the things a shop sets once and then leaves alone.
 *
 * A HUB OF CARDS, which is what the mockup draws here (`s-umum`) and what these
 * destinations actually are: unrelated one-time settings with nothing to list. A
 * tab row would suggest they are readings of one subject.
 *
 * THREE CARDS LEAD SOMEWHERE AND FOUR SAY "Segera", and the split is the point.
 * Profil tenant, Cabang and Gudang are real screens today. Tipe pelanggan, Tipe
 * supplier, Nomor dokumen and Notifikasi are in the mockup and have nothing
 * behind them — no collection, no endpoint, nothing to gate. Drawing them badged
 * says the shape of the module is known and the work is not; leaving them out
 * would make the page look finished and send people hunting.
 *
 * CABANG AND GUDANG ARE TWO CARDS, where the mockup has one ("Cabang & gudang").
 * They are two screens here, and a card that links to one while naming both is a
 * card that takes you to the wrong half.
 *
 * TIPE SUPPLIER IS NOT Kategori Supplier, which does exist and is a tab of
 * Pembelian. The mockup means the vendor's KIND — the axis our `SupplierType`
 * (beli putus / konsinyasi) and `SupplierEntityType` (perusahaan / perorangan)
 * enums carry, neither of which a tenant can edit. Pointing this card at the
 * category list would file a shop's vendor groups under a heading about
 * something else.
 */
interface LiveCard {
  title: string;
  description: string;
  href: string;
  permission: { feature: Feature; action: Action };
  /** The figure under the title — "4 cabang". Absent while it is unknown. */
  meta?: string;
}

interface PendingCard {
  title: string;
  description: string;
  /** What it is waiting for, in one line. */
  blockedBy: string;
}

/** The mockup's four unbuilt settings, and what each one is waiting for. */
const PENDING_CARDS: PendingCard[] = [
  {
    title: "Tipe pelanggan",
    description:
      "Umum, Member, Grosir, Klinik — mengisi harga dan tempo bawaan tiap pelanggan.",
    blockedBy: "Belum ada di sistem; yang ada baru tier VIP",
  },
  {
    title: "Tipe supplier",
    description:
      "Bentuk kerja sama dan badan usahanya — beli putus, konsinyasi, perusahaan, perorangan.",
    blockedBy: "Masih daftar tetap, belum bisa diubah tenant",
  },
  {
    title: "Nomor dokumen",
    description:
      "Format penomoran faktur, transfer, dan koreksi — awalan, panjang, dan kapan nomornya mengulang.",
    blockedBy: "Penomoran masih ditentukan server",
  },
  {
    title: "Notifikasi",
    description:
      "Pengingat jatuh tempo, stok minimum, dan membership yang akan habis.",
    blockedBy: "Belum ada modul notifikasi",
  },
];

/** "4 cabang", or nothing at all while the figure is unknown. */
function meta(count: SetupCount, unit: string): string | undefined {
  return count.loading || count.error ? undefined : `${count.total} ${unit}`;
}

export function GeneralSettingsScreen() {
  const { can } = usePermissions();

  const mayReadBranches = can("branches", "read");
  const mayReadWarehouses = can("warehouses", "read");

  const counts = useSetupCounts({
    branches: mayReadBranches,
    warehouses: mayReadWarehouses,
  });

  const cards: LiveCard[] = [
    {
      title: "Profil tenant",
      description:
        "Nama usaha, logo, NPWP, zona waktu, dan mata uang — yang tercetak di struk dan faktur.",
      href: "/dashboard/business",
      permission: { feature: "tenants", action: "read" },
    },
    {
      title: "Cabang",
      description:
        "Alamat yang tercetak di struk, dan set buku tempat tiap transaksi mendarat.",
      href: "/dashboard/master/branches",
      permission: { feature: "branches", action: "read" },
      meta: meta(counts.branches, "cabang"),
    },
    {
      title: "Gudang",
      description:
        "Tempat stok benar-benar berada. Satu cabang boleh punya lebih dari satu.",
      href: "/dashboard/master/warehouses",
      permission: { feature: "warehouses", action: "read" },
      meta: meta(counts.warehouses, "gudang"),
    },
  ];

  const visible = cards.filter((card) =>
    can(card.permission.feature, card.permission.action),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Umum</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Identitas usaha dan hal yang diatur sekali lalu ditinggal.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-foreground group-hover:text-primary-hover">
                {card.title}
              </p>
              {card.meta && (
                <p className="flex-none text-xs tabular-nums text-muted">
                  {card.meta}
                </p>
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted">{card.description}</p>
          </Link>
        ))}

        {PENDING_CARDS.map((card) => (
          <div
            key={card.title}
            aria-disabled="true"
            className="rounded-xl border border-border bg-surface p-5 opacity-60"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-foreground">{card.title}</p>
              <Badge variant="outline">Segera</Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted">{card.description}</p>
            <p className="mt-2 text-xs text-muted">{card.blockedBy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
