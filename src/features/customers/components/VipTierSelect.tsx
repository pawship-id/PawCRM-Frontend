"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VipTier } from "@/types/api";

/**
 * VIP-tier picker — a shadcn/ui Select over the four tiers. A tier is optional on
 * a customer (nullable vipTier), so a "No tier" item clears it. Radix Select
 * forbids an empty-string item value, so the cleared state uses a sentinel
 * translated back to "" at the boundary. Presentational: the parent form owns the
 * value. Mirrors the users feature's RoleSelect.
 */
const NONE = "__none__";
const TIERS: VipTier[] = ["bronze", "silver", "gold", "platinum"];

export function VipTierSelect({
  value,
  onChange,
  error,
  disabled,
}: {
  /** The selected tier, or "" for no tier. */
  value: VipTier | "";
  onChange: (tier: VipTier | "") => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>VIP tier</Label>
      <Select
        value={value || NONE}
        disabled={disabled}
        onValueChange={(next) =>
          onChange(next === NONE ? "" : (next as VipTier))
        }
      >
        <SelectTrigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn("w-full capitalize", error && "border-danger")}
        >
          <SelectValue placeholder="No tier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No tier</SelectItem>
          {TIERS.map((tier) => (
            <SelectItem key={tier} value={tier} className="capitalize">
              {tier}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
