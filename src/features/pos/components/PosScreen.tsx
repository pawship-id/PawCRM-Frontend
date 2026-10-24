"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, ConfirmDialog, Spinner } from "@/components";
import { posService } from "@/services/pos.service";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import type {
  Pet,
  PosBenefitPick,
  PosCatalogItem,
  PosTransaction,
  VariantChoice,
} from "@/types/api";

import { useAuth } from "@/features/auth";
import { CustomerSearchDialog } from "@/features/customers";
import { BookingBridgeDialog, useBookingBridge } from "@/features/booking";
import { autoApplyChanges, lineKey, petPlans } from "../membershipCart";
import { useCustomerMemberships } from "@/features/memberships/hooks/useCustomerMemberships";
import { usePosCart } from "../hooks/usePosCart";
import { usePosMembershipQuote } from "../hooks/usePosMembershipQuote";
import { usePosShift } from "../hooks/usePosShift";
import { useShiftTotals } from "../hooks/useShiftTotals";
import { PosApprovalDialog } from "./PosApprovalDialog";
import { PosBranchGate } from "./PosBranchGate";
import { PosBookingActions } from "./PosBookingActions";
import { PosBookingBanner } from "./PosBookingBanner";
import { PosCart } from "./PosCart";
import { PosCatalog } from "./PosCatalog";
import { PosCustomerPerks } from "./PosCustomerPerks";
import { PosMembershipSaleDialog } from "./PosMembershipSaleDialog";
import { PosSaleEffects } from "./PosSaleEffects";
import { PosServicePetDialog, type PosRidePick } from "./PosServicePetDialog";
import { PosCloseShiftDialog } from "./PosCloseShiftDialog";
import { PosHeldCartsDialog } from "./PosHeldCartsDialog";
import { PosPaymentDialog } from "./PosPaymentDialog";
import { prefetchTillChannels } from "../hooks/tillChannels";
import { ReceiptDialog } from "./ReceiptDialog";
import { PosSettingsDialog } from "./PosSettingsDialog";
import { PosShiftBar } from "./PosShiftBar";
import { PosShiftGate } from "./PosShiftGate";
import { ReturnDialog } from "./ReturnDialog";
import { TodayTransactionsDialog } from "./TodayTransactionsDialog";
import { VoidTransactionDialog } from "./VoidTransactionDialog";
import { PosVariantDialog } from "./PosVariantDialog";
import { PosXReportDialog } from "./PosXReportDialog";
import { OfflineCustomerDialog } from "./OfflineCustomerDialog";
import { OfflineQueueDialog } from "./OfflineQueueDialog";
import { OfflineServiceDialog } from "./OfflineServiceDialog";
import { PosOfflineStatus } from "./PosOfflineStatus";
import { PosReviewLink } from "./PosReviewLink";
import { useOfflineTill } from "../offline/useOfflineTill";
import { isLocalId } from "../offline/ids";
import { payOnline, reservationOf } from "../offline/devicePay";
import { unsentFor } from "../offline/queue";
import { syncNow } from "../offline/sync";
import { isOfflineSaleId } from "../offline/tillApi";
import { registerSignOutGuard } from "@/lib/signOutGuards";

