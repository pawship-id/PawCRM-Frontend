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
import { PetFixLink, PetQuickAddDialog } from "@/features/pets";
import { useVariantQuote, VariantChoicePicker } from "@/features/services";
import { Checkbox } from "@/components/ui/checkbox";
import { usePetOptions } from "@/hooks/usePetOptions";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { formatMoney } from "@/utils/decimal";
import {
  AXIS_LABEL,
  isPetAxis,
  variantLabelForPet,
} from "@/utils/serviceVariant";
import type {
  GeoLocation,
  Pet,
  PosCatalogAddon,
  PosCatalogItem,
  VariantChoice,
} from "@/types/api";

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

type Pin = Pick<GeoLocation, "lat" | "lng"> | null;

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
  busy = false,
  onPick,
  onOpenChange,
}: {
  /** The tile the cashier tapped, or null when nothing is pending. */
  service: PosCatalogItem | null;
  customerId: string;
  customerName?: string;
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
  ) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingPet, setAddingPet] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [addons, setAddons] = useState<Set<string>>(new Set());
  const [choices, setChoices] = useState<VariantChoice[]>([]);
  const [pins, setPins] = useState<{ branch: Pin; customer: Pin } | null>(null);
  const { label: petOptionLabel } = usePetOptions();

  const open = service !== null;
  const chosen = pets.find((candidate) => candidate._id === petId) ?? null;
  const offered = service?.addons ?? [];
  const ticked = offered.filter((addon) => addons.has(addon._id));

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
  */
  const variantQuote = useVariantQuote({
    branchPin: pins?.branch,
    customerPin: pins?.customer,
  });
  const zoneWanted = variantQuote.needsZone([service, ...offered]);
  const zoneShown = variantQuote.needsZone([service, ...ticked]);
  const cards = variantQuote.cardsFor([service, ...ticked]);
  /*
    STILL WORKING IT OUT — the cards, the zones or the two pins are in flight.
    Only a service that depends on them waits: an ordinary grooming must not be
    held up by a list it never reads.
  */
  const measuring =
    [service, ...offered].some(pricedBeyondPet) &&
    (variantQuote.loading || (zoneWanted && pins === null));

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
  const quote = variantQuote.quote(service, chosen, choices);
  /* What it is missing beyond the animal, in the server's own words. */
  const problem = service ? variantQuote.problemOf(service, quote) : null;
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
    const addonQuote = variantQuote.quote(addon, chosen, choices);
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
        // every walk-in grooming.
        setPetId(result.items.length === 1 ? result.items[0]._id : "");
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
    THE TWO PINS A ZONE IS MEASURED BETWEEN — the till's branch and the
    customer's address. A failure reads as "no pin", which is what the cashier
    can act on; the server would refuse with the same sentence.
  */
  useEffect(() => {
    if (!open || !zoneWanted) return;

    let active = true;

    // Never the previous customer's pin while this one's is in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPins(null);

    const pinOf = <T extends { location?: GeoLocation | null }>(
      load: () => Promise<T>,
    ) =>
      Promise.resolve()
        .then(load)
        .then((found) => found?.location ?? null)
        .catch(() => null);

    Promise.all([
      branchId
        ? pinOf(() => branchService.getById(branchId))
        : Promise.resolve(null),
      pinOf(() => customerService.getById(customerId)),
    ]).then(([branch, customer]) => {
      if (active) setPins({ branch, customer });
    });

    return () => {
      active = false;
    };
  }, [open, zoneWanted, branchId, customerId]);

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
      setPetId("");
      setPets([]);
      setAddons(new Set());
      setChoices([]);
      setPins(null);
    }
    onOpenChange(next);
  }

  /*
    THE TICKS ARE CLEARED WHEN THE ANIMAL CHANGES. An add-on priced by size costs
    a different amount for the next dog, and a box left ticked across the switch
    is a charge nobody re-read.
  */
  function pickPet(id: string) {
    setPetId(id);
    setAddons(new Set());
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
       add-on that was then unticked is not part of this sale. */
    const wanted = new Set(cards.map((card) => card.axisKey));
    onPick(
      chosen,
      [...addons],
      choices.filter((choice) => wanted.has(choice.optionId)),
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Untuk hewan yang mana?</DialogTitle>
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
                <div className="flex flex-wrap gap-2">
                  {pets.map((pet) => (
                    <Button
                      key={pet._id}
                      type="button"
                      size="sm"
                      className="h-11"
                      variant={petId === pet._id ? "default" : "secondary"}
                      aria-pressed={petId === pet._id}
                      disabled={busy}
                      onClick={() => pickPet(pet._id)}
                    >
                      {pet.name}
                    </Button>
                  ))}
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

              {chosen && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-sm text-muted">
                      Harga untuk {chosen.name}
                    </span>
                    <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">
                      {quote.inactive
                        ? "Varian nonaktif"
                        : quote.price && !measuring
                          ? formatMoney(quote.price)
                          : "—"}
                    </span>
                  </div>

                  {/* Under the name, not beside the figure: it explains WHICH
                      animal was read, which is what the name above is about. */}
                  {variantLabel && (
                    <p className="mt-0.5 text-xs text-muted">{variantLabel}</p>
                  )}

                  {/* WHERE IT WAS MEASURED TO — "Zona A · 2,1 km". A failure
                      is said once, in the refusal below. */}
                  {zoneShown && !measuring && variantQuote.zone.ok && (
                    <p className="mt-0.5 text-xs text-muted">
                      {variantQuote.zoneText}
                    </p>
                  )}

                  {measuring && (
                    <p className="mt-1 text-xs text-muted">Menghitung harga…</p>
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

                  {!quote.price && !measuring && (
                    <p className="mt-1 text-xs text-warning">
                      {quote.missingAxis ? (
                        <>
                          Harganya ditentukan dari{" "}
                          {AXIS_LABEL[quote.missingAxis]}.{" "}
                          <PetFixLink pet={chosen} axis={quote.missingAxis} />
                        </>
                      ) : (
                        (problem ??
                        "Layanan ini belum punya harga untuk hewan ini. Tambahkan variannya di katalog.")
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
              disabled={
                busy ||
                !petId ||
                !quote.price ||
                quote.inactive ||
                inactiveAddonTicked ||
                unpricedAddonTicked ||
                measuring
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
            setPetId(pet._id);
          }}
        />
      )}
    </>
  );
}
