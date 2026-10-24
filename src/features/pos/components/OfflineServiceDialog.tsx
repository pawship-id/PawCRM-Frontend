"use client";

import { useMemo, useState } from "react";

import { Alert } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatMoney, toDecimalString } from "@/utils/decimal";
import type { PosCatalogAddon, PosCatalogItem, VariantChoice } from "@/types/api";

import { resolveServicePrice, staffAxesOf } from "../offline/pricing";
import { useOfflineStore } from "../offline/store";
import type { OfflinePet } from "@/types/posOffline";

/**
 * WHICH ANIMAL A SERVICE IS FOR, OFFLINE (POS offline mode, 19 October 2026).
 *
 * The online dialog asks the server for the customer's pets, their cards and
 * the zone; offline the answer comes from the device's copy, so this asks only
 * what can be answered here: the animal, the staff's choices where the price
 * varies by them, and the add-ons. The price shown is the one the cart will
 * charge — the same function prices both.
 */
export function OfflineServiceDialog({
  service,
  customerId,
  customerName,
  busy,
  onOpenChange,
  onPick,
}: {
  service: PosCatalogItem | null;
  customerId: string;
  customerName?: string;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (pet: { _id: string; name: string }, addonIds: string[], choices: VariantChoice[]) => void;
}) {
  const { snapshot } = useOfflineStore();
  const [petId, setPetId] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});

  const pets = useMemo(
    () => (snapshot.customers?.pets ?? []).filter((pet) => pet.customerId === customerId),
    [snapshot.customers, customerId],
  );
  const pet: OfflinePet | null = pets.find((candidate) => candidate._id === petId) ?? null;

  const axes = service ? staffAxesOf(service as never) : [];
  /* Each staff axis offers the codes some variant of this service carries. */
  const options = axes.map((axis) => ({
    axis,
    codes: [
      ...new Set(
        (service?.variants ?? []).flatMap((variant) =>
          (variant.choices ?? []).filter((choice) => String(choice.optionId) === axis).map((choice) => choice.code),
        ),
      ),
    ],
  }));
  const variantChoices: VariantChoice[] = Object.entries(choices).map(([optionId, code]) => ({ optionId, code }));

  let price: string | null = null;
  let priceError: string | null = null;
  if (service && pet) {
    try {
      price = toDecimalString(resolveServicePrice(service as never, pet, variantChoices, service.name));
    } catch (error) {
      priceError = (error as Error).message;
    }
  }

  const offered: PosCatalogAddon[] = (service as { addons?: PosCatalogAddon[] } | null)?.addons ?? [];

  function close() {
    setPetId(null);
    setAddons([]);
    setChoices({});
    onOpenChange(false);
  }

  return (
    <Dialog open={service !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{service?.name ?? "Layanan"} untuk hewan yang mana?</DialogTitle>
          <DialogDescription>
            Mode offline{customerName ? ` · ${customerName}` : ""}. Hewan baru bisa ditambahkan saat online.
          </DialogDescription>
        </DialogHeader>

        {pets.length === 0 ? (
          <Alert variant="warning">
            Belum ada hewan pelanggan ini di data offline.
          </Alert>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Hewan">
            {pets.map((candidate) => (
              <Button
                key={candidate._id}
                type="button"
                size="sm"
                variant={candidate._id === petId ? "default" : "secondary"}
                aria-pressed={candidate._id === petId}
                onClick={() => setPetId(candidate._id)}
              >
                {candidate.name}
              </Button>
            ))}
          </div>
        )}

        {options.map(({ axis, codes }) => (
          <div key={axis} className="space-y-1">
            <p className="text-sm font-semibold">Pilihan</p>
            <div className="flex flex-wrap gap-2">
              {codes.map((code) => (
                <Button
                  key={code}
                  type="button"
                  size="sm"
                  variant={choices[axis] === code ? "default" : "secondary"}
                  aria-pressed={choices[axis] === code}
                  onClick={() => setChoices((current) => ({ ...current, [axis]: code }))}
                >
                  {code}
                </Button>
              ))}
            </div>
          </div>
        ))}

        {offered.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Tambahan</p>
            {offered.map((addon) => (
              <div key={addon._id} className="flex items-center gap-2">
                <Checkbox
                  id={`addon-${addon._id}`}
                  checked={addons.includes(addon._id)}
                  onCheckedChange={(on) =>
                    setAddons((current) =>
                      on ? [...current, addon._id] : current.filter((id) => id !== addon._id),
                    )
                  }
                />
                <Label htmlFor={`addon-${addon._id}`} className="text-sm">
                  {addon.name}
                  {addon.price && !addon.hasVariants ? ` · ${formatMoney(addon.price)}` : ""}
                </Label>
              </div>
            ))}
          </div>
        )}

        {priceError && <Alert variant="warning">{priceError}</Alert>}
        {price && (
          <p className="text-sm">
            Harga: <span className="font-semibold tabular-nums">{formatMoney(price)}</span>
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={busy || !pet || !price}
            onClick={() => {
              if (!pet) return;
              onPick({ _id: pet._id, name: pet.name }, addons, variantChoices);
              setPetId(null);
              setAddons([]);
              setChoices({});
            }}
          >
            Tambahkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
