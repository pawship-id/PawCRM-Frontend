"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SubAccount } from "@/types/accounting";

import { subAccountLabel } from "../allocationLabels";

/**
 * The Sub Akun select that sits under an account select on the product,
 * category and service forms.
 *
 * DRAWN ONLY WHEN THERE IS SOMETHING TO PICK. An account with no active sub akun
 * has nothing to ask, and a control that is always on screen with nothing to say
 * is one people stop reading — the same reason Daftar Akun asks "Jenis" only for
 * Kas & Bank. While the answer is still on its way it shows a disabled "Memuat…"
 * rather than popping in a moment later and moving what is below it.
 *
 * REQUIRED, AS THE SERVER IS: once the chosen account has active sub akun, a save
 * without one is a 400. The form owns the check (it already holds the lists, and
 * its submit has to know), this control only draws the star and the message.
 *
 * NO "EMPTY" ITEM. Unlike the account select above it, there is no "ikut
 * kategori" to fall back to — a sub akun belongs to ONE account, so the choice is
 * between its sub akun and nothing the server accepts.
 */
export function SubAccountSelect({
  id,
  label = "Sub akun",
  subAccounts,
  loading,
  value,
  onChange,
  error,
  disabled = false,
}: {
  id: string;
  label?: string;
  subAccounts: SubAccount[];
  loading: boolean;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  if (!loading && subAccounts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        <span className="text-danger"> *</span>
      </Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || loading}
      >
        {/* w-full: the shadcn trigger defaults to `w-fit` — see the account
            selects above, which carry the same override. */}
        <SelectTrigger
          id={id}
          size="lg"
          className="w-full"
          aria-invalid={error ? true : undefined}
        >
          <SelectValue placeholder={loading ? "Memuat…" : "Pilih sub akun"} />
        </SelectTrigger>
        <SelectContent>
          {subAccounts.map((sub) => (
            <SelectItem key={sub._id} value={sub._id}>
              {subAccountLabel(sub)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted">
          Akun ini punya sub akun, jadi wajib dipilih — itu yang menentukan
          segmen laba rugi yang menanggungnya.
        </p>
      )}
    </div>
  );
}
