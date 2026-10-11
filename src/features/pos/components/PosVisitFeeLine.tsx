"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/utils/decimal";
import type { PosItem } from "@/types/api";

import { ownDiscountOf } from "../bookingDiscount";
import { PosLineTotal } from "./PosLineTotal";

/**
 * THE HOME-VISIT FEE, AS A ROW OF ITS OWN (11 October 2026, on request).
 *
 * It is billed as an add-on of the grooming booking that carries it, and it
 * used to be drawn under that grooming as "+ Biaya kunjungan · Zona B" — which
 * read as something done to Cilang rather than what it is: the groomer's trip
 * to the house. Here it stands apart, naming every animal the trip is for.
 *
 * ITS OWN LINE SINCE 11 OCTOBER 2026: the fee is the trip's, not a booking's,
 * so it has a discount and a bin of its own. Taking it off lets the trip go —
 * it comes back on offer with the next booking of the house that is billed.
 */
export function PosVisitFeeLine({
  item,
  index,
  onEdit,
  onRemove,
  disabled = false,
}: {
  item: PosItem;
  index: number;
  onEdit: (index: number) => void;
  /** Absent on a fee of the old shape, which leaves with its booking. */
  onRemove?: (index: number) => void;
  disabled?: boolean;
}) {
  const fee = item.visitFee;
  /* EVERY ANIMAL ON THE TRIP, not the one whose booking carries the line —
     per visit, one booking carries the fee for the whole house. */
  const pets = fee?.petNames?.length ? fee.petNames : item.petName ? [item.petName] : [];
  const detail = [
    pets.length > 0 ? `Untuk ${pets.join(", ")}` : null,
    fee?.distanceKm == null
      ? null
      : `${String(Math.round(fee.distanceKm * 10) / 10).replace(".", ",")} km`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div data-visit-fee-line className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 cursor-pointer" onClick={() => !disabled && onEdit(index)}>
          <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
          {detail && (
            <span className="mt-0.5 block truncate text-xs text-muted">{detail}</span>
          )}
          {ownDiscountOf(item) && (
            <span className="mt-0.5 block text-xs tabular-nums text-success">
              −{formatMoney(ownDiscountOf(item)!.resolvedAmount)}
            </span>
          )}
        </div>
        <PosLineTotal item={item} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant="outline" className="border-transparent bg-tint-info text-info">
          Perjalanan
        </Badge>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={ownDiscountOf(item) ? "default" : "secondary"}
            size="sm"
            disabled={disabled}
            aria-label={`Ubah ${item.name}`}
            onClick={() => onEdit(index)}
          >
            <Pencil className="size-4" />
            {ownDiscountOf(item) && `−${formatMoney(ownDiscountOf(item)!.resolvedAmount)}`}
          </Button>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-danger"
              disabled={disabled}
              aria-label={`Hapus ${item.name}`}
              onClick={() => onRemove(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