/** "Tanpa member" on nothing — one shared empty set, so it never re-quotes. */
const NO_KEYS: ReadonlySet<string> = new Set();

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
  const { session, user } = useAuth();
  const branchChosen = Boolean(session?.currentBranchId);

  /*
    POS OFFLINE MODE (19 October 2026): where this till is selling from right
    now — the server, or the device — and everything the device needs to sell
    alone. See `offline/useOfflineTill.ts`.
  */
  const till = useOfflineTill();
  const offline = till.selling === "offline";
  const { local: localTill } = till;

  const shiftWho = useMemo(
    () => (user ? { tenantId: user.tenantId, userId: user._id } : null),
    [user],
  );
  const {
    shift,
    loading: shiftLoading,
    error: shiftError,
    refetch,
  } = usePosShift(session?.currentBranchId ?? null, shiftWho);
  const cart = usePosCart(till.transports);
  /*
    FR-3. Asks nothing until a customer is attached — the banner only exists once
    somebody has been chosen, and a till showing the catalogue to a walk-in must
    not be querying appointments on every render.
  */
  const bridge = useBookingBridge(
    // Appointments live on the server; offline there is nothing to pull.
    offline ? null : (cart.cart?.customer?._id ?? null),
  );
  // Pulled out so the effect below can depend on the stable callback rather
  // than on the hook's result object, which is new on every render.
  const { refetch: refetchBridge } = bridge;

  /**
   * Which appointments the basket is holding, as one comparable string.
   *
   * SORTED, so the order the lines happen to sit in never reads as a change.
   */
  /* Trips too (11 October 2026): a trip left behind leaves the list once pulled. */
  const claimedBookings = (cart.cart?.items ?? [])
    .flatMap((item) => [item.bookingId, item.homeTripId])
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
  /** The sale just paid — what its receipt dialog lists as membership effects. */
  const [paidSale, setPaidSale] = useState<PosTransaction | null>(null);
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
  /*
    BUMPED WHENEVER THE DAY'S TAKINGS CHANGE — a sale settled, voided, or
    returned. Two things read it: the Transaksi Hari Ini list behind the dialog,
    and the shift bar's running figures (FR-9). One counter rather than two,
    because the two must never disagree about whether a sale happened.
  */
  const [salesVersion, setSalesVersion] = useState(0);
  const [xReportFor, setXReportFor] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  /*
    SET WHEN A SHIFT IS CLOSED, and it sends the screen back to the branch
    picker rather than straight to Buka Kasir. Tutup Kasir is the end of a
    stint, not a pause in one: the next person at this till is as likely to be
    somebody else, in another shop, as the same cashier starting a second
    shift — so the branch is asked again rather than inherited from whoever was
    standing here last. The session still names a branch, which is why this
    needs its own flag: `branchChosen` stays true across the close.
  */
  const [rechooseBranch, setRechooseBranch] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);

  /*
    A TILL HOLDING UNSENT SALES MUST NOT BE SIGNED OUT — they are this
    cashier's, and only this cashier's session may send them.
  */
  useEffect(() => {
    if (!user) return;
    return registerSignOutGuard(async () => {
      const unsent = await unsentFor(user._id);
      return unsent > 0
        ? `Masih ada ${unsent} transaksi offline yang belum terkirim. Tunggu sampai terkirim sebelum keluar.`
        : null;
    });
  }, [user]);

  /*
    FR-9's running figures. Read from the X-Report so the bar and Tutup Kasir
    cannot disagree — see `useShiftTotals`.
  */
  const shiftTotals = useShiftTotals(shift?._id ?? null, salesVersion);

  const loadHeld = useCallback(async () => {
    setHeldLoading(true);
    setHeldError(null);

    /* Baskets parked on the device are listed beside the server's (offline mode). */
    const parkedHere = localTill ? await localTill.listHeld().catch(() => []) : [];

    try {
      setHeldCarts([...parkedHere, ...(offline ? [] : await posService.heldCarts())]);
    } catch {
      setHeldCarts(parkedHere);
      if (parkedHere.length === 0) {
        setHeldError("Keranjang tersimpan gagal dimuat. Coba lagi.");
      }
    } finally {
      setHeldLoading(false);
    }
  }, [localTill, offline]);

  /*
    THE DEVICE'S COPY FOLLOWS THE SHIFT (offline mode): the stock it holds is
    the shift's warehouse, so a newly opened shift is re-read at once.
  */
  const { refreshSnapshot } = till;
  const tillOnline = !till.connectivity.offline;
  useEffect(() => {
    if (shift?._id && tillOnline) void refreshSnapshot();
  }, [shift?._id, tillOnline, refreshSnapshot]);

  // The payment dialog's channel list, fetched while the cashier is still
  // ringing items up so "Bayar" opens without a spinner (tillChannels.ts).
  useEffect(() => {
    prefetchTillChannels(shift?.branchId);
  }, [shift?.branchId]);

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

    void (async () => {
      /*
        A BASKET LEFT ON THE DEVICE COMES FIRST (offline mode): it is the one the
        cashier carried on with after the connection dropped, and the server's
        copy of it — if there is one — is what the sync will throw away.
      */
      const onDevice = localTill ? await localTill.findActive().catch(() => null) : null;
      if (active && onDevice) {
        cart.openIfEmpty(onDevice);
        return;
      }
      if (offline) return;

      // Silent. A basket that cannot be recovered is not an error worth a red
      // banner on a till that is otherwise working — the cashier rings it up
      // again, which is what they would do anyway.
      const found = await posService.activeCart().catch(() => null);
      if (active && found) cart.openIfEmpty(found);
    })();

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
   * A membership package tapped in the grid, waiting for its sell dialog
   * (Promosi V1). Same order as a service: the customer first — a package is
   * always sold to somebody.
   */
  const [pendingPackage, setPendingPackage] = useState<PosCatalogItem | null>(
    null,
  );

  /**
   * A grid service for one animal, into the basket — the service, then any
   * add-ons ticked with it, as `addServices` lines. Also what an add-on picked
   * alone does when it has no grooming to go on, or the cashier chose
   * "Booking baru".
   */
  function addPicked(
    tile: PosCatalogItem,
    pet: Pet,
    addonServiceIds: string[],
    variantChoices: VariantChoice[],
    ride: PosRidePick | null,
  ) {
    /*
      THE SERVICE FIRST, THEN ITS ADD-ONS — one patch, one line each.
      `addServices` already takes several per animal, so nothing here has
      to know that an add-on is a different kind of line: the server reads
      the catalogue and files each one under the service it hangs off.

      `ride` IS NULL ON EVERYTHING BUT ANTAR-JEMPUT — the journey the
      dialog just asked for, which becomes the booking's direction and its
      two addresses.
    */
    void cart
      .addServices([
        {
          petId: pet._id,
          serviceIds: [tile._id, ...addonServiceIds],
          variantChoices,
          ride,
        },
      ])
      .then((ok) => {
        /* Ditolak: keranjang sudah memasang alasannya, dan "ditambahkan"
           di atasnya hanya akan membantah panel itu. */
        if (!ok) return;

        /*
          NAMES THE ANIMAL, or COUNTS THEM on a van carrying several —
          "Antar-Jemput untuk Bruno" would name one of three dogs, picked
          by nothing but the order they were ticked in.
        */
        const riders = ride?.passengerPetIds.length ?? 0;
        const whose = riders > 1 ? `${riders} hewan` : pet.name;

        swalToast(
          addonServiceIds.length > 0
            ? `${tile.name} untuk ${whose} ditambahkan, dengan ${addonServiceIds.length} tambahan.`
            : `${tile.name} untuk ${whose} ditambahkan.`,
        );
      });
  }

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
      /*
        A MEMBERSHIP PACKAGE ASKS THE SAME QUESTION, for a stronger reason: a
        card belongs to an ANIMAL, and a package line that cannot say whose
        animal cannot mint a card at all. The server refuses one without a
        `petId`; asking here is what stops that refusal landing after the
        customer has already been told the total.

        THE SAME DIALOG as a service's, deliberately. It is the same question —
        "untuk hewan yang mana?" — and a second dialog asking it differently is
        a second thing for a cashier to learn.
      */
      if (tile.kind === "service" || tile.kind === "membership") {
        if (tile.kind === "membership" && offline) {
          swalToast(
            "Paket membership butuh koneksi internet — tunggu sampai kasir online lagi.",
            "error",
          );
          return;
        }

        if (tile.kind === "membership") setPendingPackage(tile);
        else setPendingService(tile);

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
        /* Hanya kalau memang masuk — lihat `send` di `usePosCart`. */
        .then((ok) => {
          if (ok) swalToast(`${tile.name} ditambahkan.`);
        });
    },
    [cart, offline],
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
    /* ⚠️ A RIDE'S LINE HAS NO `petId` (24 September 2026): one van carries
       several animals and they are in `passengerPetIds`. Counted by `petId`
       alone, a basket holding only vans said "0 layanan" and the cashier was
       told nothing would be lost — and then the server refused the swap. */
    return (cart.cart?.items ?? []).filter(
      (item) => item.petId || (item.passengerPetIds?.length ?? 0) > 0,
    ).length;
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

    /* A basket on the device is parked on the device (offline mode). */
    if (isLocalId(cart.cart._id)) {
      if (await cart.patch({ status: "held" })) {
        cart.clear();
        await loadHeld();
        setNotice("Keranjang disimpan di perangkat ini.");
      }
      return;
    }

    try {
      await posService.updateCart(cart.cart._id, { status: "held" });
      cart.clear();
      await loadHeld();
      setNotice("Keranjang disimpan.");
    } catch (err) {
      setNotice(
        err instanceof ApiError
          ? (err.reason ?? "Keranjang gagal disimpan.")
          : "Keranjang gagal disimpan.",
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
      ? "Simpan atau selesaikan dulu keranjang yang sedang dibuka."
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

    if (isLocalId(target._id)) {
      await localTill?.updateCart(target, { status: "active" }).catch(() => null);
      await loadHeld();
      return;
    }

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
      if (isLocalId(target._id)) await localTill?.discard(target._id);
      else await posService.discardCart(target._id);
      if (cart.cart?._id === target._id) cart.clear();
      await loadHeld();
    } catch {
      setHeldError("Keranjang gagal dihapus. Coba lagi.");
    }
  }

  /*
    ─── MEMBERSHIP IN THE BASKET (Promosi V1, contract §6.3) ─────────────────

    The quote is asked on every change to the basket; its `recommended` pick is
    APPLIED AUTOMATICALLY to every line nobody has chosen for, in one write.
    The cashier changes it per line from the line's select — a candidate, or
    "Tanpa member", which is remembered for that line (by what the line is, a
    cart line has no id) so the next quote does not put the pick straight back.

    THE SERVER PRICES EVERYTHING. A pick is ids; the line totals and "Potongan
    membership" are read back from the cart.
  */
  const cartId = cart.cart?._id ?? null;
  const [noBenefit, setNoBenefit] = useState<{
    cartId: string | null;
    keys: ReadonlySet<string>;
  }>({ cartId: null, keys: NO_KEYS });
  const noBenefitKeys = noBenefit.cartId === cartId ? noBenefit.keys : NO_KEYS;

  // Membership benefits are priced by the server; offline none are offered.
  const memberQuote = usePosMembershipQuote(offline ? null : cart.cart, noBenefitKeys);
  const autoTried = useRef("");
  const { setItemBenefits, setItemBenefit } = cart;
  const cartItems = cart.cart?.items;

  useEffect(() => {
    if (!memberQuote.quote || !memberQuote.digest || cart.busy) return;
    /* One try per basket state: a refused write leaves the basket — and so the
       digest — as it was, and must not be retried in a loop. */
    if (autoTried.current === memberQuote.digest) return;
    autoTried.current = memberQuote.digest;

    const changes = autoApplyChanges(cartItems ?? [], memberQuote.quote, noBenefitKeys);
    if (changes.length > 0) void setItemBenefits(changes);
  }, [memberQuote.quote, memberQuote.digest, cart.busy, cartItems, noBenefitKeys, setItemBenefits]);

  function chooseBenefit(index: number, pick: PosBenefitPick | null) {
    const items = cart.cart?.items ?? [];
    if (!items[index]) return;
    const key = lineKey(items, index);
    const next = new Set(noBenefitKeys);
    if (pick) next.delete(key);
    else next.add(key);
    setNoBenefit({ cartId, keys: next });
    void setItemBenefit(index, pick);
  }

  /* The customer's cards — chips under their name, plans on the pet headers. */
  const customerCards = useCustomerMemberships(
    offline ? null : (cart.cart?.customer?._id ?? null),
  );
  const plansByPet = useMemo(
    () =>
      petPlans(cart.cart?.items ?? [], [
        ...customerCards.map((card) => ({
          petId: card.petId,
          planName: card.plan?.name ?? null,
          status: card.status,
        })),
        ...(memberQuote.quote?.cards ?? [])
          .filter((card) => !card.virtual)
          .map((card) => ({ petId: card.petId, planName: card.planName, status: card.status })),
      ]),
    [cart.cart, customerCards, memberQuote.quote],
  );

  /*
    THE BRANCH COMES BEFORE THE SHIFT, and before the loading state — there is
    nothing to load until the session knows which shop this is. A user who
    reaches every branch signs in pointed at none, so this is the ordinary first
    screen for an owner, not an error path.
  */
  if (!branchChosen || rechooseBranch) {
    return <PosBranchGate onChosen={() => setRechooseBranch(false)} />;
  }

  if (shiftLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
        <Spinner /> Memeriksa status kasir…
      </div>
    );
  }

  if (shiftError) {
    return (
      <Alert variant="error">
        {till.connectivity.offline
          ? "Kasir sedang offline dan shift belum pernah terbaca di perangkat ini. Sambungkan internet sekali untuk membuka kasir."
          : shiftError}
      </Alert>
    );
  }

  if (!shift) {
    if (till.connectivity.offline) {
      return (
        <Alert variant="warning">
          Buka Kasir butuh koneksi internet. Setelah shift dibuka, kasir tetap
          bisa berjualan walaupun internet putus.
        </Alert>
      );
    }
    return <PosShiftGate onOpened={refetch} />;
  }


  return (
    <div className="flex flex-col gap-4">
      <PosShiftBar
        shift={shift}
        totals={shiftTotals}
        heldCount={heldCarts.length}
        onOpenHeld={() => setHeldOpen(true)}
        onOpenToday={() => setTodayOpen(true)}
        onXReport={() => setXReportFor(shift._id)}
        onSettings={() => setSettingsOpen(true)}
        onCloseShift={() => {
          /* Sales still on the device belong to this drawer — send them first. */
          void (async () => {
            const unsent = user ? await unsentFor(user._id, shift._id) : 0;
            if (unsent > 0) {
              setNotice(
                `Masih ada ${unsent} transaksi offline yang belum terkirim. Kirim dulu sebelum tutup kasir.`,
              );
              return;
            }
            setClosing(true);
          })();
        }}
        offline={offline}
        statusSlot={
          <>
          <PosReviewLink
            branchId={shift.branchId}
            refreshKey={till.state.lastSyncAt}
            offline={till.connectivity.offline}
          />
          <PosOfflineStatus
            selling={till.selling}
            connectionDown={till.connectivity.offline}
            pendingCount={till.state.pendingCount}
            reviewCount={till.state.reviewCount}
            syncing={till.state.syncing}
            onOpen={() => setQueueOpen(true)}
          />
          </>
        }
      />

      {offline && (
        <Alert variant="info">
          Mode offline — transaksi disimpan di perangkat ini dan dikirim
          otomatis saat koneksi kembali. Membership, piutang, booking,
          antar-jemput, void, dan retur menunggu online.
        </Alert>
      )}
      {!offline && till.connectivity.offline && (
        <Alert variant="warning">
          Koneksi terputus. Mode offline belum siap di perangkat ini:{" "}
          {till.unavailableReason}.
        </Alert>
      )}

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
          onLinePrice={(index, unitPrice) =>
            void cart.setLinePrice(index, unitPrice)
          }
          onRemove={(index) => void cart.removeItem(index)}
          onAddTrip={(tripId) => void cart.addTrip(tripId)}
          onItemDetails={(index, details) =>
            cart.setLineDetails(index, details)
          }
          onItemBenefit={offline ? undefined : chooseBenefit}
          memberQuote={offline ? null : memberQuote.quote}
          petPlans={plansByPet}
          customerPerks={<PosCustomerPerks cards={customerCards} />}
          onCartDiscount={(discount) => void cart.setCartDiscount(discount)}
          onCharges={(charges) => void cart.setCharges(charges)}
          onNote={(note) => void cart.setNote(note)}
          // Sharing a basket with other tills needs the server (offline mode).
          onSyncOnline={offline ? undefined : (on) => void cart.setSyncOnline(on)}
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
            !offline && cart.cart?.customer ? (
              <>
                <PosBookingBanner
                  count={bridge.bookings.length}
                  tripCount={bridge.trips.length}
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
          offline={offline || isLocalId(cart.cart._id)}
          /*
            WHO TAKES THE MONEY (offline mode): the device's queue for a basket
            that lives on the device; otherwise the server, numbered by this
            device when it is a registered till.
          */
          pay={(input) => {
            const target = cart.cart as PosTransaction;
            return localTill && (offline || isLocalId(target._id))
              ? localTill.pay(target, input)
              : payOnline(target, input);
          }}
          saveOffline={
            localTill && till.available && !isLocalId(cart.cart._id) && localTill.canAdopt(cart.cart)
              ? (input) =>
                  localTill.pay(cart.cart as PosTransaction, input, reservationOf(cart.cart!._id))
              : undefined
          }
          onPaid={(sale) => {
            setPaying(false);
            /*
              THE BASKET IS CLEARED AND THE RECEIPT OPENS IN ONE STEP. The moment
              the customer is still standing there is the only moment a receipt
              is worth printing, and a till left holding a paid basket is one a
              cashier can accidentally ring up twice.
            */
            cart.clear();
            setPaidSale(sale);
            setReceiptFor(sale._id);
            void loadHeld();
            // The shift bar and the day's list both just went stale (FR-9).
            setSalesVersion((version) => version + 1);
            // Sold on the device while the server is reachable: send it now.
            if (isOfflineSaleId(sale._id) && !till.connectivity.offline) void syncNow();
          }}
        />
      )}

      <ReceiptDialog
        saleId={receiptFor}
        onOpenChange={(open) => {
          if (!open) setReceiptFor(null);
        }}
        /* Only for the sale just paid — a reprint from the day's list has none. */
        effects={
          paidSale && paidSale._id === receiptFor ? (
            <PosSaleEffects sale={paidSale} />
          ) : undefined
        }
      />

      {/*
        ONE DIALOG, NOT TWO. `CustomerSearchDialog` hosts quick-add itself and
        carries the typed search term into it — a cashier who typed a phone
        number does not type it again. Mounting the two separately here would
        have rebuilt that seam badly.
      */}
      {offline ? (
        <OfflineCustomerDialog
          open={pickingCustomer}
          onOpenChange={(next) => {
            setPickingCustomer(next);
            if (!next && !customerChosen.current) setPendingService(null);
          }}
          onSelect={(customer) => {
            customerChosen.current = true;
            setPickingCustomer(false);
            changeCustomer(customer._id, customer.name);
          }}
        />
      ) : (
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
              setPendingPackage(null);
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
      )}

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
              if (!(await cart.addServices(choices))) return;

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
          onPull={(bookings, tripIds = []) => {
            if (bookings.length === 0 && tripIds.length === 0) return;

            void (async () => {
              /*
                A TRIP LEFT BEHIND IS ADDED AFTER THE PULL (11 October 2026) — on
                its own, as a line priced from the trip. Alone, it is the whole
                act.
              */
              if (bookings.length === 0) {
                await cart.addTrips(tripIds);
                swalToast(
                  tripIds.length === 1
                    ? "Biaya perjalanan ditarik ke keranjang."
                    : `${tripIds.length} biaya perjalanan ditarik ke keranjang.`,
                );
                return;
              }

              await cart.pullBookings(bookings.map((booking) => booking._id));
              if (tripIds.length > 0) await cart.addTrips(tripIds);
              /*
                The bridge re-asks itself — see the effect on `claimedBookings`.
                It is the basket's grip on an appointment that decides the count,
                and that grip changes on more paths than this one.
              */
              /*
                A DRAFT HAS NO NUMBER yet, and the toast read "null ditarik"
                for one. The animal names it instead — one booking is one
                animal.
              */
              swalToast(
                bookings.length === 1
                  ? `${bookings[0].bookingNumber ?? `Booking ${bookings[0].petName ?? "tanpa nomor"}`} ditarik ke keranjang.`
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
      {offline ? (
        <OfflineServiceDialog
          service={cart.cart?.customer ? pendingService : null}
          customerId={cart.cart?.customer?._id ?? ""}
          customerName={cart.cart?.customer?.name}
          busy={cart.busy}
          onOpenChange={(next) => {
            if (!next) setPendingService(null);
          }}
          onPick={(pet, addonServiceIds, variantChoices) => {
            const tile = pendingService;
            if (!tile) return;
            setPendingService(null);
            void cart
              .addServices([
                { petId: pet._id, serviceIds: [tile._id, ...addonServiceIds], variantChoices },
              ])
              .then((ok) => {
                if (ok) swalToast(`${tile.name} untuk ${pet.name} ditambahkan.`);
              });
          }}
        />
      ) : (
        <PosServicePetDialog
          service={cart.cart?.customer ? pendingService : null}
          customerId={cart.cart?.customer?._id ?? ""}
          customerName={cart.cart?.customer?.name}
          branchId={session?.currentBranchId ?? cart.cart?.branchId ?? null}
          cartBookingIds={cart.cart?.bookingIds ?? []}
          busy={cart.busy}
          basketId={cart.cart?._id ?? null}
          onOpenChange={(next) => {
            if (!next) setPendingService(null);
          }}
          onPick={(pet, addonServiceIds, variantChoices, ride, host) => {
            const tile = pendingService;
            if (!tile) return;
            setPendingService(null);

            /*
              AN ADD-ON PICKED ALONE, put on a grooming the cashier chose in the
              animal dialog (21 October 2026) — one in this basket, or one in the
              diary, which is pulled in first. `null` / `undefined`: a booking of
              its own, as before.
            */
            if (host) {
              void cart
                .attachAddon({
                  addonId: tile._id,
                  petId: pet._id,
                  variantChoices,
                  host,
                })
                .then((ok) => {
                  if (!ok) return;
                  swalToast(
                    `${tile.name} untuk ${pet.name} ditambahkan ke ${host.serviceName ?? "groomingnya"}.`,
                  );
                });
              return;
            }

            addPicked(tile, pet, addonServiceIds, variantChoices, ride);
          }}
        />
      )}

      {/*
        SELLING A PACKAGE (Promosi V1) — its own dialog: whose, from when, the
        referral code, and the server's eligibility per animal. Opens only once
        a customer is on the basket, like the service dialog above.
      */}
      <PosMembershipSaleDialog
        plan={cart.cart?.customer ? pendingPackage : null}
        customerId={cart.cart?.customer?._id ?? ""}
        customerName={cart.cart?.customer?.name}
        branchId={session?.currentBranchId ?? cart.cart?.branchId ?? null}
        cartItems={cart.cart?.items ?? []}
        busy={cart.busy}
        onOpenChange={(next) => {
          if (!next) setPendingPackage(null);
        }}
        onAdd={async (input, summary) => {
          const tile = pendingPackage;
          const result = await cart.addMembership(input);
          if (result.ok) {
            setPendingPackage(null);
            swalToast(
              `${tile?.name ?? "Paket"} untuk ${summary.holderName} ditambahkan${
                summary.startsNow ? " · jatah langsung berlaku di keranjang" : ""
              }.`,
            );
          }
          return result;
        }}
      />

      <TodayTransactionsDialog
        open={todayOpen}
        reloadKey={salesVersion + till.state.pendingCount}
        offline={offline}
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
          setSalesVersion((version) => version + 1);
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
          setSalesVersion((version) => version + 1);
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
          setRechooseBranch(true);
        }}
        onOpenChange={setClosing}
      />

      {/*
        Pengaturan Kasir (FR-8). Nothing in it reaches the server — it is what
        THIS browser remembers about the printer in front of it — so it needs no
        shift, no permission and no refetch when it closes.
      */}
      <PosSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} till={till} />

      <OfflineQueueDialog
        open={queueOpen}
        till={till}
        onOpenChange={setQueueOpen}
        onReceipt={(saleId) => {
          setQueueOpen(false);
          setReceiptFor(saleId);
        }}
      />
    </div>
  );
}
