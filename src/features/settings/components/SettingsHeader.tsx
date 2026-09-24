"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";

import { SETTINGS_TABS, type SettingsTab } from "../paths";

/**
 * The two heads a Pengaturan page is drawn with (mockup `buloo-navigation-v3`,
 * 22 September 2026).
 *
 * A TAB PAGE carries the module title and the tab row: Umum, Layanan, Keuangan,
 * Pengguna & Sistem. A PAGE ONE OF THEM OPENS carries neither — it has a trail
 * whose "Pengaturan" leads back to the tab it belongs to. The mockup draws both
 * shapes; the tab row on a list of users would offer three places to go that
 * have nothing to do with the list.
 */

const TAB_LABELS: Record<SettingsTab, string> = {
  umum: "Umum",
  layanan: "Layanan",
  keuangan: "Keuangan",
  sistem: "Pengguna & Sistem",
};

/**
 * The tabs this role may open.
 *
 * Umum and Pengguna & Sistem are ALWAYS drawn: each is an ungated page of cards
 * that gate themselves, and Data Awal on the second is ungated by design.
 * Layanan is the hub gated on `services:read`. Keuangan is a page of cards, but
 * a role holding none of the four grants behind them would open it on nothing,
 * so the tab goes with them.
 */
function useSettingsTabs(): PageTab[] {
  const { can } = usePermissions();

  const visible: Record<SettingsTab, boolean> = {
    umum: true,
    layanan: can("services", "read"),
    keuangan:
      can("chartOfAccounts", "read") ||
      can("paymentChannels", "read") ||
      can("businessLines", "read") ||
      can("tenants", "read"),
    sistem: true,
  };

  return (Object.keys(SETTINGS_TABS) as SettingsTab[])
    .filter((tab) => visible[tab])
    .map((tab) => ({ label: TAB_LABELS[tab], href: SETTINGS_TABS[tab] }));
}

/** The head of a tab page: title, one line, and the tab row. */
export function SettingsTabsHeader() {
  const tabs = useSettingsTabs();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Pengaturan</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Yang dipakai lebih dari satu layanan naik ke sini. Yang cuma dipakai
          satu layanan tinggal di rumahnya.
        </p>
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian pengaturan" />
    </div>
  );
}

/** The head of a page a tab opens: "Pengaturan / Pengguna", title, one line. */
export function SettingsPageHeader({
  title,
  description,
  tab,
  action,
}: {
  title: string;
  description?: ReactNode;
  /** The tab this page is reached from — where the trail leads back to. */
  tab: SettingsTab;
  /** The page's create button, right-aligned beside the title. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="min-w-0">
        <Breadcrumb
          items={[
            { label: "Pengaturan", href: SETTINGS_TABS[tab] },
            { label: title },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
    </div>
  );
}
