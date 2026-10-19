"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { EllipsisVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RowLink {
  href: string;
  label: string;
  icon?: ReactNode;
}

/** A menu item that does something here instead of going somewhere. */
export interface RowAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Writes something irreversible — tinted, and set apart below the links. */
  destructive?: boolean;
}

/**
 * A row's Aksi cell: the vertical-dots button, opening the places a row leads
 * (19 October 2026, BO — Daftar Stok's "Kartu stok", Batch & Expired's "Cetak
 * label"). The same kebab the catalogue's rows wear.
 *
 * CLICKS STOP HERE. Some of these rows open a detail on click, and React
 * bubbles events through the component tree — out of the menu's portal too —
 * so without the stops a pick in the menu would also open the row.
 *
 * ACTIONS COME LAST, behind a separator: everything above only navigates, and
 * what is below writes — Stok Opname's "Buang", which still asks first. An
 * action that is not destructive (Faktur's "Bayar", which opens a dialog) sits
 * there too, untinted.
 *
 * PROMOTED FROM features/inventory (19 October 2026) when Pembelian's Faktur
 * and Penerimaan lists took the same kebab — ui-rules §14, second feature.
 */
export function RowLinkMenu({
  name,
  links,
  actions = [],
}: {
  /** The row's own name, so twenty triggers are not twenty identical "Aksi". */
  name: string;
  links: RowLink[];
  actions?: RowAction[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Aksi untuk ${name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        onClick={(event) => event.stopPropagation()}
      >
        {links.map((link) => (
          <DropdownMenuItem key={link.href} asChild>
            <Link href={link.href}>
              {link.icon}
              {link.label}
            </Link>
          </DropdownMenuItem>
        ))}
        {actions.length > 0 && links.length > 0 && <DropdownMenuSeparator />}
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant={action.destructive ? "destructive" : "default"}
            onSelect={action.onSelect}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
