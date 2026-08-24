"use client";

import { useId } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";

/**
 * A flag with its consequence written next to it — "Produk punya masa
 * kedaluwarsa", and underneath, what ticking it actually changes.
 *
 * Lifted out of ProductForm, where this shape was hand-built three times. The
 * description is not decoration: every one of these checkboxes silently changes
 * what a LATER screen demands (a receipt suddenly requiring a batch code, a POS
 * tile appearing for an out-of-stock item), and a bare label leaves somebody to
 * discover that six weeks on from a stock card.
 *
 * THE WHOLE ROW IS THE TARGET. The box itself stays `size-4` — the app's one
 * checkbox size, the same one the tables use, and a second size is exactly the
 * drift the rules exist to stop — but the label and the description are inside
 * the `<Label>`, so the 44px hit area comes from the row, not from the box.
 */
export interface CheckRowProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function CheckRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: CheckRowProps) {
  const id = useId();

  return (
    <div className={cn("flex items-start gap-3 py-3.5", className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0">
        {/* `font-normal` on the description, inside the Label, so clicking the
            explanation toggles the box too — that sentence is the part people
            actually read before deciding. */}
        <Label
          htmlFor={id}
          className={cn(
            "block cursor-pointer text-sm font-bold text-foreground",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {label}
          {description && (
            <span className="mt-1 block text-xs font-normal text-muted">
              {description}
            </span>
          )}
        </Label>
      </div>
    </div>
  );
}

/**
 * Two or more check-rows stacked, with a hairline between them.
 *
 * The rule separates flags that are unrelated decisions; without it three
 * paragraphs of description run together and the second checkbox looks like it
 * belongs to the first one's explanation.
 */
export function CheckRowGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border", className)}>{children}</div>
  );
}
