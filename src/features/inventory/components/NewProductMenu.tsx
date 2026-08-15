"use client";

import Link from "next/link";
import { Boxes, ChevronDown, Layers, Package, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The one way into the catalogue: a menu of the four ways a product arrives.
 *
 * THREE BUTTONS BECAME ONE, and the sentences are the reason. "+ Bundle" beside
 * "+ Produk baru" asked people to know what a bundle is before they could tell
 * whether they wanted one — and the answer was in a form two clicks away, which
 * is where most of them found out they had picked wrong. A menu has room to say
 * it, so each row carries the same sentence the form's own mode picker uses.
 * Saying it here is cheaper than saying it after the wrong choice.
 *
 * SATUAN, NOT "PRODUK BIASA". The shape is named after what a shop counts in —
 * one item, one price — rather than after what it is not. "Biasa" only means
 * anything once you already know the other two.
 *
 * IMPORT SITS APART, under a rule. The three above it are shapes; import is a
 * different kind of act — it is the entry point for a catalogue that does not
 * exist yet, a tenant's first day, while the others are what everyone uses
 * forever after. It stays last and unhighlighted for the same reason it used to
 * be the quietest of the three buttons.
 *
 * Permission-gated by the CALLER, like every other create affordance here.
 */
interface Entry {
  href: string;
  icon: LucideIcon;
  label: string;
  /** What this shape is, in the words the form itself uses. */
  hint: string;
}

const SHAPES: Entry[] = [
  {
    href: "/dashboard/inventory/products/new?type=standalone",
    icon: Package,
    label: "Satuan",
    hint: "Satu barang, satu harga, satu stok.",
  },
  {
    href: "/dashboard/inventory/products/new?type=variants",
    icon: Layers,
    label: "Varian",
    hint: "Satu produk induk yang mekar jadi beberapa ukuran atau rasa.",
  },
  {
    href: "/dashboard/inventory/products/new?type=bundle",
    icon: Boxes,
    label: "Bundle",
    hint: "Paket atau satuan besar yang memotong stok komponennya saat terjual.",
  },
];

const IMPORT: Entry = {
  href: "/dashboard/inventory/products/import",
  icon: Upload,
  label: "Import",
  hint: "Tambah banyak produk sekaligus dari file Excel.",
};

export function NewProductMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Sized to its label in both layouts: on a phone it shares the line
            with the `Filter` button, and the two of them nearly fill it. */}
        <Button>
          + Produk baru
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        // Wide enough for the sentences to break at most twice. The menu is
        // sized by its explanations, not by its labels.
        className="w-80 max-w-[calc(100vw-2rem)] p-1.5"
      >
        {SHAPES.map((entry) => (
          <MenuEntry key={entry.href} entry={entry} />
        ))}
        <DropdownMenuSeparator />
        <MenuEntry entry={IMPORT} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuEntry({ entry: { href, icon: Icon, label, hint } }: { entry: Entry }) {
  return (
    <DropdownMenuItem asChild className="gap-3 px-2 py-2.5">
      <Link href={href}>
        {/* `mt-0.5` optically centres the icon on the LABEL rather than on the
            two-line block, which is where the eye expects it. */}
        <Icon className="mt-0.5 size-4 self-start" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">{label}</span>
          {/* text-xs is the 13px floor — the sentence is a caption, and the
              label above it is what carries the choice. */}
          <span className="text-xs leading-snug whitespace-normal text-muted">
            {hint}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}
