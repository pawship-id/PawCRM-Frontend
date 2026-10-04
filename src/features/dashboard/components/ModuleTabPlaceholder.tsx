import type { ComponentType, ReactNode, SVGProps } from "react";

import { SectionPlaceholderPanel } from "./SectionPlaceholder";

/**
 * A tab of a tabbed module whose screen has not been built — Membership and
 * Riwayat under Pelanggan, Piutang and Retur under Penjualan.
 *
 * IT IS A REAL PAGE, not a greyed-out tab. Both modules started with inert
 * labels, and a dead control is the worse of the two: it cannot say why it does
 * nothing, a screen reader hears an ordinary word, and nobody can link to it. A
 * route that opens on "belum tersedia" answers the question the click asked.
 *
 * IT WEARS ITS MODULE'S HEADER, passed in whole rather than named by a string,
 * so the title, the tab row and any counts stay put while the reader looks
 * around — the tab row is how they get back out, and a placeholder that dropped
 * it would be a dead end with a browser Back button.
 *
 * DO NOT PUT "use client" AT THE TOP OF THIS FILE. It has no state and no
 * handlers, and it takes `icon` as a COMPONENT from a page that is a Server
 * Component. Marking this a client component puts the boundary above that prop,
 * and React refuses to serialise a lucide icon across it:
 *
 *   Only plain objects can be passed to Client Components from Server
 *   Components … <… icon={{$$typeof: …, render: …}}>
 *
 * `header` crosses the boundary the other way, which is the arrangement that
 * works: a server page renders a client component and hands it down as an
 * element.
 */
export function ModuleTabPlaceholder({
  header,
  title,
  note,
  icon,
}: {
  /** The module's own header, rendered above the panel. */
  header: ReactNode;
  title: string;
  /** What the tab will hold, and where the nearest thing to it lives today. */
  note: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="flex flex-col gap-6">
      {header}
      <SectionPlaceholderPanel title={title} note={note} icon={icon} />
    </div>
  );
}
