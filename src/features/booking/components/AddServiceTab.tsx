"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PetQuickAddDialog } from "@/features/pets";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { formatMoney } from "@/utils/decimal";
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

  const priceOf = (serviceId: string) =>
    Number(services.find((service) => service._id === serviceId)?.price ?? 0);

  /** Everything ticked, for every animal — what the basket is about to gain. */
  const total = [...ticked.values()]
    .flatMap((set) => [...set])
    .reduce((sum, serviceId) => sum + priceOf(serviceId), 0)
    .toFixed(4);

  /** One line per animal, so nothing chosen is out of sight behind a pill. */
  const summary = [...ticked.entries()].map(([id, set]) => ({
    petId: id,
    petName: pets.find((pet) => pet._id === id)?.name ?? "—",
    services: [...set]
      .map(
        (serviceId) =>
          services.find((service) => service._id === serviceId)?.name ?? "",
      )
      .filter(Boolean),
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
          Layanan{petId && ` untuk ${pets.find((pet) => pet._id === petId)?.name ?? ""}`}
        </Label>
        {services.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada layanan yang bisa dijual. Tambahkan dulu di Master Data →
            Layanan.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {services.map((service) => (
              <li key={service._id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover">
                  <Checkbox
                    checked={forActivePet.has(service._id)}
                    onCheckedChange={() => toggle(service._id)}
                    aria-label={service.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {service.name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted">
                    {formatMoney(service.price)}
                  </span>
                </label>
              </li>
            ))}
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
              <dd className="min-w-0 flex-1 text-muted">
                {row.services.join(", ")}
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
