"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, ConfirmDialog, Spinner } from "@/components";
import { posService } from "@/services/pos.service";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import type { PosCatalogItem, PosTransaction } from "@/types/api";

import { useAuth } from "@/features/auth";
import { CustomerSearchDialog } from "@/features/customers";
import { BookingBridgeDialog, useBookingBridge } from "@/features/booking";

import { usePosCart } from "../hooks/usePosCart";
import { usePosShift } from "../hooks/usePosShift";
import { PosApprovalDialog } from "./PosApprovalDialog";
import { PosBranchGate } from "./PosBranchGate";
import { PosBookingActions } from "./PosBookingActions";
import { PosBookingBanner } from "./PosBookingBanner";
import { PosCart } from "./PosCart";
import { PosCatalog } from "./PosCatalog";
import { PosCloseShiftDialog } from "./PosCloseShiftDialog";
import { PosHeldCartsDialog } from "./PosHeldCartsDialog";
import { PosPaymentDialog } from "./PosPaymentDialog";
import { ReceiptDialog } from "./ReceiptDialog";
import { PosShiftBar } from "./PosShiftBar";
import { PosShiftGate } from "./PosShiftGate";
import { ReturnDialog } from "./ReturnDialog";
import { TodayTransactionsDialog } from "./TodayTransactionsDialog";
import { VoidTransactionDialog } from "./VoidTransactionDialog";
import { PosVariantDialog } from "./PosVariantDialog";
import { PosXReportDialog } from "./PosXReportDialog";

/**
 * The till.
 *
 * TWO GATES, IN ORDER: the branch, then the shift. A user who reaches every
 * branch signs in pointed at none of them, and `posShifts.branchId` is the sole
 * authority for which shop a sale is booked to — so there is nothing to load,
 * and nothing safe to guess, until that is answered.
 *
 * THE SHIFT IS A GATE, NOT A BANNER: with no open shift this renders the Buka
 * Kasir form and nothing else. A catalogue behind a warning would let a cashier
 * build a basket that cannot be paid for, and discover it at the till with a
 * customer waiting.
 *
 * LEFT IS WHAT YOU CAN SELL, RIGHT IS WHAT YOU HAVE SOLD, which is the layout
 * every till in the reference set uses and the one a cashier already knows. The
 * basket keeps its width on narrow screens rather than collapsing under the
 * grid: what has been rung up matters more than what could be.
 */
