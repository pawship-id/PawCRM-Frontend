"use client";

import { useState } from "react";
import { Bookmark, House, PawPrint, Plus, ShoppingCart } from "lucide-react";

import { Alert, InfoTooltip, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  formatMoney,
  isPositive,
  subtractDecimals,
  sumDecimals,
} from "@/utils/decimal";
import { usePermissions } from "@/features/permissions";
import type {
  PosBenefitPick,
  PosDiscountMode,
  PosItem,
  PosTransaction,
} from "@/types/api";
import type { BenefitQuoteResponse } from "@/types/membership";

import { bookingShareOf, membershipShareOf } from "../bookingDiscount";
import {
  groupByPet,
  isFeeLine,
  quoteLineFor,
  type PetPlan,
} from "../membershipCart";
import { PosBenefitSelect } from "./PosBenefitSelect";
import { PosCartLine } from "./PosCartLine";
import { PosLineDialog } from "./PosLineDialog";
import { PosCustomerSection } from "./PosCustomerSection";
import { PosDiscountPopover } from "./PosDiscountPopover";
import { PosNoteEditor } from "./PosNoteEditor";
import { PosOtherChargesEditor } from "./PosOtherChargesEditor";
import { PosVisitFeeLine } from "./PosVisitFeeLine";

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
function groupLines(entries: Array<{ item: PosItem; index: number }>): Array<{
  bookingId: string | null;
  /** The booking's animal — every line of one booking names the same one. */
  petName: string | null;
  /** Null while the booking is a draft; it earns a number when it is paid. */
  bookingNumber: string | null;
  lines: Array<{ item: PosItem; index: number }>;
}> {
  const groups: ReturnType<typeof groupLines> = [];

  entries.forEach(({ item, index }) => {
    /* A home-visit fee is a row of its own — see `tripLines`. */
    if (item.visitFee) return;

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
 * THE HOME-VISIT FEES, one group per trip (11 October 2026, on request).
 *
 * The fee bills as an add-on of the grooming booking that carries it, but it
 * pays for the groomer's journey to the house, so the basket draws it under a
 * header of its own instead of as "+ Biaya kunjungan" under one animal's bath.
 * Keyed by the trip, falling back to the booking for one made before trips.
 */
function tripLines(items: PosItem[]): Array<{
  key: string;
  zoneName: string | null;
  lines: Array<{ item: PosItem; index: number }>;
}> {
  const groups: ReturnType<typeof tripLines> = [];

  items.forEach((item, index) => {
    if (!item.visitFee) return;

    const key = item.visitFee.homeTripId ?? `booking-${item.bookingId ?? index}`;
    const existing = groups.find((group) => group.key === key);

    if (existing) {
      existing.lines.push({ item, index });
      return;
    }

    groups.push({ key, zoneName: item.visitFee.zoneName, lines: [{ item, index }] });
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
  onItemDetails,
  onItemBenefit,
  memberQuote,
  petPlans,
  customerPerks,
  onCartDiscount,
  onCharges,
  onNote,
  onSyncOnline,
  onHold,
  onCheckout,
  onPickCustomer,
  onClearCustomer,
  onAddTrip,
  bookingSlot,
}: {
  cart: PosTransaction | null;
  busy: boolean;
  error: string | null;
  onQtyChange: (index: number, qty: string) => void;
  /** One line, or a service and the add-ons under it — see `PosCartLine`. */
  onRemove: (index: number | number[]) => void;
  /**
   * The cashier's member pick on one line — a candidate, or `null` for "Tanpa
   * member" (Promosi V1). OPTIONAL: without it no select is drawn.
   */
  onItemBenefit?: (index: number, benefit: PosBenefitPick | null) => void;
  /**
   * The member quote for THIS basket (refs are line indexes) — null while none
   * is current. Each line reads its own answer from it.
   */
  memberQuote?: BenefitQuoteResponse | null;
  /** The plan each animal's header names — see `petPlans` in membershipCart. */
  petPlans?: ReadonlyMap<string, PetPlan>;
  /** The customer's membership chips, under their name. */
  customerPerks?: React.ReactNode;
  /**
   * Everything the line dialog edits, in one write — see `PosLineDialog`.
   * Resolves `false` when the server refused it, so the dialog stays open.
   */
  onItemDetails: (
    index: number,
    details: {
      discount: { mode: PosDiscountMode; value: string } | null;
      unitPrice?: string | null;
      qty?: string;
      lots: Array<{ batchId: string; qty: string }>;
      note: string | null;
    },
  ) => Promise<boolean>;
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
  /** Sync online on or off — share this basket with every till of the branch. */
  onSyncOnline?: (syncOnline: boolean) => void;
  onPickCustomer: () => void;
  /** Makes the basket a walk-in again. A different act from replacing. */
  onClearCustomer: () => void;
  /** FR-3's booking banner and button, or nothing without a customer. */
  bookingSlot?: React.ReactNode;
  /**
   * Puts an owed trip's fee on the basket (11 October 2026) — offered for each
   * of `cart.owedTrips`. Absent, the prompt says so but offers no button.
   */
  onAddTrip?: (tripId: string) => void;
}) {
  const { can } = usePermissions();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const items = cart?.items ?? [];
  const totals = cart?.runningTotals;
  const empty = items.length === 0;

  /*
    AN OLD-SHAPE FEE LEAVES WITH ITS BOOKING — a basket written before
    11 October 2026 may still carry the fee as an add-on of one grooming, with
    no bin of its own. A trip's own line (`homeTripId`) has a bin and is not
    touched here.
  */
  const removeLines = (target: number | number[]) => {
    const list = Array.isArray(target) ? target : [target];
    const released = new Set(
      list.map((index) => items[index]?.bookingId).filter(Boolean).map(String),
    );
    const fees = items.flatMap((item, index) =>
      item.visitFee &&
      item.bookingId &&
      released.has(String(item.bookingId)) &&
      !list.includes(index)
        ? [index]
        : [],
    );

    /*
      THE TRIP GOES WITH ITS LAST GROOMING (11 October 2026, on request). When
      the lines taken off were a trip's bookings and no other grooming of that
      trip stays on the basket, its fee line goes too — and comes back on offer
      with the next booking of the house that is billed. A trip pulled on its
      own (every booking billed already) has no grooming here and is untouched.
    */
    const gone = new Set([...list, ...fees]);
    const tripsTouched = new Set(
      list.map((index) => items[index]?.bookingTripId).filter(Boolean).map(String),
    );
    const trips = items.flatMap((item, index) => {
      if (!item.homeTripId || gone.has(index)) return [];
      const tripId = String(item.homeTripId);
      if (!tripsTouched.has(tripId)) return [];
      const stillRiding = items.some(
        (other, at) => !gone.has(at) && String(other.bookingTripId ?? "") === tripId,
      );
      return stillRiding ? [] : [index];
    });

    const extra = [...fees, ...trips];
    onRemove(extra.length > 0 ? [...list, ...extra] : target);
  };

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
        {/*
          THE BASKET'S OWN NUMBER, from the branch-wide counter — the same
          "Keranjang 7" Keranjang Tersimpan lists it under, so a cashier calling
          it across the counter and the one at the next till mean one basket.
        */}
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {cart?.cartNumber ? `Keranjang ${cart.cartNumber}` : "Keranjang"}
        </span>
        {!empty && (
          <span className="text-sm tabular-nums text-muted">
            · {items.length} item
          </span>
        )}

        {/*
          SYNC ONLINE. Only once the basket exists — there is nothing to share
          before the first line, and the flag lives on the basket's row.
        */}
        {cart && onSyncOnline && (
          <div className="ml-auto flex items-center gap-2">
            <Label
              htmlFor="pos-sync-online"
              className="text-xs font-medium text-muted"
            >
              Sync online
            </Label>
            <InfoTooltip hint="Kalau aktif, setelah disimpan keranjang ini muncul di daftar simpanan semua kasir di cabang ini, jadi kasir lain bisa melanjutkan dan menerima pembayarannya. Kalau mati, hanya kamu yang bisa melihatnya." />
            <Switch
              id="pos-sync-online"
              checked={cart.syncOnline === true}
              onCheckedChange={onSyncOnline}
              disabled={busy}
            />
          </div>
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
        perks={customerPerks}
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
          (() => {
            const petGroups = groupByPet(items);
            const hasPets = petGroups.some((group) => group.petId);

            /* The member select for one line — only where a card could act. */
            const benefitFor = (index: number) => {
              const item = items[index];
              if (!onItemBenefit || !item || item.kind === "membership" || isFeeLine(item)) {
                return null;
              }
              return (
                <PosBenefitSelect
                  item={item}
                  line={quoteLineFor(memberQuote ?? null, index)}
                  disabled={busy}
                  onChange={(pick) => onItemBenefit(index, pick)}
                />
              );
            };

            return petGroups.map((petGroup) => {
              const plan = petGroup.petId ? petPlans?.get(petGroup.petId) : undefined;

              return (
                <div key={petGroup.key} data-pet-group>
                  {/*
                    ONE HEADER PER ANIMAL (Promosi V1): its name and the plan it
                    holds — "(dibeli sekarang)" for a package in this basket,
                    "· sedang ditunda" for a paused card. Lines without an
                    animal sit last under "Tanpa hewan", which is only said when
                    there is an animal to tell them apart from.
                  */}
                  {(petGroup.petId || hasPets) && (
                    <div className="flex items-center gap-1.5 bg-surface px-3 py-1.5 text-xs">
                      {petGroup.petId && (
                        <PawPrint className="size-3.5 shrink-0 text-muted" aria-hidden />
                      )}
                      <span className="shrink-0 font-medium text-foreground">
                        {petGroup.petId
                          ? (petGroup.petName ?? "Hewan tidak diketahui")
                          : "Tanpa hewan"}
                      </span>
                      {plan && (
                        <span className="min-w-0 truncate text-muted">
                          {`· ${plan.name}${
                            plan.state === "new"
                              ? " (dibeli sekarang)"
                              : plan.state === "paused"
                                ? " · sedang ditunda"
                                : ""
                          }`}
                        </span>
                      )}
                    </div>
                  )}

                  {groupLines(petGroup.lines).map((group, groupIndex) => (
                    <div key={group.bookingId ?? `retail-${groupIndex}`}>
                      {/*
                        FR-3: a booking's lines stay together under its number —
                        two bookings for one animal remain two runs. A draft
                        this basket raised has no number until it is paid, so
                        its short id stands in.
                      */}
                      {group.bookingId && (
                        <div className="px-3 pt-1.5 text-xs tabular-nums text-muted">
                          {group.bookingNumber ??
                            `Booking ·${group.bookingId.slice(-6)}`}
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
                          onRemove={removeLines}
                          onEdit={setEditingIndex}
                          onPriceChange={onLinePrice}
                          /*
                            READ FROM THE GRANT, not passed down as a flag
                            somebody might forget to set: a price box drawn for
                            a cashier the server will refuse is a control that
                            exists to fail.
                          */
                          maySetPrice={can("posTransactions", "setPrice")}
                          benefitSlot={benefitFor(index)}
                          addonBenefitSlot={benefitFor}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              );
            });
          })().concat(
            tripLines(items).map((group) => (
              <div key={`trip-${group.key}`} data-trip-group>
                <div className="flex items-baseline justify-between gap-2 bg-surface px-3 py-1.5">
                  <span className="truncate text-xs font-medium text-foreground">
                    Perjalanan home grooming
                  </span>
                  {group.zoneName && (
                    <span className="shrink-0 text-xs text-muted">{group.zoneName}</span>
                  )}
                </div>
                {group.lines.map(({ item, index }) => (
                  <PosVisitFeeLine
                    key={`fee-${item.refId}-${index}`}
                    item={item}
                    index={index}
                    disabled={busy}
                    onEdit={setEditingIndex}
                    /* The trip's own line has a bin; an old-shape fee leaves with its booking. */
                    onRemove={item.homeTripId ? (at) => onRemove(at) : undefined}
                  />
                ))}
              </div>
            )),
          )
        )}

        {/*
          A TRIP STILL OWED (11 October 2026) — the bookings it serves are on
          this basket, but its fee is not: the cashier took the line off, or it
          could not come with the pull. Said out loud so it is not forgotten,
          with the one button that puts it back.
        */}
        {(cart?.owedTrips ?? []).map((trip) => (
          <div
            key={`owed-${trip.tripId}`}
            data-owed-trip
            className="mx-3 my-2 flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-2"
          >
            <House className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Biaya perjalanan belum ditagih
              </p>
              <p className="truncate text-xs text-muted">
                {trip.name} · {formatMoney(trip.amount)}
                {trip.petNames.length > 0 ? ` · untuk ${trip.petNames.join(", ")}` : ""}
              </p>
            </div>
            {onAddTrip && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => onAddTrip(trip.tripId)}
              >
                <Plus className="size-4" />
                Tambahkan
              </Button>
            )}
          </div>
        ))}
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
              and what membership cards paid for. The three always add up to
              `totals.itemDiscount`. The booking share is shown HERE ONLY, once
              for the whole basket (15 September 2026).

              "POTONGAN MEMBERSHIP" (Promosi V1) reads the server's
              `runningTotals.membershipDiscount` — visit-fee waivers included —
              falling back to the lines' own shares on an older server. Which
              line a card paid for is on that line now (its select), so the
              per-line list that used to sit under this row is gone.
            */}
            {(() => {
              const shares = sumDecimals((cart?.items ?? []).map(bookingShareOf));
              const membershipShares =
                totals.membershipDiscount ??
                sumDecimals(
                  (cart?.items ?? []).map((item) => membershipShareOf(item) ?? "0"),
                );
              const own = subtractDecimals(
                subtractDecimals(totals.itemDiscount, shares),
                membershipShares,
              );

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
                    <div className="flex justify-between">
                      <dt className="text-muted">Potongan membership</dt>
                      <dd className="tabular-nums text-success">
                        −{formatMoney(membershipShares)}
                      </dd>
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

      <PosLineDialog
        item={editingIndex === null ? null : (items[editingIndex] ?? null)}
        open={editingIndex !== null && items[editingIndex] !== undefined}
        busy={busy}
        maySetPrice={can("posTransactions", "setPrice")}
        onOpenChange={(open) => !open && setEditingIndex(null)}
        onSave={(details) =>
          editingIndex === null
            ? Promise.resolve(false)
            : onItemDetails(editingIndex, details)
        }
      />
    </aside>
  );
}
