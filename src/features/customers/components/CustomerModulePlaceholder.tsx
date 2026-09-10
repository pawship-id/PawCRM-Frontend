import type { ComponentType, SVGProps } from "react";

import { SectionPlaceholderPanel } from "@/features/dashboard";

import { CustomerModuleHeader } from "./CustomerModuleHeader";

/**
 * A tab of the Pelanggan module whose screen has not been built — Membership and
 * Riwayat today.
 *
 * IT IS A REAL PAGE, not a greyed-out tab. Both were inert labels first, and a
 * dead control is the worse of the two: it cannot say why it does nothing, a
 * screen reader hears an ordinary word, and nobody can link to it. A route that
 * opens on "belum tersedia" answers the question the click was asking.
 *
 * IT WEARS THE MODULE HEADER, so the title, the tabs and the two counts stay put
 * while the reader looks around — the tab row is how they get back out, and a
 * placeholder that dropped it would be a dead end with a browser Back button.
 *
 * DO NOT PUT "use client" AT THE TOP OF THIS FILE. It has no state and no
 * handlers, and it takes `icon` as a COMPONENT from a page that is a Server
 * Component. Marking this one a client component puts the boundary above that
 * prop, and React refuses to serialise a lucide icon across it:
 *
 *   Only plain objects can be passed to Client Components from Server
 *   Components … <… icon={{$$typeof: …, render: …}}>
 *
 * The header below is the client component, and it crosses the boundary with no
 * props at all. Same arrangement SectionPlaceholder has always had.
 */
export function CustomerModulePlaceholder({
  title,
  note,
  icon,
}: {
  title: string;
  /** What the tab will hold, and where the nearest thing to it lives today. */
  note: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CustomerModuleHeader />
      <SectionPlaceholderPanel title={title} note={note} icon={icon} />
    </div>
  );
}
