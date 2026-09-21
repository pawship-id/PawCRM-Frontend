"use client";

import { CheckRow, CheckRowGroup } from "@/components";
import { Label } from "@/components/ui/label";
import { useBusinessLines } from "@/hooks/useBusinessLines";

/**
 * "Lini bisnis" on an Opsi Varian card (22 September 2026) — which lines of
 * business the card is offered for in the service form: Ukuran, Jenis Hewan
 * and Jenis Bulu for Grooming; Zona and Arah for Antar-Jemput.
 *
 * NONE TICKED IS EVERY LINE, and the hint says so — it is what every card
 * written before the field reads as, so an untouched card changes nothing.
 */
export function BusinessLinesField({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const lines = useBusinessLines();

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Lini bisnis</Label>
      {lines.error ? (
        <p className="text-sm font-semibold text-danger">{lines.error}</p>
      ) : !lines.loaded ? (
        <p className="text-sm text-muted">Memuat lini bisnis…</p>
      ) : lines.items.length === 0 ? (
        <p className="text-sm text-muted">
          Belum ada lini bisnis — opsi ini dipakai semua layanan.
        </p>
      ) : (
        <CheckRowGroup>
          {lines.items.map((line) => (
            <CheckRow
              key={line._id}
              label={line.name}
              checked={value.includes(line._id)}
              disabled={disabled}
              onCheckedChange={(on) =>
                onChange(on ? [...value, line._id] : value.filter((id) => id !== line._id))
              }
            />
          ))}
        </CheckRowGroup>
      )}
      <p className="text-xs text-muted">
        Opsi hanya ditawarkan di form layanan lini yang dicentang. Kosongkan
        kalau dipakai semua lini.
      </p>
    </div>
  );
}
