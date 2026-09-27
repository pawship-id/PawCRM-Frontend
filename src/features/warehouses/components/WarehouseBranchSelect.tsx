"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Branch } from "@/types/api";

/**
 * The `defaultBranchId` picker, shared by the create and edit forms.
 *
 * "Tanpa cabang" is a first-class option, not an empty state: a central warehouse
 * serving every branch belongs to none of them, and the backend models that as
 * `defaultBranchId: null`. Radix Select forbids an empty item value, so it rides
 * on a sentinel that the caller never sees — the component speaks
 * `string | null` and converts at the edge.
 *
 * Inactive branches are still listed when one is already selected: hiding the
 * branch a warehouse currently points at would silently rewrite the field the
 * first time someone saved an unrelated change.
 */
const NONE = "__none__";

export function WarehouseBranchSelect({
  value,
  branches,
  disabled = false,
  error,
  onChange,
}: {
  value: string | null;
  branches: Branch[];
  disabled?: boolean;
  error?: string;
  onChange: (value: string | null) => void;
}) {
  const options = branches.filter(
    (branch) => branch.isActive || branch._id === value,
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="warehouse-branch">Cabang utama</Label>
      <Select
        value={value ?? NONE}
        disabled={disabled}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
      >
        <SelectTrigger
          id="warehouse-branch"
          aria-label="Cabang utama"
          aria-invalid={error ? true : undefined}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Tanpa cabang (gudang pusat)</SelectItem>
          {options.map((branch) => (
            <SelectItem key={branch._id} value={branch._id}>
              {branch.name}
              {!branch.isActive && " (nonaktif)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted">
          Cabang yang jadi tujuan mutasi stok gudang ini.
        </p>
      )}
    </div>
  );
}
