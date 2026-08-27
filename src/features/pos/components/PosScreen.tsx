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
import { PosServicePetDialog } from "./PosServicePetDialog";
import { PosCloseShiftDialog } from "./PosCloseShiftDialog";
import { PosHeldCartsDialog } from "./PosHeldCartsDialog";
import { PosPaymentDialog } from "./PosPaymentDialog";
import { ReceiptDialog } from "./ReceiptDialog";
import { PosSettingsDialog } from "./PosSettingsDialog";
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

  const {
    shift,
    loading: shiftLoading,
    error: shiftError,
    refetch,
  } = usePosShift(branchChosen);
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  /**
   * A service tapped in the grid, waiting for the animal it is for (FR-3).
   *
   * WHY IT WAITS. A service sold straight off the catalogue used to go into the
   * basket as a loose line — no animal, no booking, no history — so a shop could
   * do fifty groomings in a month and have nothing to count. The bridge's
   * shortcut recorded all of that, but only if the cashier went looking for it,
   * and the grid is where the hand lands first.
   *
   * TWO QUESTIONS, IN ORDER. Pets belong to a customer, so a basket with nobody
   * on it cannot answer "which animal" at all: the customer is settled first,
   * then this opens.
   */
  const [pendingService, setPendingService] = useState<PosCatalogItem | null>(
    null,
  );
  /**
   * Whether the customer picker is closing because somebody was CHOSEN.
   *
   * Choosing fires the dialog's `onOpenChange` as well as `onSelect`, so the two
   * cases are indistinguishable from the close alone — and telling them apart is
   * the difference between "the tile goes on waiting for this customer" and "the
   * cashier backed out, drop it".
   */
  const customerChosen = useRef(false);

  const addTile = useCallback(
    (tile: PosCatalogItem) => {
      setNotice(null);

      /*
        A SERVICE ASKS WHOSE ANIMAL IT IS FOR before it goes in. A product does
        not — a bag of feed belongs to whoever is paying, and stopping to ask
        would be a dialog on every scan.
      */
      if (tile.kind === "service") {
        setPendingService(tile);

        // No customer yet: that question comes first, and the tile waits.
        if (!cart.cart?.customer) {
          customerChosen.current = false;
          setPickingCustomer(true);
        }

        return;
      }

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
      void cart
        .addItem(tile)
        .then(() => swalToast(`${tile.name} ditambahkan.`));
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
  /**
   * Why no parked basket may be opened right now, or null when one may (FR-6).
   *
   * PRD, and followed literally: "melanjutkan keranjang tersimpan diblokir bila
   * keranjang aktif saat ini belum kosong — kasir diminta menyimpan atau
   * menyelesaikan keranjang aktif dulu."
   *
   * A BASKET WITH ANYTHING IN IT BLOCKS. There is no narrower rule to write,
   * because a basket on this screen is never a parked one: resuming takes it OUT
   * of the list, and parking clears the screen. The two states cannot overlap.
   *
   * AN EARLIER VERSION PARKED IT AUTOMATICALLY instead of refusing. It lost
   * nothing either, but it did it silently — and a basket parked without the
   * cashier noticing is one that can be forgotten until the till is closed.
   */
  const resumeBlockedReason =
    (cart.cart?.items?.length ?? 0) > 0
      ? "Titipkan atau selesaikan dulu keranjang yang sedang dibuka."
      : null;

  /**
   * Picks a parked basket back up, and takes it OUT of the parked list (FR-6).
   *
   * IT UN-PARKS. An earlier version left it parked while it was being worked on,
   * to stop a cashier stranding basket A by switching to B. The block above now
   * prevents that outright — with anything on screen, no row can be opened at
   * all — so the safeguard is no longer needed and the PRD's plainer rule
   * applies: a resumed basket is the active basket, and the list holds what is
   * put aside.
   */
  async function resume(target: PosTransaction) {
    /*
      Checked here as well as in the dialog. The dialog greys the buttons out so
      nobody presses them; this is the rule itself, and it must not depend on a
      control having been drawn correctly.
    */
    if (resumeBlockedReason) {
      return;
    }

    cart.open(target);

    try {
      await posService.updateCart(target._id, { status: "active" });
    } catch {
      // The basket is already on screen and editable; a red banner for a
      // bookkeeping write would be worse than the row lingering in the list.
    }

    await loadHeld();
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
        onSettings={() => setSettingsOpen(true)}
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
          onNote={(note) => void cart.setNote(note)}
          onPickCustomer={() => {
            // Opened on its own, with no tile waiting behind it.
            customerChosen.current = false;
            setPickingCustomer(true);
          }}
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
              .map((item) => [
                String(item.refId),
                Math.floor(Number(item.qty)),
              ]),
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
        blockedReason={resumeBlockedReason}
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
        onOpenChange={(next) => {
          setPickingCustomer(next);

          /*
            A SERVICE WAITING FOR AN OWNER IS ABANDONED WITH THE DIALOG. The
            cashier tapped a grooming, was asked who it was for, and backed out —
            leaving it queued would pop the pet picker later, the next time a
            customer was chosen for some unrelated reason.

            ONLY ON A DISMISSAL. Choosing somebody fires this too, and there the
            tile is meant to go on waiting for them — which is why the flag
            exists rather than a bare `if (!next)`.
          */
          if (!next && !customerChosen.current) {
            setPendingService(null);
          }
        }}
        onSelect={(customer, warnings) => {
          customerChosen.current = true;
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
          onAdd={(choices) => {
            void (async () => {
              await cart.addServices(choices);

              /*
                NAMES THE ANIMALS, not just a count. "3 layanan ditambahkan" for
                a customer with two dogs leaves the cashier checking the basket
                to find out which dog got what.
              */
              const lines = choices.reduce(
                (sum, choice) => sum + choice.serviceIds.length,
                0,
              );
              const names = choices.map((choice) => choice.petName).join(", ");

              swalToast(`${lines} layanan untuk ${names} ditambahkan.`);
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

      {/*
        Which animal a grid service is for. Opens only once a customer is on the
        basket — see `addTile`, and `PosServicePetDialog` for why the order is
        not negotiable.
      */}
      <PosServicePetDialog
        service={cart.cart?.customer ? pendingService : null}
        customerId={cart.cart?.customer?._id ?? ""}
        customerName={cart.cart?.customer?.name}
        busy={cart.busy}
        onOpenChange={(next) => {
          if (!next) setPendingService(null);
        }}
        onPick={(pet) => {
          const tile = pendingService;
          if (!tile) return;

          setPendingService(null);

          void cart
            .addServices([{ petId: pet._id, serviceIds: [tile._id] }])
            .then(() =>
              swalToast(`${tile.name} untuk ${pet.name} ditambahkan.`),
            );
        }}
      />

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

      {/*
        Pengaturan Kasir (FR-8). Nothing in it reaches the server — it is what
        THIS browser remembers about the printer in front of it — so it needs no
        shift, no permission and no refetch when it closes.
      */}
      <PosSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
