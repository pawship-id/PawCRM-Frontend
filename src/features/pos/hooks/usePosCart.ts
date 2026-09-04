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
  /** The transaction's free-text note, or null to clear it (FR-5). */
  setNote: (note: string | null) => Promise<void>;
  /**
   * Attach a customer, or `null` to make the basket a walk-in again.
   *
   * `dropPetLines` also removes every line naming an animal — which the server
   * REQUIRES when the customer actually changes, because those lines belong to
   * the person leaving the basket. The till asks first; see PosScreen.
   */
  setCustomer: (
    customerId: string | null,
    options?: { dropPetLines?: boolean },
  ) => Promise<void>;
  /**
   * FR-3's bridge: drop a customer's bookings into the basket.
   *
   * NOT A PATCH, and it cannot be one. The server appends the lines, records
   * which bookings they came from, and marks those bookings as pulled — three
   * writes in one transaction. Sending the whole basket back the way every other
   * mutation here does would race with itself: a cashier who pulled twice would
   * rebuild the second request from a basket the first had not yet returned.
   */
  /**
   * Takes over a basket ONLY if the till is still empty.
   *
   * `open` would overwrite whatever is there; this cannot. The difference
   * matters on exactly one path — recovering a cart after a reload, where the
   * fetch is in flight while the cashier is free to tap a product. Guarding with
   * `if (!cart)` in the caller would read a value captured before the request
   * started; the updater form below reads the one React actually holds.
   */
  openIfEmpty: (next: PosTransaction) => void;
  /**
   * Adds services for one or more named animals (FR-3's shortcut).
   *
   * EVERY ANIMAL IN ONE PATCH. A customer with three dogs is one request, one
   * transaction and one refusal-or-success — not three chances for the third to
   * fail after the first two landed.
   *
   * ORDINARY CART LINES, not bookings. The drafts behind them are raised by the
   * cart write itself, so a line the cashier deletes leaves nothing behind.
   *
   * `petName` IS NOT SENT. The server resolves it from `petId` against the
   * basket's own customer; a name a client supplies is a label anybody could
   * forge onto somebody else's receipt.
   */
  addServices: (
    choices: Array<{ petId: string; serviceIds: string[] }>,
  ) => Promise<void>;
  pullBookings: (bookingIds: string[]) => Promise<void>;
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

  const openIfEmpty = useCallback((next: PosTransaction) => {
    setCart((current) => current ?? next);
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
          A DISCOUNT AWAITING APPROVAL IS NOT A FAILURE, it is a request. The
          patch is kept so the dialog can retry the identical one with an
          approver — see PendingApproval.

          RECOGNISED BY THE FIELD THE SERVER NAMES, not inferred from the status
          and the shape of the patch. The old test was "409 AND the patch touches
          cartDiscount or items" — and `items` is present on nearly every cart
          write, so it claimed almost any conflict. A duplicate-key error while
          raising a booking draft came back 409 on an items patch, matched, and
          put "Duplicate value for 'tenantId, bookingNumber'" inside a dialog
          headed "Diskon perlu persetujuan", on a basket with no discount on it.

          `approvedBy` is the field a caller has to fill in to get past this
          refusal, so naming it is both the marker and the truth.
        */
        if (
          err instanceof ApiError &&
          err.status === 409 &&
          err.details?.some((detail) => detail.field === "approvedBy")
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

  const pullBookings = useCallback(
    async (bookingIds: string[]) => {
      setBusy(true);
      setError(null);

      try {
        /*
          A CART MAY NOT EXIST YET — the same lazy creation `send` does. In
          practice the banner only appears once a customer is attached, which
          already created one; this is here so the path does not depend on that
          staying true.
        */
        const target = cart ?? (await posService.createCart({}));
        setCart(await posService.pullBookings(target._id, bookingIds));
      } catch (err) {
        setError(
          err instanceof ApiError
            ? (err.reason ?? err.message)
            : "Booking gagal ditarik. Coba lagi.",
        );
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

  const addServices = useCallback(
    async (choices: Array<{ petId: string; serviceIds: string[] }>) => {
      const lines = choices.flatMap(({ petId, serviceIds }) =>
        // One line per animal per service (FR-3) — never bumped, never merged.
        serviceIds.map((refId) => ({
          kind: "service" as const,
          refId,
          qty: "1",
          petId,
        })),
      );

      if (lines.length === 0) return;

      await send({ items: [...itemsAsInput(), ...lines] });
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

  /**
   * Who the basket belongs to (FR-2).
   *
   * SENT ON ITS OWN, unlike the item and discount patches which send the whole
   * basket. Nothing about the customer changes what anything costs, so there is
   * no other figure to keep in step — and sending the lines alongside it would
   * mean a mis-set customer could disturb the prices.
   *
   * IT CREATES A CART IF THERE IS NONE, which is deliberate: a cashier who names
   * the customer before scanning anything is doing the ordinary thing for a
   * piutang, and making them scan first to unlock it would be backwards.
   */
  /**
   * Attaches, replaces or clears the basket's customer (FR-2).
   *
   * `dropPetLines` DROPS EVERY LINE THAT NAMES AN ANIMAL, in the same patch.
   * Moving a basket from Ibu Rina to Pak Budi leaves Bruno's grooming on it
   * otherwise — a line naming somebody else's dog, a draft booking behind it
   * naming somebody else, and a receipt that bills the wrong person for both.
   * The server refuses that outright; this is how the till complies, once the
   * cashier has said to.
   *
   * THE LINES GO IN THE SAME REQUEST as the customer, not in a second one. Two
   * patches would leave a window where the basket is somebody else's with the
   * old lines still on it — and if the second failed, that window would be
   * permanent.
   */
  const setNote = useCallback(
    async (note: string | null) => {
      // Alone, like the customer: sending the whole basket to change one field
      // would reprice every line and re-run every approval rule to store a
      // sentence.
      await send({ note });
    },
    [send],
  );

  const setCustomer = useCallback(
    async (customerId: string | null, { dropPetLines = false } = {}) => {
      await send(
        dropPetLines
          ? {
              customerId,
              items: itemsAsInput().filter((item) => !item.petId),
            }
          : { customerId },
      );
    },
    [itemsAsInput, send],
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
            ? {
                ...item,
                discount: { ...item.discount, approvedBy: approverUserId },
              }
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
    openIfEmpty,
    addItem,
    addServices,
    setQty,
    removeItem,
    setItemDiscount,
    setCartDiscount,
    setCharges,
    setNote,
    setCustomer,
    pullBookings,
    patch: send,
    approve,
    dismissApproval,
    clear,
  };
}
