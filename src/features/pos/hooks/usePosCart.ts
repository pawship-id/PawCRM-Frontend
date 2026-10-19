"use client";

import { useCallback, useState } from "react";

import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type {
  PosCatalogItem,
  PosItemInput,
  PosItemTripInput,
  PosTransaction,
  UpdateCartInput,
  VariantChoice,
} from "@/types/api";

import { onlineTransport, type CartTransport } from "../offline/transport";
import { cartItemsAsInput } from "./cartInput";

export { cartItemsAsInput };

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
  /**
   * ⚠️ RESOLVES `false` WHEN THE SERVER REFUSED IT — as do `addServices` and
   * `addMembership`. Gate any "… ditambahkan" toast on it; the basket's banner
   * carries the reason. See `send`.
   */
  addItem: (tile: PosCatalogItem) => Promise<boolean>;
  /** Puts a trip's fee back on the basket — see `owedTrips` on the cart. */
  addTrip: (tripId: string) => Promise<boolean>;
  /** Several trips at once — the trips left behind a pull ticks (11 October 2026). */
  addTrips: (tripIds: string[]) => Promise<boolean>;
  /** Sells one membership package to one animal — see the implementation. */
  addMembership: (planId: string, petId: string) => Promise<boolean>;
  setQty: (index: number, qty: string) => Promise<void>;
  /** Type a price over the catalogue's; `null` puts the line back to it. */
  setLinePrice: (index: number, unitPrice: string | null) => Promise<void>;
  /**
   * Takes lines out of the basket — one, or a run of them in ONE write.
   *
   * A LIST, because an add-on has no bin of its own: it is taken off with the
   * service it hangs off, and both must go in the same request. Calling this
   * twice in a row would not do it — every mutation here sends the WHOLE basket,
   * so the second call would be built from a basket the first had not returned
   * yet, and would put the add-on straight back.
   */
  removeItem: (index: number | number[]) => Promise<void>;
  /** Apply or remove a membership benefit on one line — see the implementation. */
  setItemBenefit: (
    index: number,
    benefit: { membershipId: string; benefitId: string } | null,
  ) => Promise<void>;
  setItemDiscount: (
    index: number,
    discount: UpdateCartInput["cartDiscount"],
  ) => Promise<void>;
  /**
   * Everything the line dialog edits, in ONE write — discount, the lot and the
   * note. Three separate writes would each rebuild the basket from the one
   * before it had returned. Resolves `false` when the server refused it.
   */
  setLineDetails: (
    index: number,
    details: {
      discount: UpdateCartInput["cartDiscount"];
      /** A typed price, or `null` to reset it; absent leaves the price alone. */
      unitPrice?: string | null;
      /** Absent for a non-product. */
      qty?: string;
      lots: Array<{ batchId: string; qty: string }>;
      note: string | null;
    },
  ) => Promise<boolean>;
  setCartDiscount: (discount: UpdateCartInput["cartDiscount"]) => Promise<void>;
  setCharges: (charges: PosTransaction["otherCharges"]) => Promise<void>;
  /** The transaction's free-text note, or null to clear it (FR-5). */
  setNote: (note: string | null) => Promise<void>;
  /** Sync online on or off — share the basket with every till of the branch. */
  setSyncOnline: (syncOnline: boolean) => Promise<void>;
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
    choices: Array<{
      petId: string;
      serviceIds: string[];
      /**
       * The "Dipilih staf" values these services are priced on — "Lokasi: Di
       * Rumah" (17 September 2026). Sent on every line of the animal: the
       * server reads only the cards each service declares, and an add-on would
       * inherit the main line's anyway.
       */
      variantChoices?: VariantChoice[];
      /**
       * THE JOURNEY, on an antar-jemput service (24 September 2026).
       *
       * SENT ON EVERY LINE OF THE ANIMAL, like the choices: an add-on on a ride
       * rides on the main line's journey, and the server keys a line's draft
       * booking by the direction too — an add-on without one would hang off a
       * booking going the other way.
       */
      ride?: {
        trip: PosItemTripInput;
        linkedBookingIds: string[];
        passengerPetIds: string[];
      } | null;
    }>,
  ) => Promise<boolean>;
  pullBookings: (bookingIds: string[]) => Promise<void>;
  patch: (input: UpdateCartInput) => Promise<boolean>;
  /** Retry the refused patch with an approver attached. */
  approve: (approverUserId: string) => Promise<void>;
  dismissApproval: () => void;
  clear: () => void;
}


