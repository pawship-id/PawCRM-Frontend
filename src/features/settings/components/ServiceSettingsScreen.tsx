"use client";

import { GROOMING_CATALOG_PATH } from "@/features/grooming";
import { usePermissions } from "@/features/permissions";

import { PET_DATA_PATH } from "../petOptions";
import { SERVICE_STEPS_PATH } from "../serviceSteps";
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
 * TAHAPAN HAS A SCREEN OF ITS OWN since 14 September 2026. It led to Layanan &
 * Harga while tahapan were free text typed into each service; they are now one
 * list per business line (`servicesteps`) that services pick from, so the card
 * opens that list. The BOBOT did not move — a step's commission weight belongs
 * to its place in a service and is still filled in there, which is why the
 * description says so rather than letting "Tahapan" promise it.
 *
 * ADD-ON STILL LEADS TO LAYANAN & HARGA. It is a field OF a service — the
 * add-ons it may be sold with — so it is edited in the service's form, and the
 * card says so rather than implying a list that does not exist.
 * `GroomingSharedSettingsCard` makes both calls the same way.
 *
 * DATA HEWAN IS ONE CARD WHERE THE MOCKUP DRAWS TWO. Ukuran and Ras were badged
 * "Segera" while both were closed enums on the pet (`PET_SIZES`, `PET_BREEDS`).
 * Since 14 September 2026 they are tenant data in one collection
 * (`petoptions`), beside jenis hewan and jenis bulu, told apart by `type` — one
 * screen with a pill per list, so one card rather than four leading to the same
 * place.
 *
 * IT IS DRAWN FOR EVERYBODY WHO REACHES THIS PAGE, outside the `services:read`
 * check the other two sit behind. The page itself already asks for that grant,
 * and the vocabulary needs none to read; writes are gated per action on the
 * screen behind it.
 *
 * ZONA STILL SAYS "Segera". There is nothing behind it at all.
 */
const PENDING_CARDS: PendingHubCard[] = [
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
              description="Daftar tahapan tiap lini bisnis — Mandi, Gunting, Blow dry — yang dipilih layanan. Bobotnya tetap diisi per layanan."
              href={SERVICE_STEPS_PATH}
            />
            <HubLinkCard
              title="Add-on"
              description="Layanan tambahan yang bisa ditempel ke layanan utama. Diisi di form tiap layanan, dari Grooming › Layanan & Harga."
              href={GROOMING_CATALOG_PATH}
            />
          </>
        )}

        <HubLinkCard
          title="Data hewan"
          description="Jenis hewan, ras, ukuran, dan jenis bulu — dipakai data hewan, harga varian layanan, dan komisi grooming."
          href={PET_DATA_PATH}
        />

        {PENDING_CARDS.map((card) => (
          <HubPendingCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}
