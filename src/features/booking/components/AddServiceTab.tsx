"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PetQuickAddDialog } from "@/features/pets";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { ApiError } from "@/services/api-error";
import { formatMoney } from "@/utils/decimal";
import type { Booking, Pet, Service } from "@/types/api";

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
 * IT CREATES A REAL BOOKING, not a loose cart line, because that is what makes
 * the sale attributable: FR-3 requires "atribusi ke hewan & layanan tetap
 * tercatat untuk histori". `origin: "pos_adhoc"` is what tells it apart from an
 * appointment somebody actually made, so "how many of this month's groomings
 * were walk-ins" stays answerable.
 *
 * CREATED `confirmed`, not `draft`: the customer is standing at the counter. The
 * POS moves it to `completed` when the payment lands (Fase 7).
 */
export function AddServiceTab({
  customerId,
  onCreated,
}: {
  customerId: string;
  onCreated: (booking: Booking) => void;
}) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [petId, setPetId] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [addingPet, setAddingPet] = useState(false);
  const [saving, setSaving] = useState(false);
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

  async function submit() {
    if (saving) return;

    setSaving(true);
    setFormError(null);

    try {
      const booking = await bookingService.create({
        customerId,
        petId,
        items: [...ticked].map((serviceId) => ({ serviceId })),
        scheduledAt: new Date().toISOString(),
        // The customer is at the counter — there is nothing left to confirm.
        status: "confirmed",
        origin: "pos_adhoc",
      });

      onCreated(booking);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
      setSaving(false);
    }
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
          disabled={saving || !petId || ticked.size === 0}
        >
          {saving ? "Menyimpan…" : "Tambah ke keranjang"}
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
