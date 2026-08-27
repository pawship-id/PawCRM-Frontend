"use client";

import { UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PosTransaction } from "@/types/api";

/**
 * Who the basket belongs to (FR-2).
 *
 * AT THE TOP OF THE CART, above the lines, because it is the thing a cashier
 * sets first when it matters at all — and because on a receipt it is printed
 * there. A control at the bottom would be found after the basket is already
 * built, which is exactly when changing it is most awkward.
 *
 * OPTIONAL, AND SAYS SO. Most sales at a petshop till are walk-ins, so the empty
 * state is an invitation rather than a warning: nothing here blocks a sale.
 * (Piutang is the one method that will require a customer — that tab does not
 * exist yet, see the Piutang plan.)
 *
 * "GANTI" REPLACES, "×" CLEARS. Two separate acts that a single control would
 * have conflated: a cashier who picked the wrong person wants the picker back,
 * and one who realised this is a walk-in wants the field empty.
 */
export function PosCustomerSection({
  customer,
  busy = false,
  onPick,
  onClear,
}: {
  customer: PosTransaction["customer"];
  busy?: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  if (!customer) {
    return (
      <div className="border-b border-border px-4 py-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={onPick}
        >
          <UserPlus className="size-4" />
          Pilih pelanggan
        </Button>
        <p className="mt-1.5 text-xs text-muted">
          Opsional — boleh dilewati untuk pembeli yang lewat.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {customer.name}
        </span>
        {customer.phone && (
          <span className="block truncate text-xs tabular-nums text-muted">
            {customer.phone}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onPick}
        >
          Ganti
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-danger"
          disabled={busy}
          aria-label={`Lepas ${customer.name} dari transaksi ini`}
          onClick={onClear}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
