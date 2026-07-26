"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { roleService } from "@/services/role.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog } from "@/components";
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
import type { Role } from "@/types/api";

import { RoleStatusBadge } from "./RoleStatusBadge";
import { countGrantedActions } from "../permissions";

/** A short human summary of a role's grants for the Permissions column. */
function permissionsSummary(role: Role): string {
  if (role.isSuperAdmin) return "Full access";
  const features = role.permissions.length;
  if (features === 0) return "No permissions";
  const actions = countGrantedActions(role.permissions);
  return `${features} feature${features === 1 ? "" : "s"} · ${actions} action${
    actions === 1 ? "" : "s"
  }`;
}

/** The row action that opens a confirm dialog, plus the role it targets. */
type PendingAction = { kind: "delete" | "restore"; role: Role } | null;

/**
 * The role list table (shadcn/ui Table) with its row actions.
 *
 * Read data flows in via props (from useRoles); the lifecycle actions (delete,
 * restore) are owned here because they are local to a row: each opens a
 * ConfirmDialog, calls the matching service method, then asks the parent to
 * refetch via `onChanged`. Edit is a plain link to the per-role route. Delete is
 * hidden for system roles — the backend refuses it (403), so the UI does not
 * offer it; a role still assigned to a user returns a 409 that surfaces inline.
 */
export function RolesTable({
  roles,
  loading,
  onChanged,
}: {
  roles: Role[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on (deleted rows → Restore) but not while it is off (live rows
  // → Edit/Delete). Delete is offered only for non-system roles, mirroring the
  // per-button gating below.
  const rowHasActions = (role: Role) =>
    role.deletedAt != null
      ? can("roles", "restore")
      : can("roles", "update") || (!role.isSystem && can("roles", "delete"));
  const showActions = roles.some(rowHasActions);

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
      const { kind, role } = pending;
      if (kind === "delete") await roleService.remove(role._id);
      else await roleService.restore(role._id);
      setPending(null);
      onChanged();
      swalToast(kind === "delete" ? "Role deleted." : "Role restored.");
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && roles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        No roles match the current filters.
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
              <TableHead>Permissions</TableHead>
              <TableHead>Type</TableHead>
              {showActions && (
                <TableHead className="text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => {
              const deleted = role.deletedAt != null;
              return (
                <TableRow key={role._id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {role.name}
                    </div>
                    {role.description && (
                      <div className="text-xs text-muted-foreground">
                        {role.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{permissionsSummary(role)}</TableCell>
                  <TableCell>
                    <RoleStatusBadge role={role} />
                  </TableCell>
                  {showActions && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {deleted ? (
                        <Can feature="roles" action="restore">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPending({ kind: "restore", role })
                            }
                          >
                            <RotateCcw className="size-4" />
                            Restore
                          </Button>
                        </Can>
                      ) : (
                        <>
                          <Can feature="roles" action="update">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/dashboard/master/roles/${role._id}`}>
                                <Pencil className="size-4" />
                                Edit
                              </Link>
                            </Button>
                          </Can>
                          {!role.isSystem && (
                            <Can feature="roles" action="delete">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                onClick={() =>
                                  setPending({ kind: "delete", role })
                                }
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </Button>
                            </Can>
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
          title={pending.kind === "delete" ? "Delete role" : "Restore role"}
          confirmLabel={pending.kind === "delete" ? "Delete" : "Restore"}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Delete <strong>{pending.role.name}</strong>? It will be hidden and
              can be restored later. A role still assigned to a user cannot be
              deleted.
            </>
          ) : (
            <>
              Restore <strong>{pending.role.name}</strong>? This may fail if
              another role has since taken its name.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
