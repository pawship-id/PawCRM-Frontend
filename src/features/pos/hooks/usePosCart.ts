"use client";

import { useCallback, useState } from "react";

import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type {
  PosCatalogItem,
  PosItemInput,
  PosTransaction,
  UpdateCartInput,
} from "@/types/api";

/**
 * A discount the till is trying to apply and the server has refused pending
 * approval — FR-4's over-limit case.
 *
 * Held rather than thrown away, so the approval dialog can retry the exact same
 * patch with an `approvedBy` attached. Re-deriving the patch afterwards would be
 * a second chance to build it differently.
 */
export interface PendingApproval {
  patch: UpdateCartInput;
  message: string;
}

interface UsePosCartResult {
  cart: PosTransaction | null;
  busy: boolean;
  error: string | null;
  /** Set when the server refused a discount for lack of approval. */
  pendingApproval: PendingApproval | null;
  open: (cart: PosTransaction | null) => void;
  addItem: (tile: PosCatalogItem) => Promise<void>;
  setQty: (index: number, qty: string) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  setItemDiscount: (
    index: number,
    discount: UpdateCartInput["cartDiscount"],
  ) => Promise<void>;
  setCartDiscount: (discount: UpdateCartInput["cartDiscount"]) => Promise<void>;
  setCharges: (charges: PosTransaction["otherCharges"]) => Promise<void>;
  patch: (input: UpdateCartInput) => Promise<void>;
  /** Retry the refused patch with an approver attached. */
  approve: (approverUserId: string) => Promise<void>;
  dismissApproval: () => void;
  clear: () => void;
}

/**
 * The active basket.
 *
 * EVERY MUTATION SENDS THE WHOLE BASKET, because the server prices it that way:
 * a cart discount is measured against the post-item-discount subtotal, so
 * changing one line changes what every other figure means. This hook's job is to
 * turn "add this tile" into that whole-basket patch and hand back what came
 * back — it never computes a total itself.
 *
 * THE SERVER IS THE ONLY PRICER. Nothing here multiplies a quantity by a price.
 * A till that computed its own subtotal would eventually disagree with the
 * receipt, and the disagreement would surface as a customer being charged
 * something other than what the screen said.
 */
export function usePosCart(): UsePosCartResult {
  const [cart, setCart] = useState<PosTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);

  const open = useCallback((next: PosTransaction | null) => {
    setCart(next);
    setError(null);
    setPendingApproval(null);
  }, []);

  const clear = useCallback(() => {
    setCart(null);
    setError(null);
    setPendingApproval(null);
  }, []);

  const dismissApproval = useCallback(() => setPendingApproval(null), []);

  /**
   * Sends a patch, or ensures a cart exists first.
   *
   * A CART IS CREATED LAZILY, on the first item rather than when the screen
   * loads: opening the till would otherwise leave an empty row behind every time
   * somebody looked at the catalogue and walked away.
   */
  const send = useCallback(
    async (input: UpdateCartInput) => {
      setBusy(true);
      setError(null);

      try {
        const target = cart ?? (await posService.createCart({}));
        const updated = await posService.updateCart(target._id, input);
        setCart(updated);
        setPendingApproval(null);
      } catch (err) {
        /*
          A 409 ON A DISCOUNT IS NOT A FAILURE, it is a request for approval. The
          patch is kept so the dialog can retry the identical one with an
          approver — see PendingApproval.
        */
        if (
          err instanceof ApiError &&
          err.status === 409 &&
          (input.cartDiscount !== undefined || input.items !== undefined)
        ) {
          setPendingApproval({
            patch: input,
            message: err.reason ?? err.message,
          });
        } else {
          setError(
            err instanceof ApiError
              ? (err.reason ?? err.message)
              : "Terjadi kesalahan. Coba lagi.",
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [cart],
  );

  /** The current lines, as the API wants them sent back. */
  const itemsAsInput = useCallback(
    (): PosItemInput[] =>
      (cart?.items ?? []).map((item) => ({
        kind: item.kind,
        refId: item.refId,
        qty: item.qty,
        discount: item.discount
          ? {
              mode: item.discount.mode,
              value: item.discount.value,
              ...(item.discount.approvedBy
                ? { approvedBy: item.discount.approvedBy }
                : {}),
            }
          : null,
        bookingId: item.bookingId,
        petId: item.petId,
        petName: item.petName,
        groomerName: item.groomerName,
      })),
    [cart],
  );

  /**
   * Adds a tile, or bumps the quantity of a line already holding it.
   *
   * BUMPING RATHER THAN APPENDING is what the PRD's mockup describes and what a
   * cashier scanning the same item twice means. Two lines for one product would
   * each carry their own discount and each decrement stock separately.
   *
   * A SERVICE IS NEVER BUMPED: it is one line per animal per service (FR-3), so
   * a second tap is a second line — which the server will also force to qty 1.
   */
  const addItem = useCallback(
    async (tile: PosCatalogItem) => {
      const items = itemsAsInput();
      const existing =
        tile.kind === "product"
          ? items.findIndex(
              (item) => item.kind === "product" && item.refId === tile._id,
            )
          : -1;

      if (existing >= 0) {
        items[existing] = {
          ...items[existing],
          qty: String(Number(items[existing].qty ?? "1") + 1),
        };
      } else {
        items.push({ kind: tile.kind, refId: tile._id, qty: "1" });
      }

      await send({ items });
    },
    [itemsAsInput, send],
  );

  const setQty = useCallback(
    async (index: number, qty: string) => {
      const items = itemsAsInput();
      if (!items[index]) return;
      items[index] = { ...items[index], qty };
      await send({ items });
    },
    [itemsAsInput, send],
  );

  const removeItem = useCallback(
    async (index: number) => {
      const items = itemsAsInput().filter((_, i) => i !== index);
      await send({ items });
    },
    [itemsAsInput, send],
  );

  const setItemDiscount = useCallback(
    async (index: number, discount: UpdateCartInput["cartDiscount"]) => {
      const items = itemsAsInput();
      if (!items[index]) return;
      items[index] = { ...items[index], discount: discount ?? null };
      await send({ items });
    },
    [itemsAsInput, send],
  );

  const setCartDiscount = useCallback(
    async (discount: UpdateCartInput["cartDiscount"]) => {
      await send({ cartDiscount: discount ?? null });
    },
    [send],
  );

  const setCharges = useCallback(
    async (charges: PosTransaction["otherCharges"]) => {
      await send({ otherCharges: charges });
    },
    [send],
  );

  /**
   * Retries the refused patch with an approver attached.
   *
   * The SAME patch, not a rebuilt one: rebuilding it would be a second chance to
   * construct it differently, and the thing being approved is what was refused.
   */
  const approve = useCallback(
    async (approverUserId: string) => {
      if (!pendingApproval) return;

      const { patch: refused } = pendingApproval;
      const withApprover: UpdateCartInput = { ...refused };

      if (refused.cartDiscount) {
        withApprover.cartDiscount = {
          ...refused.cartDiscount,
          approvedBy: approverUserId,
        };
      }

      if (refused.items) {
        withApprover.items = refused.items.map((item) =>
          item.discount
            ? { ...item, discount: { ...item.discount, approvedBy: approverUserId } }
            : item,
        );
      }

      await send(withApprover);
    },
    [pendingApproval, send],
  );

  return {
    cart,
    busy,
    error,
    pendingApproval,
    open,
    addItem,
    setQty,
    removeItem,
    setItemDiscount,
    setCartDiscount,
    setCharges,
    patch: send,
    approve,
    dismissApproval,
    clear,
  };
}
