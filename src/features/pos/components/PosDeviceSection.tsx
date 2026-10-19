"use client";

import { useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";

import type { OfflineTill } from "../offline/useOfflineTill";

function timeOf(value: string | null): string {
  if (!value) return "belum pernah";
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleString("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * THIS DEVICE AS A TILL (POS offline mode, 19 October 2026), inside Pengaturan
 * Kasir.
 *
 * Registering is what gives the device its code — the K1 every sale it makes
 * carries in its number — and what lets it sell offline. It is a supervisor's
 * one-time step (`posTransactions:manageDevices`); a cashier sees the device's
 * name and code, or a sentence saying who to ask.
 */
export function PosDeviceSection({ till }: { till: OfflineTill }) {
  const { can } = usePermissions();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { device, deviceRejected, snapshot } = till.state;

  async function register() {
    setBusy(true);
    setError(null);
    try {
      const created = await till.register(name.trim() || null);
      swalToast(`Perangkat terdaftar sebagai ${created.branchCode}-${created.code}.`);
      setName("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ? `${err.message} — ${err.reason}` : err.message)
          : "Perangkat gagal didaftarkan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      const fresh = await till.refreshSnapshot();
      swalToast(fresh ? "Data offline diperbarui." : "Data offline gagal diperbarui.", fresh ? "success" : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-base font-bold">Perangkat kasir &amp; mode offline</h3>

      {error && <Alert variant="error">{error}</Alert>}

      {device ? (
        <>
          <p className="text-sm">
            Perangkat ini terdaftar sebagai{" "}
            <span className="font-semibold tabular-nums">
              {device.branchCode ? `${device.branchCode}-` : ""}
              {device.code}
            </span>
            {device.name ? ` (${device.name})` : ""}. Nomor transaksinya memakai
            kode ini, online maupun offline.
          </p>
          {deviceRejected && <Alert variant="error">{deviceRejected}</Alert>}
          <p className="text-sm text-muted">
            Data offline terakhir diperbarui {timeOf(snapshot.fetchedAt)}
            {snapshot.catalog ? ` · ${snapshot.catalog.items.length} item` : ""}
            {snapshot.customers ? ` · ${snapshot.customers.customers.length} pelanggan` : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || till.connectivity.offline}
              onClick={() => void refresh()}
            >
              {busy && <Spinner />}
              Perbarui data offline
            </Button>
          </div>
        </>
      ) : can("posTransactions", "manageDevices") ? (
        <>
          <p className="text-sm text-muted">
            Daftarkan perangkat ini supaya kasir tetap bisa berjualan saat
            internet putus. Perangkat akan mendapat kode (K1, K2, …) yang ikut
            tercetak di nomor transaksinya.
          </p>
          <div className="space-y-1">
            <Label htmlFor="device-name">Nama perangkat (opsional)</Label>
            <Input
              id="device-name"
              value={name}
              maxLength={60}
              placeholder="mis. Tablet kasir depan"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy || till.connectivity.offline}
            onClick={() => void register()}
          >
            {busy && <Spinner />}
            Daftarkan perangkat ini
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted">
          Perangkat ini belum didaftarkan, jadi belum bisa berjualan saat
          offline. Minta supervisor login di perangkat ini lalu daftarkan dari
          Pengaturan Kasir.
        </p>
      )}
    </div>
  );
}
