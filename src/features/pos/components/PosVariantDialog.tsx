"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { PosStockBadge } from "./PosStockBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { posService } from "@/services/pos.service";
import { formatMoney } from "@/utils/decimal";
import type { PosCatalogItem } from "@/types/api";

/**
 * Choosing which variant to ring up.
 *
 * A PARENT IS NOT SELLABLE and the grid says so by showing "N varian" where a
 * price would be. Tapping it opens this instead of adding anything — a parent
 * added to a basket is a line nobody can pick off a shelf.
 *
 * IT ASKS THE TILL'S CATALOGUE, and that is what lets it show stock.
 *
 * The first version called the products endpoint, which does not know the
 * shift's warehouse — so it showed no stock at all, on the grounds that a badge
 * counting a shelf in another building is worse than none. That reasoning was
 * right and the conclusion was wrong: it left a cashier choosing between sizes
 * with no way to see which ones exist, which is the one question this modal is
 * open to answer. Asking the catalogue with `parentId` gets the same variants
 * WITH the shift's own stock, badged by the same component the grid uses.
 */

/**
 * What distinguishes this variant from its siblings.
 *
 * A variant's stored name repeats its parent's — "Cat Choise Adult — 1kg /
 * Chicken" — which is right on a catalogue screen where the row stands alone,
 * and wrong in a picker whose subtitle already names the family. Stripped, the
 * row reads "1kg / Chicken" and the sizes are legible at a glance.
 *
 * FALLS BACK TO THE WHOLE NAME when it does not begin with the parent's, because
 * a tenant is free to name a variant anything: better a long row than an empty
 * one.
 */
function variantLabel(name: string, parentName?: string): string {
  if (!parentName || !name.startsWith(parentName)) {
    return name;
  }

  // Whatever separator the name uses — an em dash, a hyphen, a slash — comes off
  // with the surrounding space rather than being left dangling at the front.
  const rest = name.slice(parentName.length).replace(/^[\s—–-]+/, "");

  return rest || name;
}

/**
 * How many variants one page of the picker holds — the catalogue's own ceiling.
 *
 * A family with more than this says so rather than quietly showing a subset. A
 * silent cap reads as "that is all of them", which on a size picker means a
 * cashier telling a customer the shop does not stock their size.
 */
const VARIANT_LIMIT = 48;

export function PosVariantDialog({
  parent,
  inCart,
  busy = false,
  onPick,
  onOpenChange,
}: {
  parent: PosCatalogItem | null;
  /**
   * How many of each variant are already in the basket, keyed by product id.
   *
   * WHAT MAKES STAYING OPEN LEGIBLE. With the modal closing on every pick, the
   * basket behind it was the feedback. Left open, a button that can be pressed
   * four times has to say what those four presses did — otherwise the cashier
   * counts in their head, which is the thing a till exists to stop.
   */
  inCart: Map<string, number>;
  /** True while a cart write is in flight — see the Tambah button. */
  busy?: boolean;
  onPick: (variant: PosCatalogItem) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [variants, setVariants] = useState<PosCatalogItem[]>([]);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentId = parent?._id ?? null;

  useEffect(() => {
    if (!parentId) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    posService
      .catalog({ parentId, limit: VARIANT_LIMIT })
      .then((result) => {
        if (!active) return;
        setVariants(result.items);
        // No silent truncation: a family with more variants than one page says
        // so rather than quietly showing a subset (ui-rules' no-silent-caps).
        setHidden(Math.max(0, result.pagination.total - result.items.length));
      })
      .catch(() => {
        if (active) setError("Varian gagal dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [parentId]);

  return (
    <Dialog open={parent !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pilih varian</DialogTitle>
          <DialogDescription>{parent?.name}</DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat varian…
          </div>
        ) : variants.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Produk ini belum punya varian yang bisa dijual.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {variants.map((variant) => (
              <li
                key={variant._id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  {/*
                    THE PARENT'S NAME IS STRIPPED. Every variant here begins with
                    it — "Cat Choise Adult — 1kg / Chicken" — and the modal's own
                    subtitle already says it. Repeating it on every row pushed the
                    part that actually distinguishes the sizes off the end of the
                    line, so the cashier read four truncated copies of a name they
                    already knew.
                  */}
                  <span className="block truncate text-sm font-medium text-foreground">
                    {variantLabel(variant.name, parent?.name)}
                  </span>

                  <span className="block truncate text-xs tabular-nums text-muted">
                    {variant.code}
                    {/*
                      The running count, MUTED and on the second line rather than
                      a badge of its own. As a green pill it sat beside the green
                      stock badge and the two competed — same colour, different
                      questions, and neither read cleanly. The toast is the
                      immediate feedback now; this is the standing answer.
                    */}
                    {(inCart.get(variant._id) ?? 0) > 0 && (
                      <>
                        {/*
                          The separator sits OUTSIDE the coloured span: it joins
                          the SKU to the count, it is not part of either. Inside,
                          the span's own text would read "· 2 di keranjang",
                          which is a different string to anything reading it —
                          a screen reader included.
                        */}
                        {variant.code ? " · " : ""}
                        <span className="text-success">
                          {`${inCart.get(variant._id)} di keranjang`}
                        </span>
                      </>
                    )}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/*
                    THE ONE QUESTION THIS MODAL IS OPEN TO ANSWER, and now the
                    only badge on the row. Same component the grid tile uses, so
                    the two cannot come to different conclusions about what green
                    means.
                  */}
                  <PosStockBadge stock={variant.stock} />

                  <span className="text-sm tabular-nums text-foreground">
                    {formatMoney(variant.price)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    /*
                      Disabled while a cart write is in flight. The modal stays
                      open now, so a cashier CAN press twice before the first
                      response lands — and every mutation sends the whole basket,
                      so the second would be built from a basket the first has
                      not yet updated, and would silently undo it.
                    */
                    /*
                      AN EMPTY SHELF IS STILL LISTED, for the same reason it is on
                      a tile: a cashier looking for a size needs to see that the
                      shop stocks it and has run out, not that it does not exist.

                      THE SERVER'S CALL, not the badge's — see PosProductCard.
                      An empty shelf still sells wherever the shop allows the
                      balance to go negative, which is the default; absent means
                      sellable, for an older server.
                    */
                    disabled={busy || variant.sellable === false}
                    /*
                      NAMED BY ITS ROW. Every button here reads "Tambah", so
                      without this a screen reader announces the same word once
                      per size with nothing to tell them apart — and the modal
                      now stays open, so there are more of them on screen at once
                      than there ever used to be.
                    */
                    aria-label={`Tambah ${variant.name}`}
                    onClick={() =>
                      /*
                        HANDED ON WHOLE. It is already a catalogue tile — the
                        same shape the grid passes — so rebuilding it field by
                        field would be a second chance to get one wrong.
                      */
                      onPick(variant)
                    }
                  >
                    Tambah
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {hidden > 0 && (
          <p className="text-xs text-muted">
            {hidden} varian lain tidak muat di daftar ini. Cari nama atau
            SKU-nya di kotak pencarian kasir.
          </p>
        )}

        {/*
          A WAY OUT, because the modal no longer closes itself.

          FR-1 wants it open after a pick so a cashier can add another size from
          the same family without reopening it — which is the ordinary case: a
          customer buying two of a thing usually buys two DIFFERENT sizes of it.
          The cost is that closing becomes something they have to do, so it needs
          to be one obvious button rather than only the × in the corner.
        */}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Selesai
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
