"use client";

import { Trash2 } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/utils/decimal";
import type { PosTransaction } from "@/types/api";

/**
 * How a parked basket names itself.
 *
 * THE CUSTOMER'S NAME FIRST — FR-6: "label default keranjang tersimpan = nama
 * pelanggan (bila ada) atau 'Keranjang N'". A row reading "Keranjang 2" tells a
 * cashier holding two identical-looking baskets nothing at all, and picking the
 * wrong one means resuming somebody else's shopping.
 *
 * An explicit `heldLabel` still wins: a cashier who named it meant that name.
 *
 * "Keranjang N" IS THE LAST RESORT, not the default. It is right for a walk-in
 * with no name to give, and only then.
 */
/**
 * When the basket was last saved — hours and minutes, nothing more (FR-6).
 *
 * `updatedAt`, WHICH IS ALSO WHAT THIS LIST IS SORTED BY. A parked basket stays
 * parked while it is being worked on, so a basket resumed and added to at 15:40
 * reads as 15:40 — it is not an abandoned trolley, and telling those apart is
 * the whole reason the column is here.
 *
 * An earlier version stamped the first parking in a field of its own. It answered
 * a narrower question — "when was this first put aside" — and answered the useful
 * one worse.
 *
 * NO DATE, because this list is scoped to ONE shift: everything in it was parked
 * today, by this cashier, since they opened the till. A date on every row would
 * be the same date on every row.
 *
 * ABSOLUTE, NOT "12 menit lalu". A relative time goes stale the moment the
 * dialog is left open, and a stale one is wrong rather than merely old — while
 * "14:32" is never wrong and needs no clock ticking behind it.
 */
function savedAtLabel(savedAt: string | null): string {
  if (!savedAt) return "";

  const at = new Date(savedAt);
  if (Number.isNaN(at.getTime())) return "";

  return at.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cartLabel(cart: PosTransaction, index: number): string {
  if (cart.heldLabel) return cart.heldLabel;
  if (cart.customer?.name) return cart.customer.name;
  return `Keranjang ${index + 1}`;
}

/**
 * The parked baskets of this shift (FR-6).
 *
 * A DIALOG, not a sidebar: parking a cart is what a cashier does when a customer
 * goes back for something they forgot, so the list is opened, used once, and
 * closed. Permanent screen space for it would cost the catalogue.
 *
 * IT IS NOT PAGINATED, which mirrors the endpoint. A till with more parked carts
 * than fit on a screen has a workflow problem that a pager would hide rather
 * than solve.
 */
export function PosHeldCartsDialog({
  open,
  carts,
  loading,
  error,
  onResume,
  onDiscard,
  onOpenChange,
  blockedReason = null,
}: {
  open: boolean;
  carts: PosTransaction[];
  loading: boolean;
  error: string | null;
  /**
   * Why nothing here may be opened right now, or null when it may (FR-6).
   *
   * A REASON RATHER THAN A BOOLEAN, because the row has to SAY it. A greyed
   * Lanjutkan with nothing to explain it is how a cashier presses it three
   * times and then reports that the till is broken.
   */
  blockedReason?: string | null;
  onResume: (cart: PosTransaction) => void;
  onDiscard: (cart: PosTransaction) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keranjang tersimpan</DialogTitle>
          <DialogDescription>
            Keranjang yang disimpan di shift ini.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {/*
          PRD FR-6: melanjutkan diblokir selama keranjang aktif belum kosong.
          Said once, above the list, rather than repeated on every row — the
          reason is about the till, not about any one basket here.
        */}
        {blockedReason && (
          <p className="rounded-lg bg-tint-warning px-3 py-2 text-sm text-foreground">
            {blockedReason}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat…
          </div>
        ) : carts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Belum ada keranjang yang disimpan.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {carts.map((cart, index) => (
              <li
                key={cart._id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {cartLabel(cart, index)}
                  </span>
                  <span className="block text-xs tabular-nums text-muted">
                    {cart.items.length} item ·{" "}
                    {formatMoney(cart.runningTotals.net)}
                    {/*
                      WHEN IT WAS LAST SAVED, which FR-6 asks the list to carry.
                      It is what a cashier scans for: the trolley nobody has
                      touched since before the last customer.
                    */}
                    {cart.updatedAt ? ` · ${savedAtLabel(cart.updatedAt)}` : ""}
                  </span>

                  {/*
                    The phone on its own line, as a second identifier when the row
                    is named after a customer. Two people called "Ibu Sri" is
                    ordinary; two on one number is not — and since 25 Aug the
                    system refuses the second. Moved off the line above once the
                    time joined it: four facts separated by three dots is a row
                    somebody has to parse rather than glance at.
                  */}
                  {!cart.heldLabel && cart.customer?.phone && (
                    <span className="block text-xs tabular-nums text-muted">
                      {cart.customer.phone}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    /*
                      Nothing here may be opened while a basket with anything in
                      it is on screen. Left visible rather than removed so the
                      row keeps the shape every other row has — and the reason
                      is stated once above the list.
                    */
                    disabled={blockedReason !== null}
                    onClick={() => onResume(cart)}
                  >
                    Lanjutkan
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 text-danger"
                    aria-label={`Hapus ${cartLabel(cart, index)}`}
                    onClick={() => onDiscard(cart)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
