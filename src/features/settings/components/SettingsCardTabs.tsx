"use client";

import { usePermissions } from "@/features/permissions";
import type { Action, Feature } from "@/features/permissions";

import { SETTINGS_PATHS } from "../paths";
import { HubLinkCard } from "./SettingsHubCards";
import { SettingsTabsHeader } from "./SettingsHeader";

/**
 * Pengaturan › Keuangan and Pengguna & Sistem — two tabs that are nothing but
 * cards, each opening a page of its own (mockup `buloo-navigation-v3`).
 *
 * EVERY CARD GATES ITSELF on the grant its destination enforces, the rule the
 * Umum tab already followed, so a tab shows exactly what the role may open. A
 * card with no `permission` is ungated — Data Awal, whose page reads each step's
 * grant on its own.
 */
interface SettingsCard {
  title: string;
  description: string;
  href: string;
  permission?: { feature: Feature; action: Action };
}

const FINANCE_CARDS: SettingsCard[] = [
  {
    title: "Daftar akun",
    description:
      "Struktur akun yang dipakai semua jurnal, beserta aturan alokasinya ke lini dan cabang.",
    href: SETTINGS_PATHS.daftarAkun,
    permission: { feature: "chartOfAccounts", action: "read" },
  },
  {
    title: "Channel pembayaran",
    description:
      "Tombol yang dipilih kasir saat menerima uang, dan akun kas atau bank yang menampungnya.",
    href: SETTINGS_PATHS.channelPembayaran,
    permission: { feature: "paymentChannels", action: "read" },
  },
  {
    title: "Lini bisnis",
    description:
      "Unit usaha yang laba ruginya dibaca terpisah — Grooming, Penitipan, Retail.",
    href: SETTINGS_PATHS.liniBisnis,
    permission: { feature: "businessLines", action: "read" },
  },
  {
    title: "Pajak",
    description:
      "Tarif PPN, dan apakah harga di katalog sudah termasuk pajak.",
    href: SETTINGS_PATHS.pajak,
    permission: { feature: "tenants", action: "read" },
  },
];

const SYSTEM_CARDS: SettingsCard[] = [
  {
    title: "Data awal",
    description:
      "Angka pembuka sebelum Buloo mulai mencatat — stok, saldo kas, piutang dan utang awal.",
    href: SETTINGS_PATHS.dataAwal,
  },
  {
    title: "Pengguna",
    description: "Daftar staf, perannya, dan status akunnya.",
    href: SETTINGS_PATHS.pengguna,
    permission: { feature: "users", action: "read" },
  },
  {
    title: "Peran",
    description: "Fitur apa yang boleh dibuka tiap peran.",
    href: SETTINGS_PATHS.peran,
    permission: { feature: "roles", action: "read" },
  },
  {
    title: "Akses cabang",
    description: "Data cabang mana yang terlihat oleh tiap pengguna.",
    href: SETTINGS_PATHS.aksesCabang,
    permission: { feature: "users", action: "read" },
  },
  {
    title: "Riwayat perubahan",
    description: "Siapa mengubah apa, dari mana, dan kapan.",
    href: SETTINGS_PATHS.riwayat,
    permission: { feature: "auditLogs", action: "read" },
  },
];

function CardTab({ cards }: { cards: SettingsCard[] }) {
  const { can } = usePermissions();

  const visible = cards.filter(
    (card) =>
      !card.permission ||
      can(card.permission.feature, card.permission.action),
  );

  return (
    <div className="flex flex-col gap-6">
      <SettingsTabsHeader />

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Belum ada pengaturan di bagian ini yang bisa kamu buka.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((card) => (
            <HubLinkCard
              key={card.href}
              title={card.title}
              description={card.description}
              href={card.href}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FinanceSettingsScreen() {
  return <CardTab cards={FINANCE_CARDS} />;
}

export function SystemSettingsScreen() {
  return <CardTab cards={SYSTEM_CARDS} />;
}
