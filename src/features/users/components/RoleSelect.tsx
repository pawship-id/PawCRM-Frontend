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
import type { Role } from "@/types/api";

/**
 * Role picker — a shadcn/ui Select over the tenant's roles. Role is optional on
 * a user (nullable roleId), so a "No role" item clears it. Radix Select forbids
 * an empty-string item value, so the cleared state uses a sentinel that is
 * translated back to "" at the boundary. Presentational: the parent form owns
 * the value and the roles list (from useLookups).
 */
const NONE = "__none__";

export function RoleSelect({
  roles,
  value,
  onChange,
  error,
  disabled,
}: {
  roles: Role[];
  /** The selected roleId, or "" for no role. */
  value: string;
  onChange: (roleId: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Role</Label>
      <Select
        value={value || NONE}
        disabled={disabled}
        onValueChange={(next) => onChange(next === NONE ? "" : next)}
      >
        <SelectTrigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn("w-full", error && "border-danger")}
        >
          <SelectValue placeholder="No role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No role</SelectItem>
          {roles.map((role) => (
            <SelectItem key={role._id} value={role._id}>
              {role.name}
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
