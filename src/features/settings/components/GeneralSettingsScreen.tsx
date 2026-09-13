"use client";

import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions";

import { useSetupCounts } from "../hooks/useSetupCounts";
import {
  countMeta,
  HubLinkCard,
  HubPendingCard,
  type PendingHubCard,
} from "./SettingsHubCards";

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

/** The mockup's four unbuilt settings, and what each one is waiting for. */
const PENDING_CARDS: PendingHubCard[] = [
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
      meta: countMeta(counts.branches, "cabang"),
    },
    {
      title: "Gudang",
      description:
        "Tempat stok benar-benar berada. Satu cabang boleh punya lebih dari satu.",
      href: "/dashboard/master/warehouses",
      permission: { feature: "warehouses", action: "read" },
      meta: countMeta(counts.warehouses, "gudang"),
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
          <HubLinkCard
            key={card.href}
            title={card.title}
            description={card.description}
            href={card.href}
            meta={card.meta}
          />
        ))}

        {PENDING_CARDS.map((card) => (
          <HubPendingCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}