export function PosScreen() {
  const { session } = useAuth();
  const branchChosen = Boolean(session?.currentBranchId);

  const { shift, loading: shiftLoading, error: shiftError, refetch } =
    usePosShift(branchChosen);
  const cart = usePosCart();
  /*
    FR-3. Asks nothing until a customer is attached — the banner only exists once
    somebody has been chosen, and a till showing the catalogue to a walk-in must
    not be querying appointments on every render.
  */
  const bridge = useBookingBridge(cart.cart?.customer?._id ?? null);
  // Pulled out so the effect below can depend on the stable callback rather
  // than on the hook's result object, which is new on every render.
  const { refetch: refetchBridge } = bridge;

  /**
   * Which appointments the basket is holding, as one comparable string.
   *
   * SORTED, so the order the lines happen to sit in never reads as a change.
   */
  const claimedBookings = (cart.cart?.items ?? [])
    .map((item) => item.bookingId)
    .filter(Boolean)
    .sort()
    .join(",");

  const lastClaimed = useRef<string | null>(null);

  /**
   * Re-asks the bridge whenever the basket's grip on an appointment changes.
   *
   * THE BANNER COUNTS WHAT IS STILL PULLABLE, and that number moves in BOTH
   * directions: pulling one takes it off the list, and taking the line back out
   * releases the claim and puts it back. Only the first was ever re-asked, so a
   * cashier who pulled one of two and then removed it saw "1 booking" for a
   * customer who had two — and no way to get at the one they had just released.
   *
   * DERIVED FROM THE BASKET RATHER THAN CALLED FROM EACH PLACE. Removing a line,
   * swapping the customer, resuming a parked basket and recovering one after a
   * reload all change this — and a `refetch()` sprinkled at four call sites is
   * four chances to miss the fifth.
   *
   * NOT ON THE FIRST RUN. The hook has just fetched for this customer; a second
   * request for the same answer is a round trip that changes nothing.
   */
  useEffect(() => {
    if (
      lastClaimed.current !== null &&
      lastClaimed.current !== claimedBookings
    ) {
      refetchBridge();
    }

    lastClaimed.current = claimedBookings;
  }, [claimedBookings, refetchBridge]);

  const [variantParent, setVariantParent] = useState<PosCatalogItem | null>(
    null,
  );
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldCarts, setHeldCarts] = useState<PosTransaction[]>([]);
  const [heldLoading, setHeldLoading] = useState(false);
  const [heldError, setHeldError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  /**
   * Which half of the Booking Bridge to open on, or null while it is closed.
   *
   * ONE PIECE OF STATE FOR BOTH QUESTIONS — "is it open" and "on which tab" —
   * because they are never independent: closing it forgets the tab, and opening
   * it always has an intent behind it.
   */
  const [bridgeTab, setBridgeTab] = useState<"pull" | "adhoc" | null>(null);
  /**
   * A customer change the cashier has not agreed to the cost of yet.
   *
   * Moving a basket to somebody else invalidates every line that names an
   * animal: the line is for the OLD customer's pet, and so is the draft booking
   * behind it. The server refuses the move outright, so this is where the
   * decision is put to the person who can see the basket.
   *
   * `null` means nothing is pending — the ordinary case, where the basket holds
   * no pet-bound line and the change goes straight through.
   */
  const [customerSwap, setCustomerSwap] = useState<{
    customerId: string | null;
    name: string;
    lines: number;
  } | null>(null);
  const [todayOpen, setTodayOpen] = useState(false);
  const [voiding, setVoiding] = useState<PosTransaction | null>(null);
  const [returning, setReturning] = useState<PosTransaction | null>(null);
  const [todayKey, setTodayKey] = useState(0);
  const [xReportFor, setXReportFor] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadHeld = useCallback(async () => {
    setHeldLoading(true);
    setHeldError(null);

    try {
      setHeldCarts(await posService.heldCarts());
    } catch {
      setHeldError("Keranjang tersimpan gagal dimuat. Coba lagi.");
    } finally {
      setHeldLoading(false);
    }
  }, []);

  // The count on the shift bar has to be right before anybody opens the dialog,
  // so the list is fetched once the till is up rather than on first open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (shift) void loadHeld();
  }, [shift, loadHeld]);

  /**
   * Picks the basket back up after a reload.
   *
   * THE CART LIVES ON THE SERVER and the till holds only a reference, so a
   * refreshed browser — or a laptop that went to sleep — used to leave it
   * stranded: invisible in Keranjang Tersimpan, which now lists only what was
   * PARKED, and the next line the cashier added would quietly open a second
   * basket beside the first.
   *
   * ONCE PER SHIFT, and it never overwrites. `openIfEmpty` is what makes the
   * second part true: the request is in flight while the cashier is free to tap
   * a product, and a basket they started in the meantime is their own work —
   * replacing it with what the server remembered would be this recovery causing
   * exactly the loss it exists to prevent.
   */
  useEffect(() => {
    if (!shift) return;

    let active = true;

    posService
      .activeCart()
      .then((found) => {
        if (active && found) cart.openIfEmpty(found);
      })
      .catch(() => {
        // Silent. A basket that cannot be recovered is not an error worth a red
        // banner on a till that is otherwise working — the cashier rings it up
        // again, which is what they would do anyway.
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift]);

  const addTile = useCallback(
    (tile: PosCatalogItem) => {
      setNotice(null);

      /*
        A TOAST ON EVERY ADD, from the grid as well as from the variant picker.

        The picker needed one most — it stays open now, so a tap that changed
        only a small count on the row it was tapped from was easy to miss — but
        putting it here rather than in the picker means adding from a tile gets
        the same answer. Two different confirmations for one act is how a cashier
        learns to trust neither.

        `swalToast` lands top-right, which is deliberately NOT where the basket
        is: it confirms without covering the thing it is confirming.
      */
      void cart.addItem(tile).then(() => swalToast(`${tile.name} ditambahkan.`));
    },
    [cart],
  );

  /**
   * Parks the basket (FR-6).
   *
   * IT WRITES SOMETHING NOW, and until recently it did not. Every cart was born
   * `held`, so the parking had already happened implicitly on the first line —
   * this button only cleared the screen, and the basket a cashier was still
   * building sat in Keranjang Tersimpan beside ones they had genuinely put
   * aside. `status: "held"` is what makes the gesture mean what it says.
   */
  /**
   * How many lines would be lost by moving this basket to somebody else.
   *
   * ONLY LINES THAT NAME AN ANIMAL. A bag of feed belongs to whoever is paying;
   * a service sold without naming a pet does too. Only a grooming booked for
   * Bruno stops making sense when Bruno's owner leaves the basket.
   */
  function petLineCount(): number {
    return (cart.cart?.items ?? []).filter((item) => item.petId).length;
  }

  /**
   * Puts a customer on the basket, asking first when it would cost something.
   *
   * THE QUESTION IS ONLY ASKED WHEN THERE IS SOMETHING TO LOSE. A basket of
   * goods, or one with no customer yet, changes hands silently — a confirmation
   * for a change with no consequence is a dialog that teaches people to click
   * through dialogs.
   */
  function changeCustomer(customerId: string | null, name: string) {
    const lines = petLineCount();
    const changing =
      String(customerId ?? "") !== String(cart.cart?.customerId ?? "");

    if (lines === 0 || !changing) {
      void cart.setCustomer(customerId);
      return;
    }

    setCustomerSwap({ customerId, name, lines });
  }

  async function hold() {
    if (!cart.cart) return;

    try {
      await posService.updateCart(cart.cart._id, { status: "held" });
      cart.clear();
      await loadHeld();
      setNotice("Keranjang dititipkan.");
    } catch (err) {
      setNotice(
        err instanceof ApiError
          ? (err.reason ?? "Keranjang gagal dititipkan.")
          : "Keranjang gagal dititipkan.",
      );
    }
  }

  /**
   * Picks a parked basket back up.
   *
   * IT STAYS PARKED, and that is the whole rule. Resuming does not give up its
   * place in Keranjang Tersimpan — the basket leaves that list only when the
   * cashier presses the bin, when the last line comes out of it, or when it is
   * paid for. Un-parking on resume was the first thing tried here and it was
   * wrong: a cashier who resumed A, then went back to the list for B, would
   * leave A unparked, off the list, and unreachable.
   *
   * THE BASKET ON SCREEN IS PARKED FIRST, if it holds anything and is not
   * already parked. Switching away from a basket is the same act as putting it
   * aside — the only alternative is stranding it, which is the failure this
   * whole change exists to stop. A basket with nothing in it is not worth a row
   * in the list and is left alone.
   */
  async function resume(target: PosTransaction) {
    const current = cart.cart;
    const strandable =
      current &&
      current._id !== target._id &&
      current.status !== "held" &&
      (current.items?.length ?? 0) > 0;

    try {
      if (strandable) {
        await posService.updateCart(current._id, { status: "held" });
      }

      cart.open(target);
      await loadHeld();
    } catch {
      // The basket is already on screen and editable either way; a red banner
      // for a bookkeeping write would be worse than the inconsistency.
      cart.open(target);
    }
  }

  async function discardHeld(target: PosTransaction) {
    try {
      await posService.discardCart(target._id);
      if (cart.cart?._id === target._id) cart.clear();
      await loadHeld();
    } catch {
      setHeldError("Keranjang gagal dihapus. Coba lagi.");
    }
  }

  /*
    THE BRANCH COMES BEFORE THE SHIFT, and before the loading state — there is
    nothing to load until the session knows which shop this is. A user who
    reaches every branch signs in pointed at none, so this is the ordinary first
    screen for an owner, not an error path.
  */
  if (!branchChosen) {
    return <PosBranchGate />;
  }

  if (shiftLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
        <Spinner /> Memeriksa status kasir…
      </div>
    );
  }

  if (shiftError) {
    return <Alert variant="error">{shiftError}</Alert>;
  }

  if (!shift) {
    return <PosShiftGate onOpened={refetch} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PosShiftBar
        shift={shift}
        heldCount={heldCarts.length}
        onOpenHeld={() => setHeldOpen(true)}
        onOpenToday={() => setTodayOpen(true)}
        onXReport={() => setXReportFor(shift._id)}
        onCloseShift={() => setClosing(true)}
      />

      {notice && <Alert variant="info">{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <PosCatalog
          onAdd={addTile}
          onExpand={setVariantParent}
          busy={cart.busy}
        />

        <PosCart
          cart={cart.cart}
          busy={cart.busy}
          error={cart.error}
          onQtyChange={(index, qty) => void cart.setQty(index, qty)}
          onRemove={(index) => void cart.removeItem(index)}
          onItemDiscount={(index, discount) =>
            void cart.setItemDiscount(index, discount)
          }
          onCartDiscount={(discount) => void cart.setCartDiscount(discount)}
          onCharges={(charges) => void cart.setCharges(charges)}
          onPickCustomer={() => setPickingCustomer(true)}
          onClearCustomer={() => changeCustomer(null, "pembeli yang lewat")}
          /*
            FR-3's two ways in. Nothing at all until a customer is on the basket:
            the bridge lists ONE customer's appointments and ONE customer's pets,
            so without somebody chosen there is nothing for it to open onto.

            THE BANNER IS THE ALERT, THE BUTTON IS THE ENTRY. The banner draws
            nothing when there is no appointment today — which is most sales —
            and the button is always there, because a walk-in with no booking is
            exactly who the shortcut was built for.
          */
          bookingSlot={
            cart.cart?.customer ? (
              <>
                <PosBookingBanner
                  count={bridge.bookings.length}
                  disabled={cart.busy}
                  onOpen={() => setBridgeTab("pull")}
                />
                <PosBookingActions
                  disabled={cart.busy}
                  onOpen={() => setBridgeTab("adhoc")}
                />
              </>
            ) : null
          }
          onHold={() => void hold()}
          onCheckout={() => {
            setNotice(null);
            setPaying(true);
          }}
        />
      </div>

      <PosVariantDialog
        parent={variantParent}
        busy={cart.busy}
        /*
          Built from the basket on every render, so the counts in the picker and
          the lines in the cart can never disagree — they are one source read
          twice rather than two states kept in step.
        */
        inCart={
          new Map(
            (cart.cart?.items ?? [])
              .filter((item) => item.kind === "product")
              .map((item) => [String(item.refId), Math.floor(Number(item.qty))]),
          )
        }
        /*
          THE MODAL STAYS OPEN (FR-1). A customer buying two of a thing usually
          buys two DIFFERENT sizes of it, and closing after each pick made that
          ordinary case four taps longer than it needed to be.
        */
        onPick={addTile}
        onOpenChange={(open) => {
          if (!open) setVariantParent(null);
        }}
      />

      <PosHeldCartsDialog
        open={heldOpen}
        carts={heldCarts}
        loading={heldLoading}
        error={heldError}
        openCartId={cart.cart?._id ?? null}
        onResume={(target) => {
          setHeldOpen(false);
          void resume(target);
        }}
        onDiscard={(target) => void discardHeld(target)}
        onOpenChange={setHeldOpen}
      />

      <PosApprovalDialog
        open={cart.pendingApproval !== null}
        message={cart.pendingApproval?.message ?? ""}
        busy={cart.busy}
        onApprove={(approverUserId) => void cart.approve(approverUserId)}
        onCancel={cart.dismissApproval}
      />

      {/*
        Rendered only with a basket, so the dialog cannot open against nothing —
        which is also why `cart.cart` is safe to pass non-null below.
      */}
      {cart.cart && (
        <PosPaymentDialog
          cart={cart.cart}
          open={paying}
          onOpenChange={setPaying}
          onPaid={(sale) => {
            setPaying(false);
            /*
              THE BASKET IS CLEARED AND THE RECEIPT OPENS IN ONE STEP. The moment
              the customer is still standing there is the only moment a receipt
              is worth printing, and a till left holding a paid basket is one a
              cashier can accidentally ring up twice.
            */
            cart.clear();
            setReceiptFor(sale._id);
            void loadHeld();
          }}
        />
      )}

      <ReceiptDialog
        saleId={receiptFor}
        onOpenChange={(open) => {
          if (!open) setReceiptFor(null);
        }}
      />

      {/*
        ONE DIALOG, NOT TWO. `CustomerSearchDialog` hosts quick-add itself and
        carries the typed search term into it — a cashier who typed a phone
        number does not type it again. Mounting the two separately here would
        have rebuilt that seam badly.
      */}
      <CustomerSearchDialog
        open={pickingCustomer}
        onOpenChange={setPickingCustomer}
        onSelect={(customer, warnings) => {
          setPickingCustomer(false);
          changeCustomer(customer._id, customer.name);

          /*
            THE DUPLICATE-PHONE WARNING, surfaced (FR-2). The server produces it
            when a quick-add reuses a number, and this is the only place it can
            reach a person: the customer IS saved either way, so this is a
            "check this" rather than a failure — which is why it is a toast and
            not a blocking dialog.
          */
          warnings
            ?.filter((warning) => warning.message)
            .forEach((warning) => swalToast(warning.message, "error"));
        }}
      />

      {/*
        FR-3's bridge. Mounted ONLY while open and only with a customer: the
        modal asks for that customer's bookings the moment it mounts, and a
        permanently-mounted one would ask on every render of the till.
      */}
      {bridgeTab && cart.cart?.customer && (
        <BookingBridgeDialog
          customerId={cart.cart.customer._id}
          customerName={cart.cart.customer.name}
          open
          initialTab={bridgeTab}
          busy={cart.busy}
          onOpenChange={(next) => {
            if (!next) setBridgeTab(null);
          }}
          onAdd={({ petId, petName, serviceIds }) => {
            void (async () => {
              await cart.addServices(petId, serviceIds);
              swalToast(
                serviceIds.length === 1
                  ? `Layanan untuk ${petName} ditambahkan.`
                  : `${serviceIds.length} layanan untuk ${petName} ditambahkan.`,
              );
            })();
          }}
          onPull={(bookings) => {
            if (bookings.length === 0) return;

            void (async () => {
              await cart.pullBookings(bookings.map((booking) => booking._id));
              /*
                The bridge re-asks itself — see the effect on `claimedBookings`.
                It is the basket's grip on an appointment that decides the count,
                and that grip changes on more paths than this one.
              */
              swalToast(
                bookings.length === 1
                  ? `${bookings[0].bookingNumber} ditarik ke keranjang.`
                  : `${bookings.length} booking ditarik ke keranjang.`,
              );
            })();
          }}
        />
      )}

      {customerSwap && (
        <ConfirmDialog
          title="Ganti pelanggan?"
          confirmLabel="Ganti dan hapus layanannya"
          destructive
          busy={cart.busy}
          onCancel={() => setCustomerSwap(null)}
          onConfirm={() => {
            void cart.setCustomer(customerSwap.customerId, {
              dropPetLines: true,
            });
            setCustomerSwap(null);
          }}
        >
          {/*
            IT SAYS WHAT IS LOST, in the words of the thing being lost. "Ada
            perubahan yang belum disimpan" is the dialog nobody reads; "2 layanan
            untuk hewan pelanggan sebelumnya" is a sentence a cashier can check
            against the screen behind it.
          */}
          {customerSwap.lines} layanan di keranjang ini untuk hewan pelanggan
          sebelumnya, jadi tidak berlaku lagi kalau pelanggannya diganti jadi{" "}
          {customerSwap.name}. Layanan itu akan dihapus dari keranjang; produk
          dan biaya lain tetap.
        </ConfirmDialog>
      )}

      <TodayTransactionsDialog
        open={todayOpen}
        reloadKey={todayKey}
        onOpenChange={setTodayOpen}
        onReceipt={(sale) => setReceiptFor(sale._id)}
        onVoid={setVoiding}
        onReturn={setReturning}
      />

      <VoidTransactionDialog
        sale={voiding}
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
        onVoided={(sale) => {
          setVoiding(null);
          // The list is behind this dialog and now says the wrong thing.
          setTodayKey((key) => key + 1);
          setNotice(`${sale.transactionNumber} dibatalkan.`);
        }}
      />

      <ReturnDialog
        sale={returning}
        onOpenChange={(open) => {
          if (!open) setReturning(null);
        }}
        onReturned={(created) => {
          setReturning(null);
          setTodayKey((key) => key + 1);
          setNotice(
            `Retur ${created.returnNumber} diproses. Uangnya keluar dari laci ini.`,
          );
        }}
      />

      <PosXReportDialog
        shiftId={xReportFor}
        onOpenChange={(open) => {
          if (!open) setXReportFor(null);
        }}
      />

      <PosCloseShiftDialog
        shift={shift}
        open={closing}
        onClosed={() => {
          setClosing(false);
          cart.clear();
          refetch();
        }}
        onOpenChange={setClosing}
      />
    </div>
  );
}
