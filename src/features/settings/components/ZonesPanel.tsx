"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Alert, ConfirmDialog, FilterBar, FilterToggle, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can, usePermissions } from "@/features/permissions";
import { invalidateVariantOptions } from "@/hooks/useVariantOptions";
import { invalidateZones } from "@/hooks/useZones";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { zoneService } from "@/services/zone.service";
import type { Zone } from "@/types/api";

import type { UseZoneListResult } from "../hooks/useZoneList";
import { zoneRangeText } from "../zones";
import { ZoneFormDialog } from "./ZoneFormDialog";

type DialogState = { mode: "create" } | { mode: "edit"; zone: Zone } | null;

/**
 * Zona — one section of Pengaturan › Layanan: the tenant's antar-jemput
 * distance bands, nearest first.
 *
 * CRUD ON A DIALOG, like Tahapan: four fields, and the list staying on screen is
 * what answers "where does the next zone start". Delete is soft; a deleted zone
 * is shown behind the toggle and can be restored, which the server refuses
 * when another zone has since taken its name or its distances.
 */
export function ZonesPanel({
  list,
  intro,
}: {
  list: UseZoneListResult;
  intro?: ReactNode;
}) {
  const { zones, loading, error, refetch: refetchList } = list;

  /* This list, the app-wide one pickers and price grids read, and the card counts. */
  function refetch() {
    refetchList();
    invalidateZones();
    invalidateVariantOptions();
  }
  const { can } = usePermissions();

  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDelete, setPendingDelete] = useState<Zone | null>(null);
  const [working, setWorking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const firstLoad = loading && zones.length === 0;
  const rows = showDeleted ? zones : zones.filter((zone) => zone.deletedAt === null);
  const hiddenDeleted = zones.length - rows.length;
  const showActions = can("services", "update") || can("services", "delete") || can("services", "restore");

  async function confirmDelete() {
    if (!pendingDelete) return;
    setWorking(true);
    setDeleteError(null);
    try {
      await zoneService.remove(pendingDelete._id);
      setPendingDelete(null);
      refetch();
      swalToast("Zona dihapus.");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.fullMessage : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setWorking(false);
    }
  }

  async function restore(zone: Zone) {
    setWorking(true);
    setActionError(null);
    try {
      await zoneService.restore(zone._id);
      refetch();
      swalToast(`${zone.name} dipulihkan.`);
    } catch (err) {
      // `reason` names the zone that took its name or distances meanwhile.
      setActionError(err instanceof ApiError ? err.fullMessage : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {intro}

      <FilterBar
        actions={
          <Can feature="services" action="create">
            <Button onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-4" aria-hidden />
              Tambah zona
            </Button>
          </Can>
        }
      >
        <FilterToggle
          label="Tampilkan yang dihapus"
          checked={showDeleted}
          onChange={setShowDeleted}
        />
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}
      {actionError && <Alert variant="error">{actionError}</Alert>}

      {firstLoad ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat zona…
        </div>
      ) : error && zones.length === 0 ? null : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-semibold text-foreground">Belum ada zona.</p>
          {hiddenDeleted > 0 && (
            <p className="mt-1 text-sm text-muted">
              {hiddenDeleted} zona yang dihapus disembunyikan — nyalakan Tampilkan
              yang dihapus untuk memulihkannya.
            </p>
          )}
          {can("services", "create") && (
            <Button variant="ghost" className="mt-2" onClick={() => setDialog({ mode: "create" })}>
              Tambah yang pertama →
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <Table className={loading ? "opacity-60" : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%]">Zona</TableHead>
                <TableHead className="w-[18%]">Rentang</TableHead>
                <TableHead>Keterangan</TableHead>
                {showActions && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((zone) => {
                const deleted = zone.deletedAt !== null;

                return (
                  <TableRow key={zone._id}>
                    <TableCell>
                      <span className={deleted ? "text-muted" : "font-bold text-foreground"}>
                        {zone.name}
                      </span>
                      {deleted && (
                        <span className="ml-2 rounded-full bg-tint-danger px-2 py-0.5 text-xs font-medium text-danger-ink">
                          Dihapus
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{zoneRangeText(zone)}</TableCell>
                    <TableCell className="text-sm text-muted">
                      {zone.description ?? "—"}
                    </TableCell>
                    {showActions && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {deleted ? (
                            <Can feature="services" action="restore">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={working}
                                onClick={() => void restore(zone)}
                              >
                                <RotateCcw className="size-4" aria-hidden />
                                Pulihkan
                              </Button>
                            </Can>
                          ) : (
                            <>
                              <Can feature="services" action="update">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Ubah ${zone.name}`}
                                  disabled={working}
                                  onClick={() => setDialog({ mode: "edit", zone })}
                                >
                                  <Pencil className="size-4" aria-hidden />
                                  Ubah
                                </Button>
                              </Can>
                              <Can feature="services" action="delete">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Hapus ${zone.name}`}
                                  className="text-muted hover:bg-tint-danger hover:text-danger-ink"
                                  disabled={working}
                                  onClick={() => {
                                    setDeleteError(null);
                                    setPendingDelete(zone);
                                  }}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                  Hapus
                                </Button>
                              </Can>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="max-w-2xl text-sm text-muted">
        Rentang tidak boleh bertabrakan. Jarak minimal ikut zona, jarak maksimal
        tidak — Zona A 1–3 km dan Zona B 3–5 km boleh berdampingan, tapi Zona B
        2–5 km ditolak karena 2 km sudah masuk Zona A.
      </p>

      {dialog && (
        <ZoneFormDialog
          key={dialog.mode === "edit" ? dialog.zone._id : "create"}
          zone={dialog.mode === "edit" ? dialog.zone : undefined}
          zones={zones}
          onClose={() => setDialog(null)}
          onSaved={refetch}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Hapus ${pendingDelete.name}?`}
          confirmLabel="Hapus zona"
          destructive
          busy={working}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        >
          Rentang {zoneRangeText(pendingDelete)} jadi kosong dan bisa dipakai
          zona lain. Zona ini bisa dipulihkan selama rentangnya belum dipakai.
        </ConfirmDialog>
      )}
    </div>
  );
}
