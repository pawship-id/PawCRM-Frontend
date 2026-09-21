"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";

import { GROOMING_LINE, type ServiceLine } from "../line";

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
  /** Which line's module — Grooming unless said (see `ServiceLine`). */
  line = GROOMING_LINE,
}: {
  action?: ReactNode;
  line?: ServiceLine;
}) {
  const { can } = usePermissions();

  const tabs: PageTab[] = [
    ...(can("bookings", "read")
      ? [
          {
            label: "Booking",
            href: line.paths.root,
            // EXACT: the other two tabs are routes under this one.
            exact: true,
          },
        ]
      : []),
    ...(can("services", "read")
      ? [{ label: "Layanan & Harga", href: line.paths.catalog }]
      : []),
    { label: "Pengaturan", href: line.paths.settings },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb items={[{ label: "Layanan" }, { label: line.title }]} />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            {line.title}
          </h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel={`Bagian ${line.noun}`} />
    </div>
  );
}
