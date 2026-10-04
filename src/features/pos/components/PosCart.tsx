"use client";

import { Bookmark, ShoppingCart } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  formatMoney,
  isPositive,
  subtractDecimals,
  sumDecimals,
} from "@/utils/decimal";
import { usePermissions } from "@/features/permissions";
import type { PosDiscountMode, PosItem, PosTransaction } from "@/types/api";

import { bookingShareOf, membershipShareOf } from "../bookingDiscount";
import type { BenefitQuoteResponse } from "@/types/membership";

import { PosBenefitSection } from "./PosBenefitSection";
import { PosCartLine } from "./PosCartLine";
import { PosCustomerSection } from "./PosCustomerSection";
import { PosDiscountPopover } from "./PosDiscountPopover";
import { PosNoteEditor } from "./PosNoteEditor";
import { PosOtherChargesEditor } from "./PosOtherChargesEditor";

/**
 * The basket's lines, gathered per booking.
 *
 * `bookingId` NULL IS RETAIL and gets no header — a bag of feed does not belong
 * to an appointment, and wrapping it in a titled box would invent a group nobody
 * asked for. Retail lines are gathered by RUN, in the order the cart stores them.
 *
 * ONE GROUP PER BOOKING, wherever its lines sit. A booking is one animal and one
 * main service, so the service and every add-on on it belong under one header —
 * including an add-on tapped later that landed after a bag of feed. Two bookings
 * for the same animal on the same day are two ids and so stay two groups (FR-3's
 * edge case: "keduanya tetap ditampilkan sebagai baris terpisah, tidak digabung
 * otomatis").
 *
 * The ORIGINAL INDEX travels with every line, because every callback below —
 * remove, quantity, discount — addresses a line by its position in the cart. A
 * grouped view that renumbered them would delete the wrong row.
 */
function groupLines(items: PosItem[]): Array<{
  bookingId: string | null;
  /** The booking's animal — every line of one booking names the same one. */
  petName: string | null;
  /** Null while the booking is a draft; it earns a number when it is paid. */
  bookingNumber: string | null;
  lines: Array<{ item: PosItem; index: number }>;
}> {
  const groups: ReturnType<typeof groupLines> = [];

  items.forEach((item, index) => {
    const bookingId = item.bookingId ?? null;
    const last = groups[groups.length - 1];
    const existing =
      bookingId === null
        ? last?.bookingId === null
          ? last
          : undefined
        : groups.find((group) => group.bookingId === bookingId);

    if (existing) {
      existing.lines.push({ item, index });
      existing.petName ??= item.petName ?? null;
      existing.bookingNumber ??= item.bookingNumber ?? null;
      return;
    }

    groups.push({
      bookingId,
      petName: item.petName ?? null,
      bookingNumber: item.bookingNumber ?? null,
      lines: [{ item, index }],
    });
  });

  return groups;
}

/**
 * One group's lines with each add-on tucked under the service it hangs off.
 *
 * "Extra Handling" arrived in the basket as a line of its own — it has its own
 * price and it bills as a line — and the cashier read three rows where two
 * services were sold. It is not a third purchase; it is something done to the
 * bath.
 *
 * MATCHED ON THE SERVICE, NOT ON A LINE ID. A cart line has no stable identity —
 * the server rebuilds every line from the payload on each write — so
 * `parentServiceId` names the CATALOGUE service its parent is for. A group is
 * one booking, and a booking has one main service, so the service settles it.
 *
 * AN ORPHAN STAYS A LINE OF ITS OWN, and that is the case this must not lose:
 * an add-on bought on its own at the till carries no parent at all, and one
 * whose service was deleted out of the basket has a parent that is no longer
 * there. Either way it is still billed, and a line that vanished from the screen
 * while staying on the receipt is the worst outcome available.
 *
 * THE ORIGINAL INDEX TRAVELS ON, unchanged — every callback addresses a line by
 * its position in the cart, and a nested view that renumbered them would delete
 * the wrong row.
 */
