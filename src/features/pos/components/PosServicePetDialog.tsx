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
import { petService } from "@/services/pet.service";
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
  onPick: (pet: Pet) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingPet, setAddingPet] = useState(false);
  const [nonce, setNonce] = useState(0);

  const open = service !== null;

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
    }
    onOpenChange(next);
  }

  function confirm() {
    const pet = pets.find((candidate) => candidate._id === petId);
    if (pet) onPick(pet);
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
                  disabled={busy}
                  onClick={() => setAddingPet(true)}
                >
                  <Plus className="size-4" />
                  Tambah hewan
                </Button>
              </div>
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
              disabled={busy || !petId}
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
