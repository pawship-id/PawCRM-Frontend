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
import { PetQuickAddDialog } from "@/features/pets";
import { Checkbox } from "@/components/ui/checkbox";
import { petService } from "@/services/pet.service";
import { formatMoney } from "@/utils/decimal";
import {
  AXIS_LABEL,
  priceForPet,
  variantLabelForPet,
} from "@/utils/serviceVariant";
import type { Pet, PosCatalogItem } from "@/types/api";

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

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
  busy = false,
  onPick,
  onOpenChange,
}: {
  /** The tile the cashier tapped, or null when nothing is pending. */
  service: PosCatalogItem | null;
  customerId: string;
  customerName?: string;
  /** True while the cart write this dialog started is still in flight. */
  busy?: boolean;
  /**
   * The animal, and the add-ons the cashier ticked for it.
   *
   * A LIST, because "Extra Handling" and "Parfum" are two charges on one bath —
   * the till adds them as their own lines, and the server nests them under the
   * service they were sold with.
   */
  onPick: (pet: Pet, addonServiceIds: string[]) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingPet, setAddingPet] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [addons, setAddons] = useState<Set<string>>(new Set());

  const open = service !== null;
  const chosen = pets.find((candidate) => candidate._id === petId) ?? null;
  const offered = service?.addons ?? [];

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
  const quote = priceForPet(service, chosen);
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
  const variantLabel = variantLabelForPet(service, chosen);
  const addonQuotes = offered.map((addon) => ({
    addon,
    quote: priceForPet(addon, chosen),
  }));

  useEffect(() => {
    if (!open) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

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

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPetId("");
      setPets([]);
      setAddons(new Set());
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
    if (chosen) onPick(chosen, [...addons]);
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
              {chosen && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-sm text-muted">
                      Harga untuk {chosen.name}
                    </span>
                    <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">
                      {quote.price ? formatMoney(quote.price) : "—"}
                    </span>
                  </div>

                  {/* Under the name, not beside the figure: it explains WHICH
                      animal was read, which is what the name above is about. */}
                  {variantLabel && (
                    <p className="mt-0.5 text-xs text-muted">{variantLabel}</p>
                  )}

                  {/*
                    IT SAYS WHICH FACT IS MISSING, and the cashier can go and
                    fill it in. "Belum ada harga" is a dead end; "Lengkapi ukuran
                    Cici dulu" is the next step. The server refuses on the same
                    grounds and in the same words, so meeting it here is one
                    round trip and one screen earlier.
                  */}
                  {!quote.price && (
                    <p className="mt-1 text-xs text-warning">
                      {quote.missingAxis
                        ? `Lengkapi ${AXIS_LABEL[quote.missingAxis]} ${chosen.name} dulu — harganya ditentukan dari situ.`
                        : "Layanan ini belum punya harga untuk hewan ini. Tambahkan variannya di katalog."}
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

                  {addonQuotes.map(({ addon, quote: addonQuote }) => (
                    <label
                      key={addon._id}
                      className="flex cursor-pointer items-center gap-3"
                    >
                      <Checkbox
                        checked={addons.has(addon._id)}
                        /*
                          AN ADD-ON NOBODY CAN PRICE CANNOT BE TICKED. The server
                          would refuse the whole basket on it, and the refusal
                          would name a service the cashier did not think they had
                          added.
                        */
                        disabled={busy || !addonQuote.price}
                        onCheckedChange={() => toggleAddon(addon._id)}
                      />
                      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-foreground">
                          {addon.name}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-muted">
                          {addonQuote.price
                            ? `+ ${formatMoney(addonQuote.price)}`
                            : "—"}
                        </span>
                      </span>
                    </label>
                  ))}
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
              disabled={busy || !petId || !quote.price}
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
