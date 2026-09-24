"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  arahCardOf,
  choicesForLeg,
  LEG_LABEL,
} from "@/features/antar-jemput/ride";
import {
  pinOf,
  resolveLeg,
} from "@/features/antar-jemput/components/TripPointFields";
import {
  blankJourney,
  RideJourneyFields,
  type RideJourney,
} from "@/features/antar-jemput/components/RideJourneyFields";
import { PetFixLink, PetQuickAddDialog } from "@/features/pets";
import { useVariantQuote, VariantChoicePicker } from "@/features/services";
import { Checkbox } from "@/components/ui/checkbox";
import { usePetOptions } from "@/hooks/usePetOptions";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { formatMoney, toDecimalString, toMinor } from "@/utils/decimal";
import {
  AXIS_LABEL,
  isPetAxis,
  variantLabelForPet,
} from "@/utils/serviceVariant";
import type {
  Branch,
  Customer,
  Pet,
  PosCatalogAddon,
  PosCatalogItem,
  PosItemTripInput,
  VariantChoice,
} from "@/types/api";

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

/** The one `serviceKind` that is a journey. Mirrors RIDE_SERVICE_KIND on the server. */
const RIDE_KIND = "pickup-delivery";

/** What the dialog hands back when the tile was an antar-jemput one. */
export interface PosRidePick {
  trip: PosItemTripInput;
  linkedBookingIds: string[];
  /** Every animal in the van — a ride carries several off ONE line. */
  passengerPetIds: string[];
}

/** Whether a service's price depends on anything beyond the animal. */
const pricedBeyondPet = (
  service: PosCatalogItem | PosCatalogAddon | null | undefined,
) =>
  Boolean(service?.hasVariants) &&
  (service?.variantAxes ?? []).some((axis) => !isPetAxis(axis));

/**
 * Which animal a service tapped in the grid is for (FR-3).
 *
 * WHY THE GRID NEEDS THIS AT ALL. A service sold straight off the catalogue used
 * to go into the basket as a loose line: no animal, no booking, no history. The
 * shop could sell fifty groomings in a month and answer "how many groomings did
 * we do" with nothing. The bridge's shortcut recorded all of that — but only if
 * the cashier went looking for it, and the grid is where the hand lands first.
 *
 * ONE ANIMAL, ONE TAP. This is not the bridge's matrix: the service is already
 * chosen, so the only question left is whose. A cashier ringing up two dogs taps
 * the tile twice, which is what they would do for two bags of feed.
 *
 * IT ASKS ONLY WHAT IT NEEDS. The owner is settled before this opens — pets
 * belong to a customer, so a basket with nobody on it cannot answer the question
 * at all. The till picks the customer first and then opens this.
 *
 * CREATING A PET IS PART OF THE FLOW, not a detour. Somebody walking in with an
 * animal the shop has never seen is the ordinary case for a walk-in grooming,
 * and sending them to Master Data to register a dog while the customer waits is
 * how a shortcut stops being one.
 */
