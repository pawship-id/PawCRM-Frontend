"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type { PosCatalogItem, PosTransaction } from "@/types/api";

import { useAuth } from "@/features/auth";

import { usePosCart } from "../hooks/usePosCart";
import { usePosShift } from "../hooks/usePosShift";
import { PosApprovalDialog } from "./PosApprovalDialog";
import { PosBranchGate } from "./PosBranchGate";
import { PosCart } from "./PosCart";
import { PosCatalog } from "./PosCatalog";
import { PosCloseShiftDialog } from "./PosCloseShiftDialog";
import { PosHeldCartsDialog } from "./PosHeldCartsDialog";
import { PosShiftBar } from "./PosShiftBar";
import { PosShiftGate } from "./PosShiftGate";
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

  const [variantParent, setVariantParent] = useState<PosCatalogItem | null>(
    null,
  );
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldCarts, setHeldCarts] = useState<PosTransaction[]>([]);
  const [heldLoading, setHeldLoading] = useState(false);
  const [heldError, setHeldError] = useState<string | null>(null);
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
      void cart.addItem(tile);
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
          onHold={() => void hold()}
          /*
            Payment is Fase 7. The button stays where it belongs so the layout is
            the real one, and says plainly that it is not connected yet rather
            than failing silently when tapped.
          */
          onCheckout={() =>
            setNotice("Pembayaran belum aktif — menyusul di tahap berikutnya.")
          }
        />
      </div>

      <PosVariantDialog
        parent={variantParent}
        onPick={(variant) => {
          setVariantParent(null);
          addTile(variant);
        }}
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
