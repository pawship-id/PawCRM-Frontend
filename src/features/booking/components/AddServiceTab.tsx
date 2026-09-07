"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PetFixLink, PetQuickAddDialog } from "@/features/pets";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { formatMoney, sumDecimals } from "@/utils/decimal";
import { priceForPet, variantLabelForPet } from "@/utils/serviceVariant";
import type { Pet, Service } from "@/types/api";

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

/** Shared empty set, so an untouched pet does not allocate one per render. */
const EMPTY: ReadonlySet<string> = new Set();

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
  busy = false,
  onAdd,
}: {
  customerId: string;
  /** True while the cart write this tab started is still in flight. */
  busy?: boolean;
  /**
   * Every animal the cashier ticked something for. Nothing is saved yet.
   *
   * A LIST, because one opening may cover a customer's whole household — and it
   * reaches the server as ONE cart patch, so either all of it lands or none does.
   */
  onAdd: (
    choices: Array<{ petId: string; petName: string; serviceIds: string[] }>,
  ) => void;
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
        setServices(servicePage.items);
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
    const choices = [...ticked.entries()]
      .map(([id, serviceIds]) => ({
        petId: id,
        petName: pets.find((pet) => pet._id === id)?.name ?? "",
        serviceIds: [...serviceIds],
      }))
      /*
        A pet added and then removed from the list between ticking and confirming
        is not something to fail over — it is one entry dropped from a request
        that still has work in it.
      */
      .filter((choice) => choice.petName !== "");

    if (choices.length === 0) {
      setFormError("Centang dulu layanannya.");
      return;
    }

    onAdd(choices);
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
  const priceFor = (petId: string, serviceId: string) =>
    priceForPet(
      services.find((service) => service._id === serviceId),
      pets.find((pet) => pet._id === petId),
    );

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
      [...set].map((serviceId) => priceFor(petId, serviceId).price),
    ),
  );

  /** The animal the list below is for, and what it is priced as. */
  const activePet = pets.find((pet) => pet._id === petId) ?? null;
  const activeVariant = activePet
    ? variantLabelForPet(
        services.find((service) => service.hasVariants) ?? null,
        activePet,
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
        price: priceFor(id, serviceId).price,
      }))
      .filter((one) => one.name !== ""),
    /* What this animal comes to, so the total below can be checked against its
       parts rather than taken on trust. */
    total: sumDecimals(
      [...set].map((serviceId) => priceFor(id, serviceId).price),
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
            Belum ada layanan yang bisa dijual. Tambahkan dulu di Master Data →
            Layanan.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {services.map((service) => {
              const quote = petId
                ? priceFor(petId, service._id)
                : { price: service.price, missingAxis: null };

              return (
                <li key={service._id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover">
                    <Checkbox
                      checked={forActivePet.has(service._id)}
                      /*
                        A SERVICE NOBODY CAN PRICE CANNOT BE TICKED. The server
                        refuses the whole patch on it, and the refusal names an
                        axis the receptionist was never asked about.
                      */
                      disabled={!quote.price}
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
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted">
                      {quote.price ? formatMoney(quote.price) : "—"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