export function PosServicePetDialog({
  service,
  customerId,
  customerName,
  branchId,
  cartBookingIds = [],
  busy = false,
  onPick,
  onOpenChange,
}: {
  /** The tile the cashier tapped, or null when nothing is pending. */
  service: PosCatalogItem | null;
  customerId: string;
  customerName?: string;
  /**
   * The bookings THIS basket is already carrying — its own drafts and anything
   * pulled from the diary.
   *
   * Used for one thing: marking those rows in "Tautkan ke booking". A grooming
   * added to this basket a moment ago appears there as "Draf · Bruno · …",
   * which is true and says nothing — a cashier cannot tell it from any other
   * unnumbered booking of that customer's, and it is the one they most often
   * mean.
   */
  cartBookingIds?: readonly string[];
  /**
   * The till's branch — where a service priced by Zona is measured FROM. The
   * server measures from the same one (the session's branch), so the preview
   * and the charge agree.
   */
  branchId?: string | null;
  /** True while the cart write this dialog started is still in flight. */
  busy?: boolean;
  /**
   * The animal, and the add-ons the cashier ticked for it.
   *
   * A LIST, because "Extra Handling" and "Parfum" are two charges on one bath —
   * the till adds them as their own lines, and the server nests them under the
   * service they were sold with.
   */
  onPick: (
    pet: Pet,
    addonServiceIds: string[],
    /**
     * The "Dipilih staf" values the service and its ticked add-ons are priced
     * on — only the cards they declare. Empty for an ordinary grooming.
     */
    variantChoices: VariantChoice[],
    /**
     * THE JOURNEY, on an antar-jemput tile (24 September 2026) — which way the
     * van goes, the two doors, and the bookings it is fetching for. Null on
     * every other service.
     */
    ride: PosRidePick | null,
  ) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [pets, setPets] = useState<Pet[]>([]);
  /**
   * THE ANIMALS THIS LINE IS FOR — one for nearly every service, SEVERAL for a
   * ride (24 September 2026, on request).
   *
   * A van collects three dogs in one trip and is charged once, so the picker
   * below toggles on an antar-jemput tile and replaces on everything else: two
   * dogs having a bath are two lines, two dogs in a van are one.
   */
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingPet, setAddingPet] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [addons, setAddons] = useState<Set<string>>(new Set());
  const [choices, setChoices] = useState<VariantChoice[]>([]);
  /**
   * The two registers a journey's ends may be copied from — the till's branch
   * and the basket's customer, in full rather than as bare pins.
   *
   * IT WAS TWO PINS until 24 September 2026, which was all a zone needs. A
   * cashier typing a journey needs the ADDRESSES too: "Alamat pelanggan" is an
   * option on both ends, and an option that cannot show what it would fill in
   * is one nobody dares pick.
   */
  const [places, setPlaces] = useState<{
    branch: Branch | null;
    customer: Customer | null;
  } | null>(null);
  /* The journey, on an antar-jemput tile — direction, two doors, links. */
  const [journey, setJourney] = useState<RideJourney>(() => blankJourney());
  const { label: petOptionLabel } = usePetOptions();

  const open = service !== null;
  /* The one animal a service is priced for. A ride has no single one — it is
     quoted by where it goes — so this is only its first passenger, used for the
     gates that ask "has the cashier answered yet". */
  const chosen = pets.find((candidate) => candidate._id === picked[0]) ?? null;
  const riders = pets.filter((pet) => picked.includes(pet._id));
  const offered = service?.addons ?? [];
  const ticked = offered.filter((addon) => addons.has(addon._id));

  /*
    ─── AN ANTAR-JEMPUT TILE ASKS TWO MORE QUESTIONS (24 September 2026) ─────

    WHICH WAY, and BETWEEN WHICH TWO DOORS. Neither was asked before: the
    direction was a "Dipilih staf" card like any other, which priced the line
    and told nobody where to drive, and the fare was measured from whatever pin
    the customer's record happened to hold. A van sold at the counter reached
    the Antar-Jemput board saying "Arah belum diisi", carrying nought animals.

    ONE LINE IS ONE DIRECTION, as one booking is (21 September 2026). A
    round trip is the tile tapped twice — which is what a cashier already does
    for two dogs, and what keeps this dialog from growing a second pair of
    addresses nobody can see at once.
  */
  const isRide = service?.serviceKind === RIDE_KIND;
  const leg = journey.leg;
  const linkIds = journey.linkedBookingIds;
  /** What the journey's two ends actually resolve to — a record, or what was typed. */
  const ends = resolveLeg(
    journey.points,
    places?.customer ?? null,
    places?.branch ?? null,
  );
  const originPin = pinOf(ends.origin);
  const destinationPin = pinOf(ends.destination);

  /*
    ─── PRICED BEYOND THE ANIMAL (17 September 2026) ─────────────────────────

    "Grooming Rumah" costs one thing in the shop and another at the customer's
    door, and a door three kilometres away costs more than one around the
    corner. The first is the cashier's to say — a "Dipilih staf" select — and
    the second is measured: a straight line from THIS till's branch to the pin
    on the customer's address, matched to a zone.

    THE PINS ARE ASKED FOR ONLY WHEN SOMETHING HERE VARIES BY ZONA. The basket
    carries the customer's name and phone and nothing else, and a bath priced
    by size has no use for a map.

    ⚠️ A RIDE IS MEASURED END TO END (24 September 2026). Its fare is a band of
    the distance THE VAN ACTUALLY DRIVES, and the cashier has just typed both
    ends of it — so the two points handed to the quote are the journey's own,
    not the branch and the customer's record. The server measures between the
    same two and is what the line stores.
  */
  const variantQuote = useVariantQuote(
    isRide
      ? { branchPin: originPin, customerPin: destinationPin }
      : {
          branchPin: places?.branch?.location,
          customerPin: places?.customer?.location,
        },
  );
  const zoneWanted = variantQuote.needsZone([service, ...offered]);
  const zoneShown = variantQuote.needsZone([service, ...ticked]);
  /*
    "ARAH" IS ANSWERED BY THE DIRECTION, NOT ASKED TWICE. It is an owner's
    variant option like any other (BO, 21 September 2026), so it carries the
    price — but a select beside a direction control asking the same question is
    two ways to disagree. Same rule as the diary's form; same helper.
  */
  const allCards = variantQuote.cardsFor([service, ...ticked]);
  const arah = isRide ? arahCardOf(service, allCards) : null;
  const cards = allCards.filter((card) => card.axisKey !== arah?.card.axisKey);
  /** The staff's choices with Arah filled in from the direction, for a ride. */
  const ridden = isRide ? choicesForLeg(service, allCards, leg, choices) : choices;
  /*
    STILL WORKING IT OUT — the cards, the zones or the two registers are in
    flight. Only a service that depends on them waits: an ordinary grooming
    must not be held up by a list it never reads.

    A RIDE NEVER WAITS ON A MISSING PIN, only on the read. Its ends are the
    cashier's to fill in, so "belum ada titik" is an instruction, not a delay.
  */
  const measuring =
    [service, ...offered].some(pricedBeyondPet) &&
    (variantQuote.loading || (zoneWanted && !isRide && places === null));

  /*
    ─── WHAT IT COSTS FOR THIS ANIMAL, BEFORE IT IS ADDED ────────────────────

    A service priced by size has no price of its own, so the tile draws an
    em-dash and the cashier could not find out what a grooming cost until it was
    already in the basket. The figure lands the moment an animal is chosen,
    because that is the moment the question has an answer.

    A PREVIEW, NOT THE CHARGE. The server re-resolves it from the same pet on
    every cart write and nothing here is ever sent as a price — see
    `utils/serviceVariant.ts`. What it buys is the cashier knowing before they
    tap, and a refusal that says WHICH fact is missing instead of a 400 after
    the fact.
  */
  /*
    ⚠️ A RIDE IS QUOTED WITHOUT THE ANIMAL. A van has no coat length: a journey
    is priced by where it goes and which way, and the passenger is on the line
    so the receipt can say whose dog was in it. The diary quotes a ride the same
    way, and so does the server — three screens, one number.
  */
  const quote = variantQuote.quote(service, isRide ? null : chosen, ridden);
  /*
    ONE RIDE IS PRICED BY THE BOOKINGS IT SERVES (23 September 2026) — one
    booking is one animal, so a `per_pet` fare is the catalogue's price once for
    every booking the van is fetching for. `per_visit` is once, however many
    ride. Mirrors `chargedRidersOf` on the server.
  */
  const perAnimal = isRide && service?.billingUnit === "per_pet";
  const chargedPets = Math.max(1, linkIds.length);
  const shownPrice = (() => {
    const unit = perAnimal && chargedPets > 1 ? toMinor(quote.price) : null;
    return unit === null ? quote.price : toDecimalString(unit * BigInt(chargedPets));
  })();
  /* What it is missing beyond the animal, in the server's own words. */
  const problem = service ? variantQuote.problemOf(service, quote) : null;
  /*
    THE TWO ENDS ARE NOT OPTIONAL, and the reason is not a schema: a fare is a
    band of distance, so an address with no point has no price at all. Said
    once, here, and shown where the missing end is.
  */
  const unpinned = isRide && (!originPin || !destinationPin);
  /*
    WHICH VARIANT THE FIGURE CAME FROM — "Kucing · Kecil · Bulu pendek".

    The number alone cannot be checked. A cashier looking at Rp 120.000 has no
    way to tell whether the till read the animal as small or as medium, and the
    first time that matters is when a customer disputes the bill. Naming the
    combination makes the price auditable at the counter, in the second it is
    cheap to catch.

    NULL ON A FLAT-PRICED SERVICE — there is no variant to name, and a caption
    under every ordinary grooming is noise.
  */
  const variantLabel = variantLabelForPet(service, chosen, petOptionLabel);
  const addonQuotes = offered.map((addon) => {
    const addonQuote = variantQuote.quote(addon, isRide ? null : chosen, ridden);
    return {
      addon,
      quote: addonQuote,
      problem: variantQuote.problemOf(addon, addonQuote),
    };
  });
  /*
    A TICKED ADD-ON NOBODY CAN PRICE HOLDS THE BUTTON. It can only be ticked
    unpriced when what it is missing is a "Dipilih staf" value — the select
    appears the moment it is ticked, which is the point of letting it be.
  */
  const unpricedAddonTicked = addonQuotes.some(
    ({ addon, quote: addonQuote }) =>
      !addonQuote.price && addons.has(addon._id),
  );
  /*
    A SWITCHED-OFF VARIANT IS NOT SELLABLE (13 September 2026). The resolver
    still hands its price back, but the till refuses a new line for it — so the
    main service and any ticked add-on on one hold the button, each with its
    own sentence rather than the "belum punya harga" one, which would send the
    cashier to add a variant that already exists.
  */
  const inactiveAddonTicked = addonQuotes.some(
    ({ addon, quote: addonQuote }) =>
      addonQuote.inactive && addons.has(addon._id),
  );

  useEffect(() => {
    if (!open) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setChoices([]);

    petService
      .list({ customerId, isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setPets(result.items);
        // One pet is the overwhelming case; pre-selecting it removes a tap from
        // every walk-in grooming — and from every one-dog van.
        setPicked(result.items.length === 1 ? [result.items[0]._id] : []);
      })
      .catch(() => {
        if (active) setError("Daftar hewan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, customerId, nonce]);

  /*
    THE TWO REGISTERS A JOURNEY IS MEASURED — AND COPIED — FROM: the till's
    branch and the basket's customer. A failure reads as "no address, no pin",
    which is what the cashier can act on; the server would refuse with the same
    sentence.

    READ FOR A RIDE WHATEVER IT IS PRICED BY (24 September 2026). A zone is only
    one of the two things these records answer now: "Alamat pelanggan" and
    "Alamat cabang" are offered on both ends of the journey, and an option that
    cannot show what it would fill in is one nobody dares pick.
  */
  useEffect(() => {
    if (!open || (!zoneWanted && !isRide)) return;

    let active = true;

    // Never the previous customer's address while this one's is in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaces(null);

    const readOf = <T,>(load: () => Promise<T>) =>
      Promise.resolve()
        .then(load)
        .then((found) => found ?? null)
        .catch(() => null);

    Promise.all([
      branchId
        ? readOf(() => branchService.getById(branchId))
        : Promise.resolve(null),
      readOf(() => customerService.getById(customerId)),
    ]).then(([branch, customer]) => {
      if (active) setPlaces({ branch, customer });
    });

    return () => {
      active = false;
    };
  }, [open, zoneWanted, isRide, branchId, customerId]);

  /*
    ─── THE FACT THEY JUST WENT AND FILLED IN ─────────────────────────────────

    `PetFixLink` sends the cashier to the animal's form in another tab, and the
    price here depends on exactly the field they went to fill in. Coming back to
    a dialog still saying "Lengkapi jenis bulu" — about a coat length they had
    just typed — reads as the till being broken, and the only way out was to
    close the dialog and start again.

    RE-ASKED WHEN THE TAB COMES BACK, which is the moment the answer may have
    changed and the only one worth spending a request on. Polling would ask all
    day for a fact that changes twice a year.

    QUIETLY. No spinner and no reset: the list is replaced under the cashier's
    feet, and the animal they had chosen stays chosen. Reusing the effect above
    would blank the selection every time they tabbed back — including on the
    ordinary visit where nothing was edited at all.

    A FAILURE IS SWALLOWED, deliberately. What is on screen is still the truth
    as of a moment ago; replacing it with "tidak bisa dimuat" because a
    background refresh failed would take a working dialog away from somebody who
    did not ask for one.
  */
  useEffect(() => {
    if (!open) return;

    let active = true;

    const refresh = () => {
      if (document.visibilityState !== "visible") return;

      petService
        .list({ customerId, isActive: true, limit: FETCH_LIMIT })
        .then((result) => {
          if (active) setPets(result.items);
        })
        .catch(() => {});
    };

    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [open, customerId]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPicked([]);
      setPets([]);
      setAddons(new Set());
      setChoices([]);
      setPlaces(null);
      setJourney(blankJourney());
    }
    onOpenChange(next);
  }

  /*
    ─── WHO THIS LINE IS FOR ──────────────────────────────────────────────────

    A RIDE TOGGLES, EVERYTHING ELSE REPLACES (24 September 2026, on request).
    Two dogs having a bath are two lines — the tile is tapped twice, and each
    bath is priced for its own animal. Two dogs in a van are ONE journey,
    charged once, so the van is a set.

    THE ADD-ON TICKS ARE CLEARED EITHER WAY. An add-on priced by size costs a
    different amount for the next dog, and a box left ticked across the change
    is a charge nobody re-read.
  */
  function pickPet(id: string) {
    setAddons(new Set());

    if (!isRide) {
      setPicked([id]);
      return;
    }

    /*
      A LINK THE PICKER CAN NO LONGER OFFER GOES WITH THE ANIMAL — taking Coco
      out of the van drops the bookings that were Coco's, and only those.
      `RideJourneyFields` does it, from the list it is holding.
    */
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((one) => one !== id) : [...prev, id],
    );
  }

  function toggleAddon(id: string) {
    setAddons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    if (!chosen) return;

    /* Only the cards the lines being added declare — a value picked for an
       add-on that was then unticked is not part of this sale. Arah is among
       them on a ride: it is a priced option like any other, answered from the
       direction rather than from a select. */
    const wanted = new Set(allCards.map((card) => card.axisKey));
    const end = (point: typeof ends.origin) => ({
      address: point.address,
      lat: point.lat as number,
      lng: point.lng as number,
    });

    onPick(
      chosen,
      [...addons],
      ridden.filter((choice) => wanted.has(choice.optionId)),
      isRide && originPin && destinationPin
        ? {
            trip: {
              leg,
              origin: end(ends.origin),
              destination: end(ends.destination),
            },
            /* Only what the switch is actually showing — a list left behind by
               a switch somebody turned off is not part of this sale. */
            linkedBookingIds: journey.linking ? linkIds : [],
            /* EVERY ANIMAL IN THE VAN, in the order they were ticked. The
               server snapshots each one's size against the ride. */
            passengerPetIds: picked,
          }
        : null,
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/*
          A RIDE'S DIALOG IS TALLER AND SCROLLS. It asks four things where a
          grooming asks one, and a modal that runs off the bottom of a laptop
          is one whose "Tambah ke keranjang" nobody can reach.
        */}
        <DialogContent
          className={
            isRide
              ? "max-h-[85vh] overflow-y-auto sm:max-w-lg"
              : "sm:max-w-md"
          }
        >
          <DialogHeader>
            <DialogTitle>
              {isRide ? "Hewan mana yang ikut?" : "Untuk hewan yang mana?"}
            </DialogTitle>
            <DialogDescription>
              {service?.name}
              {customerName ? ` · ${customerName}` : ""}
            </DialogDescription>
          </DialogHeader>

          {error && <Alert variant="error">{error}</Alert>}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
              <Spinner /> Memuat hewan…
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pets.length === 0 ? (
                /*
                  NOT AN ERROR. A customer registered without their animals is
                  ordinary — the quick-add asks for a name and nothing else — so
                  this reads as the next step rather than as something wrong.
                */
                <p className="text-sm text-muted">
                  {customerName ?? "Pelanggan ini"} belum punya hewan terdaftar.
                  Tambahkan dulu di bawah.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* A VAN TAKES SEVERAL, and nothing else does — said out loud,
                      because the buttons look the same either way and a cashier
                      who does not know they may tap twice will not. */}
                  {isRide && pets.length > 1 && (
                    <p className="text-xs text-muted">
                      Bisa pilih lebih dari satu — satu perjalanan bisa
                      mengangkut beberapa hewan sekaligus.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                  {pets.map((pet) => (
                    <Button
                      key={pet._id}
                      type="button"
                      size="sm"
                      className="h-11"
                      variant={picked.includes(pet._id) ? "default" : "secondary"}
                      aria-pressed={picked.includes(pet._id)}
                      disabled={busy}
                      onClick={() => pickPet(pet._id)}
                    >
                      {pet.name}
                    </Button>
                  ))}
                  </div>
                </div>
              )}

              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => setAddingPet(true)}
                >
                  <Plus className="size-4" />
                  Tambah hewan
                </Button>
              </div>

              {/*
                THE PRICE, ONCE AN ANIMAL IS CHOSEN. Before that there is nothing
                to say: a service priced by size costs a different amount for
                every dog, and a figure shown before the question is answered
                would be one of them picked at random.
              */}
              {/*
                THE CASHIER'S QUESTIONS BEYOND THE ANIMAL — "Lokasi" — asked
                beside the price they decide, once there is an animal to price.
              */}
              {chosen && cards.length > 0 && (
                <VariantChoicePicker
                  cards={cards}
                  value={choices}
                  onChange={setChoices}
                  disabled={busy}
                />
              )}

              {/*
                WHICH WAY, BETWEEN WHICH TWO DOORS, AND FOR WHICH BOOKINGS —
                the three questions an antar-jemput line answers before it has a
                price. Shared with the invoice (`RideJourneyFields`), because a
                journey agreed at a counter and one agreed on a bill are one
                record and every rule inside is a decision somebody made once.
              */}
              {isRide && riders.length > 0 && (
                <RideJourneyFields
                  journey={journey}
                  onChange={setJourney}
                  customerId={customerId}
                  petIds={picked}
                  customer={places?.customer ?? null}
                  branch={places?.branch ?? null}
                  perAnimal={perAnimal}
                  alreadyHere={cartBookingIds}
                  alreadyHereLabel="Ada di keranjang ini."
                  disabled={busy}
                  idPrefix="pos-ride"
                />
              )}

              {chosen && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    {/* A JOURNEY IS NOT PRICED FOR AN ANIMAL. "Harga untuk
                        Bruno" over a fare measured between two doors would
                        name the one thing that did not decide the figure. */}
                    <span className="min-w-0 text-sm text-muted">
                      {isRide
                        ? `Tarif ${LEG_LABEL[leg].toLowerCase()}`
                        : `Harga untuk ${chosen.name}`}
                    </span>
                    <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">
                      {quote.inactive
                        ? "Varian nonaktif"
                        : shownPrice && !measuring && !unpinned
                          ? formatMoney(shownPrice)
                          : "—"}
                    </span>
                  </div>

                  {/* Under the name, not beside the figure: it explains WHICH
                      animal was read, which is what the name above is about. */}
                  {!isRide && variantLabel && (
                    <p className="mt-0.5 text-xs text-muted">{variantLabel}</p>
                  )}

                  {/* WHAT THE FARE WAS MULTIPLIED BY, when it was. Silent on a
                      `per_visit` service and on an untethered ride — there is
                      no arithmetic to explain. */}
                  {perAnimal && chargedPets > 1 && (
                    <p className="mt-0.5 text-xs text-muted">
                      {chargedPets} booking × {formatMoney(quote.price ?? "0")}
                    </p>
                  )}

                  {/* WHERE IT WAS MEASURED TO — "Zona A · 2,1 km". A failure
                      is said once, in the refusal below. */}
                  {zoneShown && !measuring && !unpinned && variantQuote.zone.ok && (
                    <p className="mt-0.5 text-xs text-muted">
                      {variantQuote.zoneText}
                    </p>
                  )}

                  {measuring && (
                    <p className="mt-1 text-xs text-muted">Menghitung harga…</p>
                  )}

                  {/* AN UNPINNED END IS SAID HERE TOO, not only under the field
                      it belongs to: this box is where the cashier is looking
                      when the figure fails to appear. */}
                  {unpinned && (
                    <p className="mt-1 text-xs text-warning">
                      Lengkapi titik lokasi asal dan tujuan dulu — tarifnya
                      dihitung dari jarak yang ditempuh.
                    </p>
                  )}

                  {/*
                    IT SAYS WHICH FACT IS MISSING, AND WHERE TO GO AND FIX IT.

                    "Belum ada harga" is a dead end. Naming the fact is better;
                    naming it and linking to the one form that holds it is the
                    step after. `PetFixLink` opens the animal in a NEW TAB — the
                    cashier is mid-basket, and navigating away to fill in a coat
                    length would throw that away.

                    The server refuses on the same grounds and in the same words,
                    so meeting it here is one round trip and one screen earlier.

                    A MISSING VARIANT IS NOT THE ANIMAL'S FAULT, so that branch
                    points at the catalogue instead — there is nothing on the pet
                    to fix.
                  */}
                  {quote.inactive && (
                    <p className="mt-1 text-xs text-warning">
                      Varian {service?.name} untuk {chosen.name} sedang nonaktif
                      — pilih layanan lain atau aktifkan variannya di katalog.
                    </p>
                  )}

                  {/* ⚠️ NOT WHILE AN END IS UNPINNED. Without the two pins the
                      zone cannot be measured, so the quote fails with "zona
                      tidak bisa ditentukan" — a sentence about a band of
                      distance, aimed at somebody who has simply not typed the
                      second address yet. The line above says the useful thing. */}
                  {!quote.price && !measuring && !unpinned && (
                    <p className="mt-1 text-xs text-warning">
                      {quote.missingAxis ? (
                        <>
                          Harganya ditentukan dari{" "}
                          {AXIS_LABEL[quote.missingAxis]}.{" "}
                          <PetFixLink pet={chosen} axis={quote.missingAxis} />
                        </>
                      ) : (
                        (problem ??
                        (isRide
                          ? "Layanan ini belum punya tarif untuk perjalanan ini. Tambahkan variannya di katalog."
                          : "Layanan ini belum punya harga untuk hewan ini. Tambahkan variannya di katalog."))
                      )}
                    </p>
                  )}
                </div>
              )}

              {/*
                THE ADD-ONS THIS SERVICE OFFERS — asked here because this is the
                only moment the answer is cheap. An add-on tapped separately off
                the grid is a second trip through this dialog for something that
                is done to the bath in front of them.

                ONLY AFTER AN ANIMAL IS CHOSEN: an add-on may be priced by size
                too, so the figures beside these boxes have no meaning until
                there is a dog to price them for.
              */}
              {chosen && addonQuotes.length > 0 && (
                <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <legend className="px-1 text-xs font-medium text-muted">
                    Tambahan (opsional)
                  </legend>

                  {addonQuotes.map(
                    ({ addon, quote: addonQuote, problem: addonProblem }) => (
                      <div key={addon._id} className="flex flex-col gap-0.5">
                        <label className="flex cursor-pointer items-center gap-3">
                          <Checkbox
                            checked={addons.has(addon._id)}
                            /*
                              AN ADD-ON NOBODY CAN PRICE CANNOT BE TICKED. The
                              server would refuse the whole basket on it, and
                              the refusal would name a service the cashier did
                              not think they had added. Nor one on a
                              switched-off variant.

                              Two exceptions. A box already ticked stays
                              untickable, or the button would be held by a tick
                              nobody can undo. And a missing "Dipilih staf"
                              value does not lock it: ticking it is what brings
                              up the select that answers it.
                            */
                            disabled={
                              busy ||
                              measuring ||
                              (!addonQuote.price &&
                                !addonQuote.missingChoice &&
                                !addons.has(addon._id)) ||
                              (addonQuote.inactive && !addons.has(addon._id))
                            }
                            onCheckedChange={() => toggleAddon(addon._id)}
                          />
                          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                            <span className="truncate text-sm text-foreground">
                              {addon.name}
                            </span>
                            <span className="shrink-0 text-sm tabular-nums text-muted">
                              {addonQuote.inactive
                                ? "Varian nonaktif"
                                : addonQuote.price && !measuring
                                  ? `+ ${formatMoney(addonQuote.price)}`
                                  : "—"}
                            </span>
                          </span>
                        </label>
                        {/* Why an add-on has no figure — a missing value only
                            once it is ticked, since that is when its select
                            appears. */}
                        {!measuring &&
                          addonProblem &&
                          (addonQuote.missingZone || addons.has(addon._id)) && (
                            <p className="pl-7 text-xs text-warning">
                              {addonProblem}
                            </p>
                          )}
                      </div>
                    ),
                  )}
                </fieldset>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => handleOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              /*
                A SERVICE WITHOUT AN ANIMAL IS WHAT THIS DIALOG EXISTS TO STOP,
                so there is no way past it but choosing one or backing out.
              */
              /*
                AND NOT WITHOUT A PRICE. The server refuses a service it cannot
                price for this animal, so offering the button here would build a
                basket that fails at the write — with an error naming an axis
                nobody was asked about.
              */
              /*
                AND NOT WITHOUT BOTH ENDS OF THE JOURNEY (24 September 2026).
                A fare is a band of distance, so the server refuses a ride it
                cannot measure — and the refusal would arrive after the basket
                had been written.
              */
              disabled={
                busy ||
                picked.length === 0 ||
                !quote.price ||
                quote.inactive ||
                inactiveAddonTicked ||
                unpricedAddonTicked ||
                measuring ||
                unpinned
              }
              onClick={confirm}
            >
              {busy ? "Menambahkan…" : "Tambah ke keranjang"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Mounted only while open: it asks nothing until it is, and a permanently
        mounted dialog was how the customer quick-add lost its prefilled phone.
      */}
      {addingPet && (
        <PetQuickAddDialog
          customerId={customerId}
          customerName={customerName}
          open
          onOpenChange={setAddingPet}
          onCreated={(pet) => {
            setAddingPet(false);
            // Re-asked rather than spliced: the list is server-ordered, and a
            // local insert would be a second ordering rule to keep in step.
            setNonce((n) => n + 1);
            /* A van gains the new animal; anything else is about it alone. */
            setPicked((prev) => (isRide ? [...prev, pet._id] : [pet._id]));
          }}
        />
      )}
    </>
  );
}
