"use client";

import { Plus, Layers, Package as PackageIcon, Scissors } from "lucide-react";

import { HighlightText } from "@/components";

import { PosStockBadge } from "./PosStockBadge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import type { PosCatalogItem } from "@/types/api";

/**
 * Whether the barcode is what brought this tile back.
 *
 * True only when the term is in the barcode AND is not already visible in the
 * name or the SKU — if it is visible there, the highlight has already explained
 * the tile and a second row would be noise.
 */
function barcodeExplainsMatch(item: PosCatalogItem, search?: string): boolean {
  const term = search?.trim().toLowerCase();

  if (!term || !item.barcode) {
    return false;
  }

  const visible = `${item.name} ${item.code ?? ""}`.toLowerCase();

  return item.barcode.toLowerCase().includes(term) && !visible.includes(term);
}

/**
 * The tile's picture (FR-1).
 *
 * A FIXED-RATIO BOX, not an image sized by its own pixels: a grid whose rows
 * jump as photos load is one a cashier misclicks, and a shop's photos are
 * whatever the supplier sent — portrait, square, a screenshot.
 *
 * `thumbUrl` FIRST. It is the 320px derivative that exists for exactly this: a
 * grid of eight products should not download eight full-size originals over a
 * shop's wifi. The chain narrows rather than assuming, because both derivatives
 * are null on media stored before they existed.
 *
 * THE PLACEHOLDER IS BY KIND, not by category. FR-1 asks for "ikon kategori",
 * and a category carries an IMAGE rather than an icon name — so honouring that
 * literally would mean a second lookup to render a fallback. What the icon has
 * to do is tell a cashier at a glance whether the tile is a thing or a service,
 * and two icons do that.
 */
function PosProductThumbnail({ item }: { item: PosCatalogItem }) {
  const src = item.image?.thumbUrl ?? item.image?.mediumUrl ?? item.image?.url;

  if (!src) {
    const Icon = item.kind === "service" ? Scissors : PackageIcon;

    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-secondary/25">
        <Icon className="size-8 text-secondary-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="aspect-square w-full overflow-hidden rounded-lg bg-surface-hover">
      {/*
        A plain <img>, not next/image. The URLs come from whichever storage the
        tenant configured — GCS, Cloudinary, or the local mount — and next/image
        needs every one of those hosts declared at build time. A till that
        stopped showing photos because a tenant switched provider would be a
        worse failure than an unoptimised request.

        `alt=""` because the product's name is directly below it: a screen reader
        announcing the name twice is noise, not access.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="size-full object-cover" />
    </div>
  );
}

/**
 * One tile in the till grid.
 *
 * THREE SHAPES BEHIND ONE CARD. A sellable product shows a price and a stock
 * badge; a PARENT shows "N varian" and opens a picker instead of adding; a
 * SERVICE shows a price and no badge at all — a badge saying "in stock" on a
 * grooming invites the question of how many are left.
 *
 * AN EMPTY SHELF DISABLES THE BUTTON rather than hiding the tile. FR-1 is
 * explicit, and it is the right call: a cashier looking for something needs to
 * see that the shop stocks it and has run out, not that it does not exist.
 *
 * Hand-rolled rather than `<Card>` — not an oversight of ui-rules §2. Card's
 * `px-6` is drawn for a page panel; on a tile two-to-a-row on a narrow till it
 * would leave almost no room for the name it exists to show.
 */
export function PosProductCard({
  item,
  search,
  onAdd,
  onExpand,
  disabled = false,
}: {
  item: PosCatalogItem;
  /**
   * The term the grid was filtered on, for the highlight.
   *
   * PASS THE SETTLED TERM, not what is being typed — see usePosCatalog. Empty
   * renders plain text, so this is always safe to pass.
   */
  search?: string;
  onAdd: (item: PosCatalogItem) => void;
  /** Called for a parent — the variant picker opens instead of adding. */
  onExpand: (item: PosCatalogItem) => void;
  disabled?: boolean;
}) {
  const isParent = item.variantCount !== null;
  const soldOut = item.stock?.state === "out";

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-3">
      <PosProductThumbnail item={item} />

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium text-foreground">
            <HighlightText text={item.name} query={search} />
          </span>
          <PosStockBadge stock={item.stock} />
        </div>

        {item.code && (
          <span className="mt-0.5 block truncate text-xs tabular-nums text-muted">
            <HighlightText text={item.code} query={search} />
          </span>
        )}

        {/*
          THE BARCODE, AND ONLY WHEN IT IS THE REASON THIS TILE IS HERE.

          A search looks at four fields while a tile shows two, so a scan used to
          return a result with nothing on it marking the match. Showing the
          barcode always would fix that — and put thirteen digits of small grey
          text on all eight tiles, permanently, for something nobody reads unless
          they scanned.

          So the row appears when the term is IN the barcode and is not already
          visible in the name or the SKU. That is the exact case where the tile
          would otherwise be unexplained.
        */}
        {barcodeExplainsMatch(item, search) && (
          <span className="mt-0.5 block truncate text-xs tabular-nums text-muted">
            {/* The word, so the digits are not a number nobody can place. */}
            Barcode <HighlightText text={item.barcode ?? ""} query={search} />
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {/* A parent quotes no price — its variants carry them. */}
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {isParent ? `${item.variantCount} varian` : formatMoney(item.price)}
        </span>

        {isParent ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onExpand(item)}
            disabled={disabled}
            aria-label={`Pilih varian ${item.name}`}
          >
            <Layers className="size-4" />
            Pilih
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => onAdd(item)}
            disabled={disabled || soldOut}
            aria-label={`Tambah ${item.name}`}
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