/**
 * What a refused cart write says to the cashier.
 *
 * A PRICE THE SERVER COULD NOT RESOLVE BEYOND THE PET (17 September 2026) —
 * "Pilih Lokasi untuk Grooming Rumah dulu", or "Koordinat alamat pelanggan
 * belum diisi — harga … ditentukan dari zona" — arrives as a 400 whose headline
 * is written for a developer and whose `details[0]` is written for the counter.
 * The detail is the sentence shown; everything else keeps the old rule.
 */
function cartWriteError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Terjadi kesalahan. Coba lagi.";

  const pricing = Array.isArray(err.details)
    ? err.details.find(
        (detail) =>
          detail.field === "variantChoices" ||
          (detail as { zoneReason?: string }).zoneReason !== undefined,
      )
    : undefined;

  if (pricing?.message) return pricing.message;

  return err.reason ?? err.message;
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
/**
 * WHERE THIS BASKET'S WRITES GO (POS offline mode, 19 October 2026) — see
 * `offline/transport.ts`.
 *
 * `pick` answers for the basket on screen: the server, or the device. A basket
 * that lives on the device stays there until it is paid, even when the
 * connection comes back mid-sale — it has no server copy to continue.
 *
 * `fallback`, when given, is where a write goes if the server could not be
 * reached: the basket is adopted onto the device and the cashier's tap lands
 * there instead of failing. Absent (no registered device, no snapshot), a lost
 * connection is reported as before.
 */
export interface CartTransportChoice {
  pick: (cart: PosTransaction | null) => CartTransport;
  fallback?: () => CartTransport | null;
}

const SERVER_ONLY: CartTransportChoice = { pick: () => onlineTransport };

