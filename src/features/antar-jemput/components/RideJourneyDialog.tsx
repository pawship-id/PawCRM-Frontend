"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Branch, Customer, Pet } from "@/types/api";

import { pinOf, resolveLeg } from "./TripPointFields";
import {
  blankJourney,
  RideJourneyFields,
  type RideJourney,
} from "./RideJourneyFields";

/**
 * ─── ONE ROW'S JOURNEY, ASKED IN A DIALOG (24 September 2026) ──────────────
 *
 * The counter asks this inline, because the tile opens a dialog of its own
 * anyway. A BILL CANNOT: its services are rows in a table, and a direction, two
 * addresses and a list of bookings do not fit in a cell beside a quantity and a
 * price. The row carries a summary and a button; the questions live here.
 *
 * SAME QUESTIONS, SAME RULES — `RideJourneyFields` is shared, so a journey
 * agreed at a till and one agreed on a bill cannot come to disagree about which
 * end is the customer's or when a booking already has a van.
 *
 * THE ANIMALS ARE ASKED HERE and not in the fields, because the two screens
 * pick them differently: the till has a picker on the dialog it already opened,
 * and a bill's row has nowhere to put one.
 */
export function RideJourneyDialog({
  open,
  serviceName,
  pets,
  customerId,
  customer,
  branch,
  value,
  perAnimal = false,
  alreadyHere = [],
  alreadyHereLabel,
  busy = false,
  onSave,
  onOpenChange,
}: {
  open: boolean;
  serviceName: string;
  /** The customer's animals — any of them may ride. */
  pets: Pet[];
  customerId: string;
  customer: Pick<Customer, "name" | "address" | "location"> | null;
  branch: Pick<Branch, "name" | "address" | "location"> | null;
  /** What the row holds now, or null for a journey nobody has filled in yet. */
  value: { passengerPetIds: string[]; journey: RideJourney } | null;
  perAnimal?: boolean;
  alreadyHere?: readonly string[];
  alreadyHereLabel?: string;
  busy?: boolean;
  onSave: (next: { passengerPetIds: string[]; journey: RideJourney }) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [journey, setJourney] = useState<RideJourney>(() => blankJourney());

  /*
    THE DIALOG IS FILLED FROM THE ROW EACH TIME IT OPENS, and edited on a copy:
    a journey half-changed and then cancelled must leave the row as it was.
  */
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(value?.passengerPetIds ?? (pets.length === 1 ? [pets[0]._id] : []));
    setJourney(value?.journey ?? blankJourney());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ends = resolveLeg(journey.points, customer, branch);
  const unpinned = !pinOf(ends.origin) || !pinOf(ends.destination);

  function togglePet(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((one) => one !== id) : [...prev, id],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Atur perjalanan</DialogTitle>
          <DialogDescription>{serviceName}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-muted">
              Hewan yang ikut
            </legend>
            {pets.length === 0 ? (
              <p className="text-sm text-muted">
                Pelanggan ini belum punya hewan terdaftar.
              </p>
            ) : (
              <>
                {/* A VAN TAKES SEVERAL, and nothing else does — said out loud,
                    because the buttons look the same either way. */}
                {pets.length > 1 && (
                  <p className="text-xs text-muted">
                    Bisa pilih lebih dari satu — satu perjalanan bisa mengangkut
                    beberapa hewan sekaligus.
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
                      onClick={() => togglePet(pet._id)}
                    >
                      {pet.name}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </fieldset>

          {picked.length > 0 && (
            <RideJourneyFields
              journey={journey}
              onChange={setJourney}
              customerId={customerId}
              petIds={picked}
              customer={customer}
              branch={branch}
              perAnimal={perAnimal}
              alreadyHere={alreadyHere}
              alreadyHereLabel={alreadyHereLabel}
              disabled={busy}
              idPrefix="invoice-ride"
            />
          )}

          {picked.length > 0 && unpinned && (
            <p className="text-xs text-warning">
              Lengkapi titik lokasi asal dan tujuan dulu — tarifnya dihitung dari
              jarak yang ditempuh.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            /*
              A JOURNEY WITH NOBODY IN IT, OR WITH AN END NOBODY PINNED, HAS NO
              PRICE. The server refuses both in those words; meeting them here
              is one round trip and one screen earlier.
            */
            disabled={busy || picked.length === 0 || unpinned}
            onClick={() => onSave({ passengerPetIds: picked, journey })}
          >
            Simpan perjalanan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
