"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
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
  const [bridgeOpen, setBridgeOpen] = useState(false);
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

  async function hold() {
    if (!cart.cart) return;

    try {
      await posService.updateCart(cart.cart._id, { heldLabel: null });
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
          onClearCustomer={() => void cart.setCustomer(null)}
          /*
            FR-3. Renders nothing when the customer has no appointments today,
            which is most sales — see PosBookingBanner.
          */
          banner={
            <PosBookingBanner
              count={bridge.bookings.length}
              disabled={cart.busy}
              onOpen={() => setBridgeOpen(true)}
            />
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
        onResume={(target) => {
          cart.open(target);
          setHeldOpen(false);
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
          void cart.setCustomer(customer._id);

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
      {bridgeOpen && cart.cart?.customer && (
        <BookingBridgeDialog
          customerId={cart.cart.customer._id}
          customerName={cart.cart.customer.name}
          open
          onOpenChange={setBridgeOpen}
          onPull={(bookings) => {
            if (bookings.length === 0) return;

            void (async () => {
              await cart.pullBookings(bookings.map((booking) => booking._id));
              /*
                RE-ASKED, not filtered locally. The server decides what is still
                pullable, and a list trimmed here would disagree with it the
                moment somebody else rang one up at the second till.
              */
              bridge.refetch();
              swalToast(
                bookings.length === 1
                  ? `${bookings[0].bookingNumber} ditarik ke keranjang.`
                  : `${bookings.length} booking ditarik ke keranjang.`,
              );
            })();
          }}
        />
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
