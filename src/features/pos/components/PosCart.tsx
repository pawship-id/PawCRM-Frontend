"use client";

import { Bookmark, ShoppingCart } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import type { PosDiscountMode, PosItem, PosTransaction } from "@/types/api";

import { PosCartLine } from "./PosCartLine";
import { PosCustomerSection } from "./PosCustomerSection";
import { PosDiscountPopover } from "./PosDiscountPopover";
import { PosOtherChargesEditor } from "./PosOtherChargesEditor";

/**
 * One run of consecutive lines that belong together.
 *
 * `bookingId` NULL IS RETAIL and gets no header — a bag of feed does not belong
 * to an appointment, and wrapping it in a titled box would invent a group nobody
 * asked for.
 *
 * GROUPED BY RUN, NOT BY KEY. Two bookings for the same animal on the same day
 * must stay two groups (FR-3's edge case: "keduanya tetap ditampilkan sebagai
 * baris terpisah, tidak digabung otomatis"), and lines keep the order the cart
 * stores them in — so a group is a stretch of adjacent lines sharing a booking,
 * never a bucket collected from across the basket.
 *
 * The ORIGINAL INDEX travels with every line, because every callback below —
 * remove, quantity, discount — addresses a line by its position in the cart. A
 * grouped view that renumbered them would delete the wrong row.
 */
function groupLines(items: PosItem[]): Array<{
  bookingId: string | null;
  petName: string | null;
  lines: Array<{ item: PosItem; index: number }>;
}> {
  const groups: ReturnType<typeof groupLines> = [];

  items.forEach((item, index) => {
    const bookingId = item.bookingId ?? null;
    const last = groups[groups.length - 1];

    if (last && last.bookingId === bookingId && bookingId !== null) {
      last.lines.push({ item, index });
      return;
    }

    if (last && last.bookingId === null && bookingId === null) {
      last.lines.push({ item, index });
      return;
    }

    groups.push({
      bookingId,
      petName: item.petName ?? null,
      lines: [{ item, index }],
    });
  });

  return groups;
}

/**
 * The right half of the till: the basket and what it comes to.
 *
 * EVERY FIGURE HERE IS READ, NOT COMPUTED. `runningTotals` comes from the server
 * on every response, derived by the same routine that gives a discount its
 * basis. A till that added up its own lines would eventually disagree with the
 * receipt, and the disagreement would reach a customer before it reached us.
 *
 * THE TOTAL IS THE LARGEST THING ON THE PANEL, because it is the number a
 * cashier reads aloud. Everything above it is the arithmetic that justifies it,
 * and is smaller for that reason.
 *
 * The surface is hand-rolled rather than `<Card>` — not an oversight of
 * ui-rules §2. Card wraps its children in a fixed `px-6`, and this panel is a
 * bordered header, a scrolling body and a footer that each own their own
 * padding; using Card would mean undoing its padding on all three.
 */
