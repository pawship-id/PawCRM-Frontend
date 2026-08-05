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
  // the "Default" badge carries the explanation instead.
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
        kind === "delete" ? "Warehouse deleted." : "Warehouse restored.",
      );
    } catch (error) {
      setActionError(
        // fullMessage, not message: the delete guards put the actionable half
        // ("still holds stock for 3 product(s)…") in the reason.
        error instanceof ApiError
          ? error.fullMessage
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && warehouses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        No warehouses match the current filters.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>PIC</TableHead>
              <TableHead>State</TableHead>
              {showActions && (
                <TableHead className="text-right">Actions</TableHead>
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
                          className="border-transparent bg-muted/40 text-muted"
                          title="Created with its branch. Every branch must keep one stock location, so this warehouse cannot be deleted — deactivate it instead."
                        >
                          Default
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {/* No branch is a real configuration, not missing data: a
                          central warehouse serves every branch and belongs to
                          none. */}
                      {branch ?? "Central (no branch)"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {warehouse.address ? (
                        <HighlightText text={warehouse.address} query={search} />
                      ) : (
                        "—"
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {warehouse.picName ? (
                      <div className="text-muted-foreground">
                        <HighlightText text={warehouse.picName} query={search} />
                        {warehouse.picPhone && (
                          <div className="text-xs">{warehouse.picPhone}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
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
                              Restore
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can feature="warehouses" action="update">
                              <Button variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/dashboard/master/warehouses/${warehouse._id}`}
                                >
                                  <Pencil className="size-4" />
                                  Edit
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
                                Delete
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
            pending.kind === "delete" ? "Delete warehouse" : "Restore warehouse"
          }
          confirmLabel={pending.kind === "delete" ? "Delete" : "Restore"}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Delete <strong>{pending.warehouse.name}</strong>? It will be hidden
              from the list and its name freed for reuse. A warehouse that still
              holds stock or has movement history cannot be deleted — deactivate
              it instead.
            </>
          ) : (
            <>
              Restore <strong>{pending.warehouse.name}</strong>? This may fail if
              its name has since been taken by another warehouse.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
