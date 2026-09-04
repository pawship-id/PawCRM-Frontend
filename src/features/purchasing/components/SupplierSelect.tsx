"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isSupplierActive } from "@/types/api";

import { useSupplierOptions } from "../hooks/useSupplierOptions";

/**
 * The supplier picker for the purchasing forms (goods receipt, purchase return).
 *
 * ACTIVE SUPPLIERS ONLY — that is what deactivating a vendor is FOR. The filter
 * is applied by the API rather than here, so this list and the endpoint that
 * accepts the form agree about which vendors are available.
 *
 * THE ONE EXCEPTION IS THE CURRENT SELECTION, which is kept and labelled
 * "(nonaktif)" even when deactivated. This mirrors WarehouseBranchSelect and
 * exists for the same reason: a form opened on a document raised before the
 * vendor was switched off would otherwise show an empty picker, and saving an
 * unrelated change would silently rewrite the supplier. Showing it — visibly
 * flagged — makes the state legible instead of destructive.
 *
 * Radix Select forbids an empty item value, so "not chosen yet" rides on a
 * sentinel the caller never sees: this component speaks `string | null`.
 */
const NONE = "__none__";

export function SupplierSelect({
  value,
  label = "Supplier",
  disabled = false,
  error,
  hint,
  onChange,
}: {
  value: string | null;
  label?: string;
  disabled?: boolean;
  error?: string;
  hint?: string;
  onChange: (value: string | null) => void;
}) {
  const { suppliers, loading, error: loadError } = useSupplierOptions(value);

  const selected = suppliers.find((supplier) => supplier._id === value);
  const message = error ?? loadError ?? undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="supplier-select">{label}</Label>
      <Select
        value={value ?? NONE}
        disabled={disabled || loading}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
      >
        <SelectTrigger
          id="supplier-select"
          aria-label={label}
          aria-invalid={message ? true : undefined}
          className="w-full"
        >
          <SelectValue
            placeholder={loading ? "Memuat supplier…" : "Pilih supplier"}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Pilih supplier…</SelectItem>
          {suppliers.map((supplier) => (
            <SelectItem key={supplier._id} value={supplier._id}>
              {supplier.name}
              {!isSupplierActive(supplier) && " (nonaktif)"}
              {supplier.deletedAt !== null && " (terhapus)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {message ? (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      ) : selected && !isSupplierActive(selected) ? (
        // Louder than the "(nonaktif)" suffix on purpose: this supplier is
        // already chosen, and submitting the form against it will be refused by
        // the server. Better to say so now than to explain a 400 afterwards.
        <p className="text-xs text-danger">
          Supplier ini nonaktif. Aktifkan dulu, atau pilih supplier lain.
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
