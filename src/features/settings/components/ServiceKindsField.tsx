"use client";

import { CheckRow, CheckRowGroup } from "@/components";
import { Label } from "@/components/ui/label";
import { SERVICE_KIND_LABELS, SERVICE_KINDS, type ServiceKind } from "@/types/api";

/**
 * "Dipakai di layanan" on an Opsi Varian card (22 September 2026) — which kind
 * of service the card is offered for in the service form: Ukuran, Jenis Hewan
 * and Jenis Bulu for Grooming; Zona and Arah for Antar-Jemput.
 *
 * FIXED KINDS, NOT BUSINESS LINES: every tenant names its lines its own way,
 * while these three are what the product sells (hardcoded on request).
 * NONE TICKED IS EVERY KIND — what every card written before the field reads
 * as, so an untouched card changes nothing.
 */
export function ServiceKindsField({
  value,
  onChange,
  disabled,
}: {
  value: ServiceKind[];
  onChange: (next: ServiceKind[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Dipakai di layanan</Label>
      <CheckRowGroup>
        {SERVICE_KINDS.map((kind) => (
          <CheckRow
            key={kind}
            label={SERVICE_KIND_LABELS[kind]}
            checked={value.includes(kind)}
            disabled={disabled}
            onCheckedChange={(on) =>
              onChange(on ? [...value, kind] : value.filter((one) => one !== kind))
            }
          />
        ))}
      </CheckRowGroup>
      <p className="text-xs text-muted">
        Opsi hanya ditawarkan di form layanan yang dicentang. Kosongkan kalau
        dipakai semua layanan.
      </p>
    </div>
  );
}
