"use client";

import { useState } from "react";

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
import { formatMoney } from "@/utils/decimal";
import { priceForPet } from "@/utils/serviceVariant";
import type { Pet, Service } from "@/types/api";

/**
 * "+ Add-on" on a main service's row in Faktur baru — the ticks the till asks
 * in `PosServicePetDialog`, asked where this form picks the animal: on the row.
 *
 * A MODAL, NOT A POPOVER (decided 14 September 2026 on request). The popover was
 * narrow enough to push each price under its name, and it applied every tick the
 * moment it was made. The modal holds the ticks as a draft — Simpan add-on puts
 * them on the bill, Batal leaves the bill as it was — the same shape as the
 * "Tambah barang atau jasa" dialog beside it.
 *
 * ONLY AFTER AN ANIMAL IS CHOSEN. An add-on may be priced by size or coat, so
 * before the pet is known there is no honest figure to put beside a tick.
 *
 * AN ADD-ON NOBODY CAN PRICE CANNOT BE TICKED, and neither can a switched-off
 * variant — the server refuses both. One already on the bill can still be
 * unticked after the animal changed, so a line that lost its price can come off.
 *
 * WHAT A SAVE DOES IS THE FORM'S BUSINESS (`onSave`): it puts exactly those
 * add-ons under this row, for this row's animal. The server files them under the
 * service again from the catalogue — nothing here is sent as a parent.
 */
export function InvoiceAddonPicker({
  idPrefix,
  serviceName,
  pet,
  offered,
  tickedIds,
  onSave,
  disabled = false,
}: {
  /** Unique per row — a customer with two cats has two of these. */
  idPrefix: string;
  serviceName: string;
  /** The row's animal, or undefined while none is chosen. */
  pet: Pet | undefined;
  /** The active add-ons this service lists, in catalogue order. */
  offered: Service[];
  /** Add-ons already on the bill under this row. */
  tickedIds: string[];
  /** Every add-on that should be under the row, in catalogue order. */
  onSave: (addonIds: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || !pet}
        aria-label={
          tickedIds.length > 0
            ? `Add-on untuk ${serviceName} (${tickedIds.length} dipilih)`
            : `Add-on untuk ${serviceName}`
        }
        onClick={() => setOpen(true)}
      >
        {tickedIds.length > 0 ? `+ Add-on (${tickedIds.length})` : "+ Add-on"}
      </Button>

      {!pet && <span className="text-xs text-muted">Pilih hewan dulu</span>}

      {/* MOUNTED ONLY WHILE OPEN, so every opening starts its draft from what
          the bill carries now rather than from a draft somebody cancelled. */}
      {open && pet && (
        <AddonDialog
          idPrefix={idPrefix}
          serviceName={serviceName}
          pet={pet}
          offered={offered}
          tickedIds={tickedIds}
          onSave={onSave}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function AddonDialog({
  idPrefix,
  serviceName,
  pet,
  offered,
  tickedIds,
  onSave,
  onClose,
}: {
  idPrefix: string;
  serviceName: string;
  pet: Pet;
  offered: Service[];
  tickedIds: string[];
  onSave: (addonIds: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(tickedIds));

  function toggle(id: string) {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Add-on ${serviceName}`}</DialogTitle>
          <DialogDescription>
            {`Untuk ${pet.name} — harganya sudah menurut hewannya. Yang dicentang masuk ke faktur di bawah ${serviceName}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {offered.map((addon) => {
            const quote = priceForPet(addon, pet);
            const checked = draft.has(addon._id);
            const id = `${idPrefix}-addon-${addon._id}`;

            return (
              <div
                key={addon._id}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-0"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={!checked && (!quote.price || quote.inactive)}
                  onCheckedChange={() => toggle(addon._id)}
                />
                <Label
                  htmlFor={id}
                  className="flex flex-1 cursor-pointer flex-wrap items-baseline gap-x-3 font-normal"
                >
                  <span className="text-sm text-foreground">{addon.name}</span>
                  <span className="ml-auto text-sm text-muted tabular-nums">
                    {quote.inactive
                      ? "Varian nonaktif"
                      : quote.price
                        ? `+ ${formatMoney(quote.price)}`
                        : "Belum ada harga"}
                  </span>
                </Label>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(
                offered
                  .filter((addon) => draft.has(addon._id))
                  .map((addon) => addon._id),
              );
              onClose();
            }}
          >
            Simpan add-on
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
