"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  RECEIPT_SIZES,
  RECEIPT_SIZE_LABELS,
  useReceiptSize,
} from "../deviceSettings";

/**
 * Pengaturan Kasir — what this device does, not what the shop does (FR-8).
 *
 * "Kasir", not "POS": ui-rules §12 lists POS among the words the product does
 * not use, so the PRD's "Pengaturan POS" is spelled the way a cashier reads it.
 *
 * REACHED FROM THE TILL rather than from the sidebar, and that is the point of
 * the placement: everything in here is remembered by the browser in front of
 * you. A row in the main nav sits beside Profil Cabang and Pengguna, which are
 * the shop's settings, and would have invited somebody to change the paper size
 * here and expect the other till to follow.
 *
 * NO SAVE BUTTON. Every setting here applies on the click that makes it, the
 * way a filter does — there is nothing to submit and nothing to lose by closing
 * the dialog. ui-rules §16's action bar is for a document; this is a preference.
 */
export function PosSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [size, setSize] = useReceiptSize();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pengaturan Kasir</DialogTitle>
          <DialogDescription>
            Berlaku di perangkat ini saja. Komputer atau tablet lain punya
            pengaturannya sendiri.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="text-base font-bold">Ukuran kertas struk</h3>
          <p className="text-sm text-muted">
            Sesuaikan dengan printer yang tersambung ke perangkat ini.
          </p>

          {/*
            THE ONLY PLACE THIS IS CHOSEN. The receipt dialog used to carry the
            same three buttons, which made this screen a second door to one
            value — and put printer configuration in front of a cashier with a
            customer waiting.
          */}
          <div className="flex gap-2" role="group" aria-label="Ukuran kertas">
            {RECEIPT_SIZES.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={size === option ? "default" : "secondary"}
                aria-pressed={size === option}
                onClick={() => setSize(option)}
              >
                {RECEIPT_SIZE_LABELS[option]}
              </Button>
            ))}
          </div>

          <p className="text-sm text-muted">
            58 mm dan 80 mm untuk printer struk termal, A4 untuk printer biasa.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
