"use client";

import { useEffect, useState } from "react";

import { Card, Spinner } from "@/components";
import { hotelStayService } from "@/services/hotel.service";
import type { HotelStayBooking, HotelStayCommissionRow } from "@/types/api";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { shortDate } from "../stay";

const STATUS_LABEL: Record<HotelStayCommissionRow["status"], string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  paid: "Dibayar",
  accrued: "Dicatat",
};

/**
 * What the stay earned staff (21 November 2026, PLAN-Hotel-V1.md §4.4) — Owner
 * and Manager only (the page wraps it in `commissionReports:read`). One row per
 * night, tahapan or add-on done; it refreshes whenever the stay does, since a
 * tick or a sale is what changes it.
 */
export function StayCommissionCard({ booking }: { booking: HotelStayBooking }) {
  const [rows, setRows] = useState<HotelStayCommissionRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    hotelStayService
      .commission(booking._id)
      .then((next) => {
        if (!active) return;
        setRows(next);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [booking]);

  const total = sumDecimals((rows ?? []).map((row) => row.amount));

  return (
    <Card title="Komisi">
      {failed ? (
        <p className="text-sm text-muted">Komisi belum bisa dimuat.</p>
      ) : rows === null ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size={16} /> Memuat komisi…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          {booking.status === "confirmed"
            ? "Komisi dihitung setelah hewan check-in."
            : "Belum ada komisi. Komisi muncul per malam setelah kegiatannya dicentang dan bookingnya sudah dibayar di kasir."}
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          {rows.map((row) => (
            <div key={row._id} className="flex justify-between gap-3">
              <span>
                <span className="font-medium">{row.userName ?? "Staf"}</span>
                <span className="block text-xs text-muted">
                  <span className="tabular-nums">
                    {row.date ? shortDate(row.date) : "—"}
                  </span>{" "}
                  ·{" "}
                  {row.label ?? (row.kind === "addon" ? "Add-on" : "Menginap")}{" "}
                  · {STATUS_LABEL[row.status] ?? row.status}
                </span>
              </span>
              <span className="tabular-nums">{formatMoney(row.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-border pt-2 font-bold">
            <span>Total komisi</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
