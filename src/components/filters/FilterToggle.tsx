"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A boolean filter — "Tampilkan terhapus", "Tampilkan lot yang sudah habis".
 *
 * Not in the original spec, but the census found nine of them: eight built on
 * the shadcn Checkbox and one on a raw `<input type="checkbox">`. This retires
 * the second convention.
 *
 * The label is wired with `htmlFor` so `getByLabelText(…)` plus a click keeps
 * working — that is how every existing screen test drives these.
 */
export interface FilterToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function FilterToggle({
  label,
  checked,
  onChange,
  disabled,
  className,
}: FilterToggleProps) {
  const id = useId();

  return (
    <div className={cn("flex h-10 shrink-0 items-center gap-2", className)}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(state) => onChange(state === true)}
      />
      <Label htmlFor={id} className="text-sm font-normal text-muted">
        {label}
      </Label>
    </div>
  );
}