export function PosCart({
  cart,
  busy,
  error,
  onQtyChange,
  onRemove,
  onItemDiscount,
  onCartDiscount,
  onCharges,
  onHold,
  onCheckout,
  onPickCustomer,
  onClearCustomer,
  bookingSlot,
}: {
  cart: PosTransaction | null;
  busy: boolean;
  error: string | null;
  onQtyChange: (index: number, qty: string) => void;
  onRemove: (index: number) => void;
  onItemDiscount: (
    index: number,
    discount: { mode: PosDiscountMode; value: string } | null,
  ) => void;
  onCartDiscount: (
    discount: { mode: PosDiscountMode; value: string } | null,
  ) => void;
  onCharges: (charges: PosTransaction["otherCharges"]) => void;
  onHold: () => void;
  onCheckout: () => void;
  /** Opens the picker — for choosing one, or replacing the current one. */
  onPickCustomer: () => void;
  /** Makes the basket a walk-in again. A different act from replacing. */
  onClearCustomer: () => void;
  /** FR-3's booking banner and button, or nothing without a customer. */
  bookingSlot?: React.ReactNode;
}) {
  const items = cart?.items ?? [];
  const totals = cart?.runningTotals;
  const empty = items.length === 0;

  return (
    <aside
      // A complementary landmark with no name is one a screen-reader user has to
      // enter to identify. The catalogue beside it carries the same product
      // names, so "the basket" is a real distinction, not a formality.
      aria-label="Keranjang"
      className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ShoppingCart className="size-4 text-muted" />
        <span className="text-sm font-semibold text-foreground">Keranjang</span>
        {!empty && (
          <span className="text-sm tabular-nums text-muted">
            · {items.length} item
          </span>
        )}
      </header>

      {error && (
        <div className="px-4 pt-3">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {/*
        ABOVE THE LINES, because it is what a cashier sets first when it matters
        at all — and because on a receipt it is printed there.
      */}
      <PosCustomerSection
        customer={cart?.customer ?? null}
        busy={busy}
        onPick={onPickCustomer}
        onClear={onClearCustomer}
      />

      {/*
        FR-3's banner and its way in, passed in rather than built here. What they
        say depends on a query this component has no business making — and the
        whole slot is empty until a customer is on the basket.
      */}
      {bookingSlot && (
        <div className="space-y-2 px-4 pb-3">{bookingSlot}</div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <p className="px-6 py-16 text-center text-sm text-muted">
            Pilih produk atau layanan di sebelah kiri untuk mulai.
          </p>
        ) : (
          groupLines(items).map((group, groupIndex) => (
            <div key={group.bookingId ?? `retail-${groupIndex}`}>
              {/*
                FR-3: "setiap grup booking menampilkan header dengan nomor
                booking/ID dan nama hewan". Retail lines get no header — see
                `groupLines`.

                THE NUMBER IS NOT ON THE LINE. A cart item carries `bookingId`,
                not `bookingNumber`, so the header shows the animal's name and
                the booking's short id. Snapshotting the number onto every line
                would repeat it once per service to save one lookup.
              */}
              {group.bookingId && (
                <div className="flex items-baseline justify-between gap-2 bg-surface px-3 py-1.5">
                  <span className="truncate text-xs font-medium text-foreground">
                    {group.petName ?? "Hewan tidak diketahui"}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    Booking ·{group.bookingId.slice(-6)}
                  </span>
                </div>
              )}

              {group.lines.map(({ item, index }) => (
                <PosCartLine
                  key={`${item.kind}-${item.refId}-${index}`}
                  item={item}
                  index={index}
                  disabled={busy}
                  onQtyChange={onQtyChange}
                  onRemove={onRemove}
                  onDiscountChange={onItemDiscount}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {!empty && totals && (
        <div className="space-y-3 border-t border-border p-4">
          <PosOtherChargesEditor
            charges={cart?.otherCharges ?? []}
            onChange={onCharges}
            disabled={busy}
          />

          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums text-foreground">
                {formatMoney(totals.subtotal)}
              </dd>
            </div>

            {totals.itemDiscount !== "0.0000" && (
              <div className="flex justify-between">
                <dt className="text-muted">Diskon item</dt>
                <dd className="tabular-nums text-success">
                  −{formatMoney(totals.itemDiscount)}
                </dd>
              </div>
            )}

            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1 text-muted">
                Diskon keranjang
                <PosDiscountPopover
                  value={cart?.cartDiscount ?? null}
                  disabled={busy}
                  label="Diskon keranjang"
                  onApply={onCartDiscount}
                />
              </dt>
              <dd className="tabular-nums text-success">
                {totals.cartDiscount === "0.0000"
                  ? "—"
                  : `−${formatMoney(totals.cartDiscount)}`}
              </dd>
            </div>

            {totals.otherCharges !== "0.0000" && (
              <div className="flex justify-between">
                <dt className="text-muted">Biaya lain</dt>
                <dd className="tabular-nums text-foreground">
                  {formatMoney(totals.otherCharges)}
                </dd>
              </div>
            )}
          </dl>

          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatMoney(totals.net)}
            </span>
          </div>

          {/*
            PPN is separated at payment, where the tenant's rate and its
            inclusive/exclusive rule are read and frozen onto the receipt. Said
            here rather than left implicit, because a cashier reading a total
            aloud should know whether tax is in it.
          */}
          <p className="text-xs text-muted">
            PPN dihitung saat pembayaran.
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-11 flex-1"
              onClick={onHold}
              disabled={busy}
            >
              <Bookmark className="size-4" />
              Titipkan
            </Button>
            <Button
              type="button"
              className="h-11 flex-1"
              onClick={onCheckout}
              disabled={busy}
            >
              {busy && <Spinner />}
              Bayar
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
