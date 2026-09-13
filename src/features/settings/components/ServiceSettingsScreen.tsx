"use client";

import { GROOMING_CATALOG_PATH } from "@/features/grooming";
import { usePermissions } from "@/features/permissions";

import {
  HubLinkCard,
  HubPendingCard,
  type PendingHubCard,
} from "./SettingsHubCards";

/**
 * Pengaturan → Layanan: the lists more than one service draws from.
 *
 * A HUB OF CARDS, like Umum, on the mockup's own rule (`s-lay`): what more than
 * one service uses rises to here, and what one line uses alone stays in that
 * line's home — grooming commission and capacity are on Layanan › Grooming ›
 * Pengaturan, not here.
 *
 * NO CATALOGUE HERE. A "Semua layanan" card and a list at `/katalog` existed
 * for one afternoon and were removed on request (13 September 2026): services
 * are listed on Grooming › Layanan & Harga, which also took the list's Hapus and
 * Pulihkan.
 *
 * TAHAPAN AND ADD-ON LEAD TO LAYANAN & HARGA, not to screens of their own. Both
 * are real, and both are fields OF a service — its turns, and the add-ons it may
 * be sold with — so they are edited in its form, and the card says so rather
 * than implying a list that does not exist. `GroomingSharedSettingsCard` made
 * the same call.
 *
 * UKURAN, RAS AND ZONA SAY "Segera". The first two are closed enums on the pet
 * (`PET_SIZES`, `PET_BREEDS`) that no tenant can edit; the third has nothing
 * behind it at all.
 */
const PENDING_CARDS: PendingHubCard[] = [
  {
    title: "Ukuran",
    description:
      "Kecil, sedang, besar — dipakai data hewan, harga varian layanan, dan komisi grooming.",
    blockedBy: "Masih daftar tetap, belum bisa diubah tenant",
  },
  {
    title: "Ras",
    description: "Daftar ras yang dipilih di data hewan.",
    blockedBy: "Masih daftar tetap, belum bisa diubah tenant",
  },
  {
    title: "Zona",
    description: "Zona antar-jemput dan tarif perjalanannya.",
    blockedBy: "Zona dan trip belum ada di sistem",
  },
];

export function ServiceSettingsScreen() {
  const { can } = usePermissions();
  const mayReadServices = can("services", "read");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Layanan</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Yang dipakai lebih dari satu layanan naik ke sini. Yang cuma dipakai
          satu layanan tinggal di rumahnya.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mayReadServices && (
          <>
            <HubLinkCard
              title="Tahapan"
              description="Urutan kerja yang dipakai jadwal dan komisi, beserta bobotnya. Diisi di form tiap layanan, dari Grooming › Layanan & Harga."
              href={GROOMING_CATALOG_PATH}
            />
            <HubLinkCard
              title="Add-on"
              description="Layanan tambahan yang bisa ditempel ke layanan utama. Diisi di form tiap layanan, dari Grooming › Layanan & Harga."
              href={GROOMING_CATALOG_PATH}
            />
          </>
        )}

        {PENDING_CARDS.map((card) => (
          <HubPendingCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}
