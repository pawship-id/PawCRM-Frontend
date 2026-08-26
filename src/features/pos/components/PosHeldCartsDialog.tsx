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
  openCartId = null,
}: {
  open: boolean;
  carts: PosTransaction[];
  loading: boolean;
  error: string | null;
  /**
   * The basket on the till right now, if it is one of these.
   *
   * A RESUMED BASKET KEEPS ITS PLACE in this list — it leaves only on the bin,
   * on its last line coming out, or on payment. That is deliberate, and without
   * a word for it the cashier sees the basket they are looking at sitting in the
   * parked list and reasonably wonders which copy is real.
   */
  openCartId?: string | null;
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
            Keranjang yang dititipkan di shift ini.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat…
          </div>
        ) : carts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Belum ada keranjang yang dititipkan.
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
                  {cart._id === openCartId && (
                    <span className="block text-xs text-success">
                      Sedang dibuka di kasir
                    </span>
                  )}
                  <span className="block text-xs tabular-nums text-muted">
                    {cart.items.length} item ·{" "}
                    {formatMoney(cart.runningTotals.net)}
                    {/*
                      The phone as the second identifier, when the row is named
                      after a customer. Two people called "Ibu Sri" is ordinary;
                      two on one number is not — and since 25 Aug the system
                      refuses the second.
                    */}
                    {!cart.heldLabel && cart.customer?.phone
                      ? ` · ${cart.customer.phone}`
                      : ""}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    /*
                      Nothing to resume when it is already the basket on screen.
                      Left visible rather than removed so the row keeps the shape
                      every other row has.
                    */
                    disabled={cart._id === openCartId}
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
