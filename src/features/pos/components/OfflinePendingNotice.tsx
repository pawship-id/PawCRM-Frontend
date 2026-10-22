"use client";

import { Alert } from "@/components";
import type { PosXReport } from "@/types/api";

function timeOf(value: string | null): string {
  if (!value) return "belum pernah";
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/**
 * "THIS CASHIER'S SALES ARE STILL ON ANOTHER TILL" (POS offline mode,
 * 19 October 2026) — on X-Report and Tutup Kasir. Those sales are not in the
 * figures yet, so a drawer counted now would look over by exactly their cash.
 * Names each till and when it last checked in; a till reports again within a
 * minute of sending its queue, so the warning clears on its own.
 */
export function OfflinePendingNotice({
  pending,
  closing = false,
}: {
  pending: PosXReport["offlinePending"];
  closing?: boolean;
}) {
  if (!pending?.length) return null;
  const total = pending.reduce((sum, device) => sum + device.count, 0);

  return (
    <Alert variant="warning">
      <p>
        Masih ada {total} transaksi offline milik kasir ini yang belum terkirim,
        jadi belum masuk hitungan di bawah:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {pending.map((device) => (
          <li key={device.deviceId}>
            {device.name ?? device.code}: {device.count} transaksi,
            terakhir aktif {timeOf(device.lastSeenAt)}
          </li>
        ))}
      </ul>
      <p className="mt-1">
        {closing
          ? "Sebaiknya sambungkan perangkat itu ke internet dulu sebelum menutup kasir."
          : "Sambungkan perangkat itu ke internet supaya transaksinya terkirim."}
      </p>
    </Alert>
  );
}
