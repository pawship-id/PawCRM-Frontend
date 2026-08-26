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

/**
 * FR-3's second tab: charge for a service with no appointment behind it.
 *
 * ONE PET, ONE BOOKING. The PRD's flow reads "pilih hewan (bisa lebih dari satu)
 * → centang layanan per hewan", and this builds it one animal at a time: the
 * cashier picks a pet, ticks its services, confirms, and may open the tab again
 * for the second dog. The alternative — a pet × service matrix submitted at once
 * — would have to create several bookings from one form and decide what to do
 * when the third fails after the first two were written. Repeating a small,
 * atomic action is the honest shape.
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
  /** The chosen animal and the services ticked for it. Nothing is saved yet. */
  onAdd: (choice: {
    petId: string;
    petName: string;
    serviceIds: string[];
  }) => void;
}) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [petId, setPetId] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
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

  function toggle(serviceId: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
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
    const pet = pets.find((candidate) => candidate._id === petId);

    if (!pet) {
      setFormError("Pilih hewannya dulu.");
      return;
    }

    onAdd({ petId, petName: pet.name, serviceIds: [...ticked] });
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

  const total = services
    .filter((service) => ticked.has(service._id))
    .reduce((sum, service) => sum + Number(service.price), 0)
    .toFixed(4);

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
            {pets.map((pet) => (
              <Button
                key={pet._id}
                type="button"
                size="sm"
                variant={petId === pet._id ? "default" : "secondary"}
                aria-pressed={petId === pet._id}
                onClick={() => setPetId(pet._id)}
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
            onClick={() => setAddingPet(true)}
          >
            <Plus className="size-4" />
            Tambah hewan
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Layanan</Label>
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
                    checked={ticked.has(service._id)}
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

      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        {ticked.size > 0 && (
          <span className="text-sm tabular-nums text-muted">
            {formatMoney(total)}
          </span>
        )}
        <Button
          type="button"
          onClick={submit}
          // FR-3: at least one service must be ticked before this can be
          // submitted. A pet is required by the API, so it gates the button too.
          disabled={busy || !petId || ticked.size === 0}
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
