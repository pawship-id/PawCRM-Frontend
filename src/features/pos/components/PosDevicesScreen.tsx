"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Breadcrumb, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { posOfflineService } from "@/services/posOffline.service";
import type { PosDevice } from "@/types/posOffline";

function timeOf(value: string | null): string {
  if (!value) return "—";
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * PENGATURAN › PERANGKAT KASIR (POS offline mode, 19 October 2026).
 *
 * Every registered till, by branch: its code, its name, when it last checked
 * in and how many sales it said it was still holding. A device is REGISTERED
 * from the till itself (Pengaturan Kasir, signed in on that device); here it is
 * renamed or switched off. A switched-off device can no longer number or sync
 * sales — the step for a tablet that was lost or replaced.
 */
export function PosDevicesScreen() {
  const { can } = usePermissions();
  const mayManage = can("posTransactions", "manageDevices");
  const [devices, setDevices] = useState<PosDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDevices(await posOfflineService.listDevices());
    } catch {
      setError("Daftar perangkat tidak bisa dimuat. Coba lagi.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(device: PosDevice, input: { name?: string; isActive?: boolean }) {
    setBusyId(device._id);
    try {
      await posOfflineService.updateDevice(device._id, input);
      setEditing(null);
      swalToast(input.isActive === false ? `${device.name ?? device.code} dinonaktifkan.` : "Perangkat disimpan.");
      await load();
    } catch (err) {
      swalToast(err instanceof ApiError ? err.message : "Gagal menyimpan. Coba lagi.", "error", 6000);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Pengaturan", href: "/dashboard/settings/general" },
            { label: "Perangkat kasir" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">Perangkat kasir</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Tablet atau komputer yang dipakai berjualan. Kodenya (K1, K2, …) ikut
          tercetak di nomor transaksi. Perangkat didaftarkan dari layar Kasir di
          perangkat itu sendiri — Pengaturan Kasir › Daftarkan perangkat ini.
        </p>
        {can("posTransactions", "reviewOffline") && (
          <p className="mt-2 text-sm">
            <Link className="font-semibold text-primary underline" href="/dashboard/pos/needs-review">
              Lihat transaksi offline yang perlu dicek →
            </Link>
          </p>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {devices === null && !error ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat perangkat…
        </div>
      ) : devices && devices.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Belum ada perangkat terdaftar. Buka Kasir di tablet yang dipakai
          berjualan, lalu daftarkan dari Pengaturan Kasir →
        </p>
      ) : devices ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cabang</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Terakhir aktif</TableHead>
                <TableHead className="text-right">Belum terkirim</TableHead>
                {mayManage && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device._id}>
                  <TableCell>{device.branchName ?? "—"}</TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {device.branchCode ? `${device.branchCode}-` : ""}
                    {device.code}
                  </TableCell>
                  <TableCell>
                    {editing?.id === device._id ? (
                      <Input
                        autoFocus
                        aria-label="Nama perangkat"
                        value={editing.name}
                        maxLength={60}
                        onChange={(event) => setEditing({ id: device._id, name: event.target.value })}
                      />
                    ) : (
                      (device.name ?? "—")
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        device.isActive ? "bg-tint-success text-success" : "bg-tint-neutral text-muted"
                      }`}
                    >
                      {device.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{timeOf(device.lastSeenAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{device.pendingCount}</TableCell>
                  {mayManage && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {editing?.id === device._id ? (
                          <>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                              Batal
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === device._id || !editing.name.trim()}
                              onClick={() => void save(device, { name: editing.name.trim() })}
                            >
                              Simpan
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditing({ id: device._id, name: device.name ?? "" })}
                            >
                              Ubah nama
                            </Button>
                            <Button
                              type="button"
                              variant={device.isActive ? "destructive" : "secondary"}
                              size="sm"
                              disabled={busyId === device._id}
                              onClick={() => void save(device, { isActive: !device.isActive })}
                            >
                              {device.isActive ? "Nonaktifkan" : "Aktifkan"}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