export function usePosCart(
  transports: CartTransportChoice = SERVER_ONLY,
): UsePosCartResult {
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
   *
   * ─── IT ANSWERS WHETHER THE WRITE LANDED (30 September 2026) ───────────────
   *
   * It used to resolve the same way whether the server accepted the patch or
   * refused it — the failure went into `error` and the promise resolved — so
   * every `void cart.addItem(tile).then(() => swalToast("… ditambahkan"))` in
   * the till announced a success it had not checked. A cashier saw "Gratis
   * Grooming Lengkap (VIP) untuk Bruno ditambahkan" over a basket holding
   * nothing but the refusal that stopped it.
   *
   * REPORTED, NOT THROWN. The call sites are `void`-ed fire-and-forget patches;
   * making this reject would turn every refusal into an unhandled rejection.
   * `false` is the whole contract: the banner still carries the WHY.
   */
  const send = useCallback(
    async (input: UpdateCartInput): Promise<boolean> => {
      setBusy(true);
      setError(null);

      try {
        const transport = transports.pick(cart);
        let updated: PosTransaction;
        try {
          const target = cart ?? (await transport.createCart());
          updated = await transport.updateCart(target, input);
        } catch (err) {
          /*
            THE CONNECTION DROPPED UNDER THE CASHIER'S TAP. With somewhere to
            fall back to, the same patch is applied on the device — the basket
            on screen is adopted, so nothing rung up so far is lost.
          */
          const fallback =
            err instanceof ApiError && (err.isNetworkError || err.isTimeout)
              ? transports.fallback?.()
              : null;
          if (!fallback || fallback === transport) throw err;
          const target = cart ?? (await fallback.createCart());
          updated = await fallback.updateCart(target, input);
        }
        setCart(updated);
        setPendingApproval(null);
        return true;
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
          setError(cartWriteError(err));
        }

        /*
          A DISCOUNT AWAITING APPROVAL IS FALSE TOO. Nothing was written, and the
          caller's toast would be announcing a line the basket does not hold —
          the dialog is what carries this one forward.
        */
        return false;
      } finally {
        setBusy(false);
      }
    },
    [cart, transports],
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
    (): PosItemInput[] => cartItemsAsInput(cart),
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
        // The named lots no longer add up once the quantity moves — see `setQty`.
        const { lots, ...rest } = items[existing];
        void lots;
        items[existing] = {
          ...rest,
          qty: String(Number(items[existing].qty ?? "1") + 1),
        };
      } else {
        items.push({ kind: tile.kind, refId: tile._id, qty: "1" });
      }

      return send({ items });
    },
    [itemsAsInput, send],
  );

  /**
   * A HOME-GROOMING TRIP'S FEE, BACK ON THE BASKET (11 October 2026) — for a
   * trip whose line the cashier took off while its bookings stayed. The server
   * prices it from the trip and claims it; the id is all that is sent.
   */
  const addTrips = useCallback(
    async (tripIds: string[]) => {
      const items = itemsAsInput();
      const fresh = tripIds.filter((tripId) => !items.some((item) => item.homeTripId === tripId));
      if (fresh.length === 0) return true;
      /* `refId` is a placeholder the server replaces with the trip's own service. */
      items.push(
        ...fresh.map((tripId) => ({ kind: "service" as const, refId: tripId, homeTripId: tripId, qty: "1" })),
      );

      return send({ items });
    },
    [itemsAsInput, send],
  );

  const addTrip = useCallback((tripId: string) => addTrips([tripId]), [addTrips]);

  /**
   * A MEMBERSHIP PACKAGE, FOR ONE ANIMAL (30 September 2026).
   *
   * Its own path because it is its own `kind`. The till asks whose animal it is
   * with the SAME dialog a service uses, and that shared dialog is exactly how
   * this went wrong: `onPick` fed every answer to `addServices`, which stamps
   * `kind: "service"` on what it is given, so a package's id was looked up in
   * the service catalogue and came back "Service not found".
   *
   * `petId` IS THE POINT, not a detail. A card belongs to an animal; the server
   * refuses a package line without one, because there would be nobody to mint
   * the card for.
   */
  const addMembership = useCallback(
    async (planId: string, petId: string) => {
      const items = itemsAsInput();
      // One card per line — never bumped, never merged. Two cards is two lines.
      items.push({ kind: "membership", refId: planId, petId, qty: "1" });

      return send({ items });
    },
    [itemsAsInput, send],
  );

  const addServices = useCallback(
    async (
      choices: Array<{
        petId: string;
        serviceIds: string[];
        variantChoices?: VariantChoice[];
        ride?: {
          trip: PosItemTripInput;
          linkedBookingIds: string[];
          passengerPetIds: string[];
        } | null;
      }>,
    ) => {
      const lines: PosItemInput[] = choices.flatMap(
        ({ petId, serviceIds, variantChoices, ride }) =>
          // One line per animal per service (FR-3) — never bumped, never merged.
          serviceIds.map((refId) => ({
            kind: "service" as const,
            refId,
            /*
              ⚠️ A RIDE HAS NO `petId` — one van carries several animals, and
              they go in `passengerPetIds`, the same shape the booking it raises
              keeps them in. A ride PULLED from the diary has neither, and its
              animals are its booking's.
            */
            ...(ride ? { petId: null } : { petId }),
            qty: "1",
            ...(variantChoices?.length ? { variantChoices } : {}),
            ...(ride
              ? {
                  trip: ride.trip,
                  linkedBookingIds: ride.linkedBookingIds,
                  passengerPetIds: ride.passengerPetIds,
                }
              : {}),
          })),
      );

      if (lines.length === 0) return false;

      return send({ items: [...itemsAsInput(), ...lines] });
    },
    [itemsAsInput, send],
  );

  const setQty = useCallback(
    async (index: number, qty: string) => {
      const items = itemsAsInput();
      if (!items[index]) return;
      /*
        A STEPPED QUANTITY DROPS THE NAMED LOTS (8 October 2026). Their shares
        added up to the old quantity, and the server refuses a line whose lots
        no longer do — so the line goes back to FEFO, and the cashier names them
        again in the dialog, where the quantity and the lots sit side by side.
      */
      const { lots, ...rest } = items[index];
      void lots;
      items[index] = { ...rest, qty };
      await send({ items });
    },
    [itemsAsInput, send],
  );

  const removeItem = useCallback(
    async (index: number | number[]) => {
      const dropped = new Set(Array.isArray(index) ? index : [index]);
      const items = itemsAsInput().filter((_, i) => !dropped.has(i));
      await send({ items });
    },
    [itemsAsInput, send],
  );

  /**
   * Type a price over the catalogue's, or put the line back to it.
   *
   * `null` IS THE WAY BACK. Sending no `unitPrice` at all is what makes the
   * server re-read the catalogue, so "reset" is the absence of the field rather
   * than a second verb — and the cashier gets the shelf price of TODAY, which
   * is the only honest answer to "what should this cost".
   */
  const setLinePrice = useCallback(
    async (index: number, unitPrice: string | null) => {
      const items = itemsAsInput();
      if (!items[index]) return;

      /*
        REBUILT WITHOUT THE FIELD, rather than set to undefined: `itemsAsInput`
        adds `unitPrice` only for a line that already carries an override, and
        clearing one has to REMOVE it — an explicit `undefined` would serialise
        the key away anyway, but leaves a payload whose shape says "I meant to
        send this" to anyone reading it.
      */
      const next = { ...items[index] };
      delete next.unitPrice;
      if (unitPrice !== null) next.unitPrice = unitPrice;
      items[index] = next;

      await send({ items });
    },
    [itemsAsInput, send],
  );

  const setLineDetails = useCallback(
    async (
      index: number,
      details: {
        discount: UpdateCartInput["cartDiscount"];
        unitPrice?: string | null;
        qty?: string;
        lots: Array<{ batchId: string; qty: string }>;
        note: string | null;
      },
    ) => {
      const items = itemsAsInput();
      if (!items[index]) return false;

      // Rebuilt WITHOUT the old lots and note, so clearing one removes the key.
      const { lots, note, ...rest } = items[index];
      void lots;
      void note;

      // `undefined` leaves the price as `itemsAsInput` carried it; a string
      // types one; `null` drops the key so the catalogue prices the line again.
      if (details.unitPrice !== undefined) {
        delete rest.unitPrice;
        if (details.unitPrice !== null) rest.unitPrice = details.unitPrice;
      }

      items[index] = {
        ...rest,
        ...(details.qty ? { qty: details.qty } : {}),
        discount: details.discount ?? null,
        ...(details.lots.length > 0 ? { lots: details.lots } : {}),
        ...(details.note ? { note: details.note } : {}),
      };

      return send({ items });
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

  /**
   * Apply or remove a membership benefit on one line (29 September 2026).
   *
   * ─── IT SENDS A NAME, NOT A NUMBER ────────────────────────────────────────
   *
   * `{ membershipId, benefitId }` and nothing else. The server reads the card,
   * its frozen plan and the redemption ledger, and prices the benefit itself —
   * so a till that had been tampered with, or that was simply looking at a
   * stale quote, cannot decide what the shop gives away.
   *
   * ─── REBUILT WITHOUT THE FIELD WHEN REMOVED ───────────────────────────────
   *
   * The same discipline `setLinePrice` uses above: the server rebuilds every
   * line from this payload, so removing a benefit has to mean the key is
   * ABSENT, not present and null-ish.
   */
  const setItemBenefit = useCallback(
    async (
      index: number,
      benefit: { membershipId: string; benefitId: string } | null,
    ) => {
      const items = itemsAsInput();
      if (!items[index]) return;

      const next = { ...items[index] };
      delete next.benefit;
      if (benefit) next.benefit = benefit;
      items[index] = next;

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

  const setSyncOnline = useCallback(
    async (syncOnline: boolean) => {
      // Alone, like the note: one flag, no repricing.
      await send({ syncOnline });
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
    addTrip,
    addTrips,
    addServices,
    addMembership,
    setQty,
    setLinePrice,
    removeItem,
    setItemDiscount,
    setLineDetails,
    setItemBenefit,
    setCartDiscount,
    setCharges,
    setNote,
    setSyncOnline,
    setCustomer,
    pullBookings,
    patch: send,
    approve,
    dismissApproval,
    clear,
  };
}
