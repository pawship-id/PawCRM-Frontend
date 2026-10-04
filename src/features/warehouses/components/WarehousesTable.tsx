"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { warehouseService } from "@/services/warehouse.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog, HighlightText } from "@/components";
import { Badge } from "@/components/ui/badge";
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
import type { Warehouse } from "@/types/api";

import { WarehouseStatusBadge } from "./WarehouseStatusBadge";

/** The row action that opens a confirm dialog, plus the warehouse it targets. */
type PendingAction = { kind: "delete" | "restore"; warehouse: Warehouse } | null;

/**
 * The warehouse list table (shadcn/ui Table) with its row actions.
 *
 * Read data flows in via props (from useWarehouses); the lifecycle actions
 * (delete, restore) are owned here because they are local to a row: each opens a
 * ConfirmDialog, calls the matching service method, and then asks the parent to
 * refetch via `onChanged`. Edit is a plain link to the per-warehouse route.
 * Mirrors BranchesTable.
 *
 * Two things it does that BranchesTable does not, both because a warehouse has
 * state a branch has not:
 *  - the branch column renders a NAME resolved by the parent, since the API
 *    returns `defaultBranchId` unpopulated;
 *  - a warehouse the system auto-created for a branch (`isDefault`) offers no
 *    Delete, because that delete can only ever be refused — see below.
 */
export function WarehousesTable({
  warehouses,
  loading,
  onChanged,
  search,
  branchName,
}: {
  warehouses: Warehouse[];
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells (name, address, PIC). */
  search?: string;
  /** Resolves `defaultBranchId` to a display name; null for an unassigned one. */
  branchName: (id: string | null) => string | null;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // A branch must always keep a stock location, so the backend refuses to delete
  // its default warehouse — unconditionally, whatever else is true of it.
  // Offering a button whose only outcome is a 409 is worse than not offering it;
  // the "Bawaan cabang" badge carries the explanation instead.
  const canDelete = (warehouse: Warehouse) =>
    !warehouse.isDefault && can("warehouses", "delete");

  // Show the Actions column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on (deleted rows → Restore) but not while it is off. Mirrors the
  // per-button gating below.
  const rowHasActions = (warehouse: Warehouse) =>
    warehouse.deletedAt !== null
      ? can("warehouses", "restore")
      : can("warehouses", "update") || canDelete(warehouse);
  const showActions = warehouses.some(rowHasActions);

  function closeDialog() {
    if (busy) return;
    setPending(null);
    setActionError(null);
  }

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      const { kind, warehouse } = pending;
      if (kind === "delete") await warehouseService.remove(warehouse._id);
      else await warehouseService.restore(warehouse._id);
      setPending(null);
      onChanged();
      swalToast(
        kind === "delete" ? "Gudang dihapus." : "Gudang dipulihkan.",
      );
    } catch (error) {
      setActionError(
        // fullMessage, not message: the delete guards put the actionable half
        // ("still holds stock for 3 product(s)…") in the reason.
        error instanceof ApiError
          ? error.fullMessage
          : "Ada yang tidak beres. Coba lagi, ya.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && warehouses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        Tidak ada gudang yang cocok dengan filter ini.
        <br />
        Coba ubah filternya, atau reset untuk melihat semuanya.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Cabang</TableHead>
              <TableHead>Alamat</TableHead>
              <TableHead>PIC</TableHead>
              <TableHead>Status</TableHead>
              {showActions && (
                <TableHead className="text-right">Aksi</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {warehouses.map((warehouse) => {
              const deleted = warehouse.deletedAt !== null;
              const branch = branchName(warehouse.defaultBranchId);
              return (
                <TableRow key={warehouse._id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        <HighlightText text={warehouse.name} query={search} />
                      </span>
                      {warehouse.isDefault && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-tint-neutral text-muted"
                          title="Dibuat bersama cabangnya. Tiap cabang wajib punya satu tempat stok, jadi gudang ini tidak bisa dihapus — nonaktifkan saja."
                        >
                          Bawaan cabang
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted">
                      {/* No branch is a real configuration, not missing data: a
                          central warehouse serves every branch and belongs to
                          none. */}
                      {branch ?? "Pusat (tanpa cabang)"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted">
                      {warehouse.address ? (
                        <HighlightText text={warehouse.address} query={search} />
                      ) : (
                        "—"
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {warehouse.picName ? (
                      <div className="text-muted">
                        <HighlightText text={warehouse.picName} query={search} />
                        {warehouse.picPhone && (
                          <div className="text-xs">{warehouse.picPhone}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <WarehouseStatusBadge
                      isActive={warehouse.isActive}
                      deleted={deleted}
                    />
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {deleted ? (
                          <Can feature="warehouses" action="restore">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPending({ kind: "restore", warehouse })
                              }
                            >
                              <RotateCcw className="size-4" />
                              Pulihkan
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can feature="warehouses" action="update">
                              <Button variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/dashboard/pengaturan/gudang/${warehouse._id}`}
                                >
                                  <Pencil className="size-4" />
                                  Ubah
                                </Link>
                              </Button>
                            </Can>
                            {canDelete(warehouse) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                onClick={() =>
                                  setPending({ kind: "delete", warehouse })
                                }
                              >
                                <Trash2 className="size-4" />
                                Hapus
                              </Button>
                            )}
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

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === "delete" ? "Hapus gudang" : "Pulihkan gudang"
          }
          confirmLabel={pending.kind === "delete" ? "Hapus" : "Pulihkan"}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Hapus <strong>{pending.warehouse.name}</strong>? Gudang ini akan
              hilang dari daftar dan namanya bisa dipakai lagi. Gudang yang masih
              menyimpan stok atau punya riwayat mutasi tidak bisa dihapus —
              nonaktifkan saja.
            </>
          ) : (
            <>
              Pulihkan <strong>{pending.warehouse.name}</strong>? Bisa gagal
              kalau namanya sudah dipakai gudang lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