function nestAddons(lines: Array<{ item: PosItem; index: number }>): Array<{
  item: PosItem;
  index: number;
  addons: Array<{ item: PosItem; index: number }>;
}> {
  const nested = lines.map((line) => ({ ...line, addons: [] as typeof lines }));

  /* Keyed on the PARENT's own service, which is what an add-on points at. */
  const byService = new Map(
    nested.map((line) => [String(line.item.refId), line]),
  );

  return nested.filter((line) => {
    if (!line.item.parentServiceId) return true;

    const parent = byService.get(String(line.item.parentServiceId));

    if (!parent || parent === line) return true;

    parent.addons.push({ item: line.item, index: line.index });
    return false;
  });
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
  onLinePrice,
  onRemove,
  onItemDiscount,
  onItemBenefit,
  benefitQuote,
  onCartDiscount,
  onCharges,
  onNote,
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
  /** One line, or a service and the add-ons under it — see `PosCartLine`. */
  onRemove: (index: number | number[]) => void;
  /**
   * Apply or remove a membership benefit on one line (29 September 2026).
   *
   * OPTIONAL, so a caller that has not wired the quote yet simply renders no
   * chips rather than a control that cannot work — the same shape `maySetPrice`
   * takes for a cashier who may not re-price.
   */
  onItemBenefit?: (
    index: number,
    benefit: { membershipId: string; benefitId: string } | null,
  ) => void;
  /**
   * THE WHOLE QUOTE, not a per-line map (30 September 2026).
   *
   * The benefits moved off the rows into one section under Diskon keranjang —
   * see `PosBenefitSection` — and that section lists EVERY benefit, including
   * the ones no line matches. A map keyed by line could not express those at
   * all: a benefit with nothing to land on has no line to be keyed by.
   */
  benefitQuote?: BenefitQuoteResponse | null;
  onItemDiscount: (
    index: number,
    discount: { mode: PosDiscountMode; value: string } | null,
  ) => void;
  /** Typing a price over the catalogue's; `null` puts the line back to it. */
  onLinePrice: (index: number, unitPrice: string | null) => void;
  onCartDiscount: (
    discount: { mode: PosDiscountMode; value: string } | null,
  ) => void;
  onCharges: (charges: PosTransaction["otherCharges"]) => void;
  onHold: () => void;
  onCheckout: () => void;
  /** Opens the picker — for choosing one, or replacing the current one. */
  /** The transaction's free-text note, or null to clear it (FR-5). */
  onNote: (note: string | null) => void;
  onPickCustomer: () => void;
  /** Makes the basket a walk-in again. A different act from replacing. */
  onClearCustomer: () => void;
  /** FR-3's booking banner and button, or nothing without a customer. */
  bookingSlot?: React.ReactNode;
}) {
  const { can } = usePermissions();
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
      {bookingSlot && <div className="space-y-2 px-4 pb-3">{bookingSlot}</div>}

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

                THE NUMBER WHEN THERE IS ONE. A draft this basket raised has
                none until the sale is paid, so its short id stands in — a
                header with a blank where the number goes reads as broken.
              */}
              {group.bookingId && (
                <div className="flex items-baseline justify-between gap-2 bg-surface px-3 py-1.5">
                  <span className="truncate text-xs font-medium text-foreground">
                    {group.petName ?? "Hewan tidak diketahui"}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {group.bookingNumber ??
                      `Booking ·${group.bookingId.slice(-6)}`}
                  </span>
                </div>
              )}

              {nestAddons(group.lines).map(({ item, index, addons }) => (
                <PosCartLine
                  key={`${item.kind}-${item.refId}-${index}`}
                  item={item}
                  index={index}
                  addons={addons}
                  disabled={busy}
                  onQtyChange={onQtyChange}
                  onRemove={onRemove}
                  onDiscountChange={onItemDiscount}
                  onPriceChange={onLinePrice}
                  /*
                    READ FROM THE GRANT, not passed down as a flag somebody
                    might forget to set: a price box drawn for a cashier the
                    server will refuse is a control that exists to fail.
                  */
                  maySetPrice={can("posTransactions", "setPrice")}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {!empty && totals && (
        <div className="space-y-3 border-t border-border p-4">
          {/*
            THE NOTE SITS WITH THE CHARGES, not with the customer. Both are facts
            about the SALE rather than about the person, both are typed rarely,
            and both belong beside the figures they may explain — "ongkir 15.000"
            and "jangan pakai parfum" answer the same kind of question about the
            same receipt.
          */}
          <PosNoteEditor
            note={cart?.note ?? null}
            disabled={busy}
            onChange={onNote}
          />

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

            {/*
              THE SERVER'S ITEM DISCOUNT, SPLIT THREE WAYS — the lines' own
              typed discount, the bookings' shares of "Diskon seluruh booking",
              and what a membership card paid for. The three always add up to
              `totals.itemDiscount`. The booking share is shown HERE ONLY, once
              for the whole basket — not under each booking, which read as a
              second discount per animal (15 September 2026).

              ⚠️ A CARD'S GIVEAWAY IS NOT "DISKON ITEM" (1 October 2026, on
              request). It used to be folded into the same figure as whatever the
              cashier typed — one number answering two different questions: "how
              much did we choose to give away" and "how much had the customer
              already paid for". `own` now excludes it, so Diskon item is
              CASHIER-TYPED DISCOUNTS ONLY; a card's part gets its own line below,
              with which lines it paid for.
            */}
            {(() => {
              const shares = sumDecimals((cart?.items ?? []).map(bookingShareOf));
              const membershipShares = sumDecimals(
                (cart?.items ?? []).map((item) => membershipShareOf(item) ?? "0"),
              );
              const own = subtractDecimals(
                subtractDecimals(totals.itemDiscount, shares),
                membershipShares,
              );
              const membershipLines = (cart?.items ?? [])
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => membershipShareOf(item) !== null);

              return (
                <>
                  {isPositive(own) && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Diskon item</dt>
                      <dd className="tabular-nums text-success">
                        −{formatMoney(own)}
                      </dd>
                    </div>
                  )}
                  {isPositive(shares) && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Diskon booking</dt>
                      <dd className="tabular-nums text-success">
                        −{formatMoney(shares)}
                      </dd>
                    </div>
                  )}
                  {isPositive(membershipShares) && (
                    <div>
                      <div className="flex justify-between">
                        <dt className="text-muted">Diskon membership</dt>
                        <dd className="tabular-nums text-success">
                          −{formatMoney(membershipShares)}
                        </dd>
                      </div>
                      {/*
                        WHICH LINES IT PAID FOR — the question a number alone
                        cannot answer once a basket holds more than one.
                      */}
                      <ul className="mt-0.5 flex flex-col gap-0.5 pl-4">
                        {membershipLines.map(({ item, index }) => (
                          <li
                            key={`${item.kind}-${item.refId}-${index}`}
                            className="flex justify-between gap-2 text-xs text-muted"
                          >
                            <span className="min-w-0 truncate">
                              {item.petName
                                ? `${item.petName} - ${item.name}`
                                : item.name}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              −{formatMoney(membershipShareOf(item)!)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1 text-muted">
                Diskon keranjang
                {/*
                  NOTHING LEFT TO DISCOUNT (1 October 2026, on request) — the
                  same rule as a line's own discount button. A basket already at
                  nought cannot be cut further; the server would floor it there
                  anyway.
                  ⚠️ ONLY WHEN NOTHING WAS TYPED. A basket at nought BECAUSE the
                  cashier typed 100% off must keep its control, or the discount
                  they just entered is one they can never take back off.
                */}
                <PosDiscountPopover
                  value={cart?.cartDiscount ?? null}
                  disabled={
                    busy ||
                    (!cart?.cartDiscount &&
                      (totals.payable ?? totals.net) === "0.0000")
                  }
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

            {/* UNDER DISKON KERANJANG, where the owner asked for it — the two
                are the same kind of thing: money coming off the whole basket
                rather than off one row. */}
            {onItemBenefit && (
              <PosBenefitSection
                quote={benefitQuote ?? null}
                items={cart?.items ?? []}
                disabled={busy}
                onApply={(index, benefit) => onItemBenefit(index, benefit)}
                onRemove={(index) => onItemBenefit(index, null)}
              />
            )}

            {totals.otherCharges !== "0.0000" && (
              <div className="flex justify-between">
                <dt className="text-muted">Biaya lain</dt>
                <dd className="tabular-nums text-foreground">
                  {formatMoney(totals.otherCharges)}
                </dd>
              </div>
            )}

            {/*
              A ROW OF ITS OWN ONLY WHEN THE TAX IS ON TOP. For a shop whose
              prices already include it, a PPN row above the total is a figure
              that does not add up: subtotal and tax would sum past the total by
              the whole tax, and somebody checking the arithmetic would be right
              to say the screen is wrong.

              ONE TEMPLATE STRING for the label — JSX interpolation splits it
              into three text nodes.
            */}
            {totals.taxAdded && totals.tax && (
              <div className="flex justify-between">
                <dt className="text-muted">{`PPN ${totals.taxRate ?? 0}%`}</dt>
                <dd className="tabular-nums text-foreground">
                  {formatMoney(totals.tax)}
                </dd>
              </div>
            )}
          </dl>

          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {/*
                WHAT THE CUSTOMER PAYS, which is `net` plus the tax for a shop
                that charges it on top. This read `net` unconditionally, so such
                a till showed a total the payment screen would then refuse — and
                the cashier had no way to see the difference.
              */}
              {formatMoney(totals.payable ?? totals.net)}
            </span>
          </div>

          {/*
            SAID ONLY WHERE IT IS STILL TRUE. Once the running total carries the
            tax, "PPN dihitung saat pembayaran" is a promise the screen has
            already kept — and on an exclusive-tax basket it would contradict the
            PPN row directly above it.
          */}
          {!totals.tax && (
            <p className="text-xs text-muted">PPN dihitung saat pembayaran.</p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-11 flex-1"
              onClick={onHold}
              disabled={busy}
            >
              <Bookmark className="size-4" />
              Simpan
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
