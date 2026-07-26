"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw, Lock } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { userService } from "@/services/user.service";
import { swalToast } from "@/lib/swal";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { User } from "@/types/api";

import { StatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";

/** A user is locked when lockedUntil is set to a still-future instant. */
function isLocked(user: User): boolean {
  if (!user.lockedUntil) return false;
  const until = new Date(user.lockedUntil).getTime();
  return !Number.isNaN(until) && until > Date.now();
}

function branchScope(user: User): string {
  if (user.allBranches) return "All branches";
  const count = user.branchAccess.length;
  if (count === 0) return "No branch";
  return `${count} branch${count === 1 ? "" : "es"}`;
}

/** The row action that opens a confirm dialog, plus the user it targets. */
type PendingAction =
  | { kind: "delete" | "restore" | "unlock"; user: User }
  | null;

/**
 * The user list table (shadcn/ui Table) with its row actions.
 *
 * Read data flows in via props (from useUsers); the destructive/irreversible
 * actions (delete, restore, unlock) are owned here because they are local to a
 * row: each opens a ConfirmDialog, calls the matching service method, and then
 * asks the parent to refetch via `onChanged`. Edit is a plain link to the
 * per-user route. `roleNames` maps roleId -> name for the Role column.
 */
export function UsersTable({
  users,
  roleNames,
  loading,
  onChanged,
}: {
  users: User[];
  roleNames: Record<string, string>;
  loading: boolean;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      const { kind, user } = pending;
      if (kind === "delete") await userService.remove(user._id);
      else if (kind === "restore") await userService.restore(user._id);
      else await userService.unlock(user._id);
      setPending(null);
      onChanged();
      swalToast(
        kind === "delete"
          ? "User deleted."
          : kind === "restore"
            ? "User restored."
            : "User unlocked.",
      );
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

  if (!loading && users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        No users match the current filters.
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
              <TableHead>Role</TableHead>
              <TableHead>Branch access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const deleted = user.deletedAt !== null;
              const locked = isLocked(user);
              return (
                <TableRow key={user._id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {user.fullName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.roleId ? roleNames[user.roleId] ?? "—" : "—"}
                  </TableCell>
                  <TableCell>{branchScope(user)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={user.status} deleted={deleted} />
                      {locked && (
                        <span
                          title="Account locked"
                          className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger"
                        >
                          <Lock className="size-3" />
                          Locked
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {deleted ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPending({ kind: "restore", user })}
                        >
                          <RotateCcw className="size-4" />
                          Restore
                        </Button>
                      ) : (
                        <>
                          {locked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPending({ kind: "unlock", user })
                              }
                            >
                              <Lock className="size-4" />
                              Unlock
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={`/dashboard/master/users/${user._id}`}
                            >
                              <Pencil className="size-4" />
                              Edit
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            onClick={() => setPending({ kind: "delete", user })}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === "delete"
              ? "Delete user"
              : pending.kind === "restore"
                ? "Restore user"
                : "Unlock user"
          }
          confirmLabel={
            pending.kind === "delete"
              ? "Delete"
              : pending.kind === "restore"
                ? "Restore"
                : "Unlock"
          }
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Delete <strong>{pending.user.fullName}</strong>? Their account will
              be deactivated and hidden. You can restore it later.
            </>
          ) : pending.kind === "restore" ? (
            <>
              Restore <strong>{pending.user.fullName}</strong>? This may fail if
              their email address has since been reused.
            </>
          ) : (
            <>
              Clear the login lockout for{" "}
              <strong>{pending.user.fullName}</strong>?
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
