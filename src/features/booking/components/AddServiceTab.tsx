"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { PetFixLink, PetQuickAddDialog } from "@/features/pets";
import { useVariantQuote, VariantChoicePicker } from "@/features/services";
import { usePetOptions } from "@/hooks/usePetOptions";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import { variantLabelForPet, variesByZone } from "@/utils/serviceVariant";
import type { GeoLocation, Pet, Service, VariantChoice } from "@/types/api";

import { choicesFor } from "../variantLine";

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

/** Shared empty set, so an untouched pet does not allocate one per render. */
const EMPTY: ReadonlySet<string> = new Set();
const NO_CHOICES: VariantChoice[] = [];

/** What one animal is having, as the till's cart takes it. */
export interface AddServiceChoice {
  petId: string;
  petName: string;
  serviceIds: string[];
  /**
   * The "Dipilih staf" values the services are priced on (17 September 2026) —
   * only the cards the ticked services declare; absent when none do. Each
   * service line carries them; an add-on inherits its main line's.
   */
  variantChoices?: VariantChoice[];
}

/**
 * FR-3's second tab: charge for a service with no appointment behind it.
 *
 * SEVERAL PETS IN ONE OPENING, which is FR-3's flow: "pilih hewan (bisa lebih
 * dari satu) → centang layanan yang diinginkan per hewan". The cashier picks an
 * animal, ticks its services, picks the next, and confirms once.
 *
 * THE OBJECTION TO A MATRIX WAS REAL AND IS NOW GONE. It used to be that this
 * tab created the bookings itself, so several pets meant several writes and a
 * third that could fail after two had landed. Since the bookings moved to the
 * cart write, the whole choice goes as ONE patch — priced, reconciled into
 * drafts and written in a single transaction. There is no partial state left to
 * design for.
 *
 * ONE ANIMAL IS IN FRONT OF THE CASHIER AT A TIME, and their ticks are kept per
 * animal. Stacking every pet's checklist at once would be a page of scrolling
 * for the ordinary customer, who has one dog; the pills carry a count and the
 * summary names what each animal is having, so nothing chosen is out of sight.
 *
 * IT WRITES NOTHING. The chosen pet and services go into the BASKET, and the
 * booking behind them is raised only when the sale is settled — FR-3's own
 * words: "membuat booking baru di backend berstatus Completed **setelah
 * pembayaran selesai**".
 *
 * THAT TIMING IS A RULE, and the first version broke it. It created the booking
 * the moment this button was pressed, so a line the cashier then deleted from
 * the basket left the booking standing: an appointment for a grooming nobody was
 * ever charged for, sitting in the day sheet with nothing to explain it. A
 * basket is a draft until it is paid for, and nothing it holds should outlive
 * being deleted from it.
 *
 * THE ATTRIBUTION SURVIVES ANYWAY. The cart line carries `petId`, so FR-3's
 * "atribusi ke hewan & layanan tetap tercatat untuk histori" is satisfied by the
 * booking the payment raises — with `origin: "pos_adhoc"`, so "how many of this
 * month's groomings were walk-ins" stays answerable.
 */
