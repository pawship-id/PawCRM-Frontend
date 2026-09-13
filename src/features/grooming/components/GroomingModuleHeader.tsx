"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";

import {
  GROOMING_CATALOG_PATH,
  GROOMING_PATH,
  GROOMING_SETTINGS_PATH,
} from "../paths";

/**
 * The head of the Grooming module, shared by its three tabs — from
 * `buloo-grooming-v3.html`.
 *
 * ROUTES, NOT `useState`, like every other tabbed module (see `PageTabs`): the
 * mockup swaps tabs in memory because it has no routes, and here the booking
 * board and the price list need different grants and deserve their own links.
 *
 * THE MOCKUP'S "Ekspor" IS NOT HERE. Nothing exports yet, and a button that
 * answers a click with "belum dibangun" is a dead control (§1).
 */
export function GroomingModuleHeader({
  /** The create button for the tab you are on. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();

  const tabs: PageTab[] = [
    ...(can("bookings", "read")
      ? [
          {
            label: "Booking",
            href: GROOMING_PATH,
            // EXACT: the other two tabs are routes under this one.
            exact: true,
          },
        ]
      : []),
    ...(can("services", "read")
      ? [{ label: "Layanan & Harga", href: GROOMING_CATALOG_PATH }]
      : []),
    { label: "Pengaturan", href: GROOMING_SETTINGS_PATH },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb items={[{ label: "Layanan" }, { label: "Grooming" }]} />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Grooming
          </h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian grooming" />
    </div>
  );
}