export function AddServiceTab({
  customerId,
  branchId,
  busy = false,
  onAdd,
}: {
  customerId: string;
  /**
   * The branch the zone is measured from. Omitted, the till's own — the
   * session's branch, which is exactly what a till stands in.
   */
  branchId?: string | null;
  /** True while the cart write this tab started is still in flight. */
  busy?: boolean;
  /**
   * Every animal the cashier ticked something for. Nothing is saved yet.
   *
   * A LIST, because one opening may cover a customer's whole household — and it
   * reaches the server as ONE cart patch, so either all of it lands or none does.
   */
  onAdd: (choices: AddServiceChoice[]) => void;
}) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [petId, setPetId] = useState("");
  /**
   * What each animal is having, keyed by pet.
   *
   * PER ANIMAL, not one shared set: the whole point of the matrix is that Cici's
   * grooming and Cilang's nail trim are different choices, and a single set
   * would apply the last one ticked to whichever pill happened to be active.
   */
  const [ticked, setTicked] = useState<Map<string, Set<string>>>(new Map());
  const [addingPet, setAddingPet] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [petsNonce, setPetsNonce] = useState(0);
  // Names the variant caption in the tenant's words.
  const { label: petOptionLabel } = usePetOptions();

  /*
    ─── PRICED BEYOND THE PET (17 September 2026) ─────────────────────────────

    A service priced by Zona is measured from the till's branch to the
    customer's pin; one priced by a "Dipilih staf" card waits on the cashier's
    answer, kept per animal. Both pins are best effort: without one the zone
    cannot be said, and the row says so rather than guessing.
  */
  const { session } = useAuth();
  const zoneBranchId = branchId ?? session?.currentBranchId ?? null;
  const [branchPin, setBranchPin] = useState<GeoLocation | null>(null);
  const [customerPin, setCustomerPin] = useState<GeoLocation | null>(null);
  const [choices, setChoices] = useState<Map<string, VariantChoice[]>>(new Map());
  const variant = useVariantQuote({ branchPin, customerPin });

  useEffect(() => {
    let active = true;

    Promise.resolve()
      .then(() => customerService.getById(customerId))
      .then((customer) => {
        if (active) setCustomerPin(customer?.location ?? null);
      })
      .catch(() => {
        if (active) setCustomerPin(null);
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  useEffect(() => {
    if (!zoneBranchId) return;

    let active = true;

    Promise.resolve()
      .then(() => branchService.getById(zoneBranchId))
      .then((branch) => {
        if (active) setBranchPin(branch?.location ?? null);
      })
      .catch(() => {
        if (active) setBranchPin(null);
      });

    return () => {
      active = false;
    };
  }, [zoneBranchId]);

  useEffect(() => {
    let active = true;

    Promise.all([
      petService.list({ customerId, isActive: true, limit: FETCH_LIMIT }),
      // Only what is still offered — the till cannot sell a retired service.
      serviceService.list({ isActive: true, limit: FETCH_LIMIT }),
    ])
      .then(([petPage, servicePage]) => {
        if (!active) return;
        setPets(petPage.items);
        /*
          ⚠️ ANTAR-JEMPUT IS NOT OFFERED HERE (24 September 2026).

          A journey needs a direction and two pinned addresses before it has a
          price at all, and this tab is a grid of tick-boxes with nowhere to put
          them — the server refuses such a line ("Pilih arah dan alamat … dulu")
          and the cashier could not act on the refusal from this dialog.

          The GRID TILE asks all three and is the way in. Hidden rather than
          shown-and-refused: a tick-box the server will reject is worse than one
          that is not there, which is the same rule the catalogue's add-on list
          follows.
        */
        setServices(
          servicePage.items.filter(
            (one) => one.serviceKind !== "pickup-delivery",
          ),
        );
        // One pet is the overwhelming case; pre-selecting it removes a click
        // from every walk-in.
        if (petPage.items.length === 1) {
          setPetId(petPage.items[0]._id);
        }
      })
      .catch(() => {
        if (!active) return;
        setLoadError("Daftar hewan dan layanan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId, petsNonce]);

  /** What the animal in front of the cashier right now is having. */
  const forActivePet = ticked.get(petId) ?? EMPTY;

  function toggle(serviceId: string) {
    if (!petId) {
      setFormError("Pilih hewannya dulu.");
      return;
    }

    setFormError(null);
    setTicked((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(petId) ?? []);

      if (set.has(serviceId)) set.delete(serviceId);
      else set.add(serviceId);

      /*
        An animal with nothing ticked leaves the map entirely, so "how many pets
        did the cashier choose for" is `ticked.size` and never has to filter out
        empty entries.
      */
      if (set.size === 0) next.delete(petId);
      else next.set(petId, set);

      return next;
    });
  }

  /**
   * Hands the choice back. NOTHING IS SAVED HERE — see the header.
   *
   * The pet's NAME goes with it only so the caller can name what it just added
   * in a toast; the server resolves it again from `petId` when it prices the
   * line, because a name a client sends is a label anybody could forge onto
   * somebody else's receipt.
   */
  function submit() {
    /* A ZONE NOBODY CAN MEASURE, OR A CARD NOBODY ANSWERED — the till would refuse it. */
    for (const [id, serviceIds] of ticked.entries()) {
      for (const serviceId of serviceIds) {
        const service = services.find((entry) => entry._id === serviceId);
        const problem = service ? variant.problemOf(service, priceFor(id, serviceId)) : null;
        if (problem) {
          const petName = pets.find((pet) => pet._id === id)?.name;
          setFormError(petName ? `${petName}: ${problem}.` : `${problem}.`);
          return;
        }
      }
    }

    const picked: AddServiceChoice[] = [...ticked.entries()]
      .map(([id, serviceIds]) => {
        const declared = [...serviceIds].flatMap((serviceId) =>
          choicesFor(
            services.find((service) => service._id === serviceId),
            choices.get(id) ?? NO_CHOICES,
          ),
        );
        /* One per card, however many ticked services declare it. */
        const variantChoices = [
          ...new Map(declared.map((choice) => [choice.optionId, choice])).values(),
        ];

        return {
          petId: id,
          petName: pets.find((pet) => pet._id === id)?.name ?? "",
          serviceIds: [...serviceIds],
          ...(variantChoices.length > 0 ? { variantChoices } : {}),
        };
      })
      /*
        A pet added and then removed from the list between ticking and confirming
        is not something to fail over — it is one entry dropped from a request
        that still has work in it.
      */
      .filter((choice) => choice.petName !== "");

    if (picked.length === 0) {
      setFormError("Centang dulu layanannya.");
      return;
    }

    onAdd(picked);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted">
        <Spinner /> Memuat hewan dan layanan…
      </div>
    );
  }

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  /**
   * What a service costs FOR ONE ANIMAL.
   *
   * ─── IT READ `service.price`, WHICH A VARIANT SERVICE DOES NOT HAVE ────────
   *
   * A service priced by size carries no price of its own — the axes it varies by
   * are the pet's own facts. So every row of one showed an em-dash, and
   * `Number(null ?? 0)` made the running total read Rp 0 with two groomings
   * ticked. The list was unusable for exactly the shop that prices by size.
   *
   * A PREVIEW, like everywhere else: the server re-resolves it from the same pet
   * when it prices the cart, and no figure here is ever sent.
   */
  function priceFor(petId: string, serviceId: string) {
    return variant.quote(
      services.find((service) => service._id === serviceId),
      pets.find((pet) => pet._id === petId),
      choices.get(petId) ?? NO_CHOICES,
    );
  }

  /*
    THE FIGURE THAT COUNTS TOWARDS THE BASKET — null on a switched-off variant
    (13 September 2026). Its price still comes back from the resolver, but the
    till refuses the line, so adding it to a total would quote a charge that can
    never be rung up.
  */
  const sellablePrice = (petId: string, serviceId: string) => {
    const quote = priceFor(petId, serviceId);
    return quote.inactive ? null : quote.price;
  };

  /**
   * Everything ticked, for every animal — what the basket is about to gain.
   *
   * SUMMED PER ANIMAL, because the same grooming costs a different amount for a
   * small dog and a large one; a total that priced the service once would be
   * wrong on every multi-pet visit this tab exists for.
   *
   * IN MINOR UNITS. These figures reached the screen as decimal strings so they
   * would never pass through a float; adding them back up with `Number` — which
   * is what this did — reintroduces the error in the one place somebody checks.
   */
  const total = sumDecimals(
    [...ticked.entries()].flatMap(([petId, set]) =>
      [...set].map((serviceId) => sellablePrice(petId, serviceId)),
    ),
  );

  /** The animal the list below is for, and what it is priced as. */
  const activePet = pets.find((pet) => pet._id === petId) ?? null;
  /* The "Dipilih staf" cards the active animal's ticked services declare. */
  const choiceCards = variant.cardsFor(
    [...forActivePet].map((id) => services.find((service) => service._id === id)),
  );
  const activeVariant = activePet
    ? variantLabelForPet(
        services.find((service) => service.hasVariants) ?? null,
        activePet,
        petOptionLabel,
      )
    : null;

  /** One line per animal, so nothing chosen is out of sight behind a pill. */
  const summary = [...ticked.entries()].map(([id, set]) => ({
    petId: id,
    petName: pets.find((pet) => pet._id === id)?.name ?? "—",
    /*
      ⚠️ THE NAME AND THE PRICE TOGETHER, and the price is the ANIMAL'S.

      The summary named what each animal was having and left the figures on the
      rows above — so on a two-dog visit the only number in sight was the total,
      and Rp 260.000 for two groomings of the same name could not be broken down
      by anybody reading it. The same service costs a different amount for a
      small dog and a large one, which is exactly what this box is for.
    */
    services: [...set]
      .map((serviceId) => ({
        name: services.find((service) => service._id === serviceId)?.name ?? "",
        price: sellablePrice(id, serviceId),
      }))
      .filter((one) => one.name !== ""),
    /* What this animal comes to, so the total below can be checked against its
       parts rather than taken on trust. */
    total: sumDecimals(
      [...set].map((serviceId) => sellablePrice(id, serviceId)),
    ),
  }));

  return (
    <div className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="flex flex-col gap-2">
        <Label>Hewan</Label>
        {pets.length === 0 ? (
          <p className="text-sm text-muted">
            Pelanggan ini belum punya hewan terdaftar.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pets.map((pet) => {
              const count = ticked.get(pet._id)?.size ?? 0;

              return (
                <Button
                  key={pet._id}
                  type="button"
                  size="sm"
                  variant={petId === pet._id ? "default" : "secondary"}
                  aria-pressed={petId === pet._id}
                  /*
                    NAMED WITH ITS COUNT. Every pill reads as a name otherwise,
                    and a screen reader would give a cashier no way to tell which
                    animals already have something ticked.
                  */
                  aria-label={
                    count > 0 ? `${pet.name}, ${count} layanan` : pet.name
                  }
                  onClick={() => setPetId(pet._id)}
                >
                  {pet.name}
                  {/*
                    The count on the pill, so a cashier moving between animals
                    can see at a glance which ones are done — the checklist below
                    only ever shows one of them.
                  */}
                  {count > 0 && (
                    <span className="ml-1 tabular-nums opacity-80">
                      ({count})
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        )}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAddingPet(true)}
          >
            <Plus className="size-4" />
            Tambah hewan
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          Layanan{activePet && ` untuk ${activePet.name}`}
          {/*
            WHICH VARIANT THE FIGURES BELOW ARE, said once for the whole list
            rather than on every row. A number nobody can trace to a size is a
            number nobody can check, and the first time that matters is when a
            customer disputes the bill.
          */}
          {activeVariant && (
            <span className="ml-2 text-xs font-normal text-muted">
              {activeVariant}
            </span>
          )}
        </Label>
        {services.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada layanan yang bisa dijual. Tambahkan dulu di Layanan ›
            Grooming › Layanan &amp; Harga.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {services.map((service) => {
              const quote = petId
                ? priceFor(petId, service._id)
                : {
                    price: service.price,
                    missingAxis: null,
                    missingZone: false,
                    missingChoice: null,
                    durationMin: null,
                    inactive: false,
                  };
              const checked = forActivePet.has(service._id);
              /* The zone, or a missing zone, in words. A missing choice is answered below once ticked. */
              const waiting = quote.missingChoice
                ? checked
                  ? variant.problemOf(service, quote)
                  : "Pilih opsinya setelah dicentang."
                : variant.problemOf(service, quote);

              return (
                <li key={service._id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover">
                    <Checkbox
                      checked={checked}
                      /*
                        A SERVICE NOBODY CAN PRICE CANNOT BE TICKED. The server
                        refuses the whole patch on it, and the refusal names an
                        axis the receptionist was never asked about.

                        NOR ONE WHOSE VARIANT IS SWITCHED OFF (13 September
                        2026) — the till refuses a new line for it. A box
                        already ticked stays untickable, so a list re-read under
                        the cashier cannot strand a tick they cannot undo.
                      */
                      disabled={
                        (!quote.price && !quote.missingChoice && !checked) ||
                        (quote.inactive && !checked)
                      }
                      onCheckedChange={() => toggle(service._id)}
                      aria-label={service.name}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {service.name}
                      </span>
                      {/* The way out, named: which fact is missing, on whom. */}
                      {!quote.price && quote.missingAxis && activePet && (
                        <span className="block text-xs text-warning">
                          <PetFixLink
                            pet={activePet}
                            axis={quote.missingAxis}
                          />
                        </span>
                      )}
                      {!quote.price && waiting && (
                        <span className="block text-xs text-warning">{waiting}</span>
                      )}
                      {quote.price && variant.zone.ok && variesByZone(service) && (
                        <span className="block text-xs text-muted tabular-nums">
                          {variant.zoneText}
                        </span>
                      )}
                      {/* Why the box is grey, in words — §1.3. */}
                      {quote.inactive && (
                        <span className="block text-xs text-warning">
                          Varian nonaktif — aktifkan variannya di katalog untuk
                          menjualnya.
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted">
                      {quote.price && !quote.inactive
                        ? formatMoney(quote.price)
                        : "—"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/*
        "LOKASI: DI RUMAH" for the animal in front of the cashier — one select per
        card its ticked services are priced on.
      */}
      {activePet && choiceCards.length > 0 && (
        <VariantChoicePicker
          cards={choiceCards}
          value={choices.get(activePet._id) ?? NO_CHOICES}
          onChange={(next) => {
            setFormError(null);
            setChoices((prev) => new Map(prev).set(activePet._id, next));
          }}
          disabled={busy}
        />
      )}

      {/*
        WHAT EVERY ANIMAL IS HAVING, all of it at once.

        The checklist above only ever shows one pet, so without this the cashier
        would be confirming choices they can no longer see. It is the price of
        one-pet-at-a-time, and it is a small one: three lines of text against a
        page of stacked checklists.
      */}
      {summary.length > 0 && (
        <dl className="space-y-1 rounded-lg bg-surface p-3">
          {summary.map((row) => (
            <div key={row.petId} className="flex gap-2 text-sm">
              <dt className="shrink-0 font-medium text-foreground">
                {row.petName}
              </dt>
              <dd className="min-w-0 flex-1">
                {row.services.map((one) => (
                  <span
                    key={one.name}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="min-w-0 truncate text-muted">
                      {one.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {one.price ? formatMoney(one.price) : "—"}
                    </span>
                  </span>
                ))}

                {/* ONE ANIMAL'S SUBTOTAL, only when it has more than one service
                    — over a single line it would print the same figure twice. */}
                {row.services.length > 1 && (
                  <span className="flex items-baseline justify-between gap-2 border-t border-border pt-0.5">
                    <span className="text-xs text-muted">Subtotal</span>
                    <span className="shrink-0 tabular-nums text-foreground">
                      {formatMoney(row.total)}
                    </span>
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        {ticked.size > 0 && (
          <span className="text-sm tabular-nums text-muted">
            {formatMoney(total)}
          </span>
        )}
        <Button
          type="button"
          onClick={submit}
          /*
            FR-3: at least one service must be ticked. `ticked` only holds
            animals that have something, so its size IS that rule — and it no
            longer depends on which pill happens to be active, because a cashier
            may tick for Cici, move to Cilang, and confirm from there.
          */
          disabled={busy || ticked.size === 0}
        >
          {busy ? "Menambahkan…" : "Tambah ke keranjang"}
        </Button>
      </div>

      <PetQuickAddDialog
        customerId={customerId}
        open={addingPet}
        onOpenChange={setAddingPet}
        onCreated={(pet) => {
          setAddingPet(false);
          // Re-ask rather than splice: the list is server-ordered, and a local
          // insert would be a second ordering rule to keep in step.
          setPetsNonce((n) => n + 1);
          setPetId(pet._id);
        }}
      />
    </div>
  );
}
