"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw, Lock } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { userService } from "@/services/user.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog, HighlightText } from "@/components";
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
import type { User } from "@/types/api";

import { StatusBadge } from "./StatusBadge";

/** A user is locked when lockedUntil is set to a still-future instant. */
function isLocked(user: User): boolean {
  if (!user.lockedUntil) return false;
  const until = new Date(user.lockedUntil).getTime();
  return !Number.isNaN(until) && until > Date.now();
}

function branchScope(user: User): string {
  if (user.allBranches) return "Semua cabang";
  const count = user.branchAccess.length;
  if (count === 0) return "Belum ada cabang";
  return `${count} cabang`;
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
  search,
}: {
  users: User[];
  roleNames: Record<string, string>;
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells (name, email). */
  search?: string;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on (deleted rows → Restore) but not while it is off (live rows
  // → Edit/Delete/Unlock). Unlock is offered only for a locked live user,
  // mirroring the per-button gating below.
  const rowHasActions = (user: User) => {
    if (user.deletedAt !== null) return can("users", "restore");
    return (
      can("users", "update") ||
      can("users", "delete") ||
      (isLocked(user) && can("users", "unlock"))
    );
  };
  const showActions = users.some(rowHasActions);

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
          ? "Pengguna dihapus."
          : kind === "restore"
            ? "Pengguna dipulihkan."
            : "Kunci akun dibuka.",
      );
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        Tidak ada pengguna yang cocok dengan filter ini.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Akses cabang</TableHead>
              <TableHead>Status</TableHead>
              {showActions && (
                <TableHead className="text-right">Aksi</TableHead>
              )}
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
                      <HighlightText text={user.fullName} query={search} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <HighlightText text={user.email} query={search} />
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
                          title="Akun terkunci"
                          className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger"
                        >
                          <Lock className="size-3" />
                          Terkunci
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {showActions && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {deleted ? (
                        <Can feature="users" action="restore">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPending({ kind: "restore", user })
                            }
                          >
                            <RotateCcw className="size-4" />
                            Pulihkan
                          </Button>
                        </Can>
                      ) : (
                        <>
                          {locked && (
                            <Can feature="users" action="unlock">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setPending({ kind: "unlock", user })
                                }
                              >
                                <Lock className="size-4" />
                                Buka kunci
                              </Button>
                            </Can>
                          )}
                          <Can feature="users" action="update">
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                href={`/dashboard/settings/users/${user._id}`}
                              >
                                <Pencil className="size-4" />
                                Ubah
                              </Link>
                            </Button>
                          </Can>
                          <Can feature="users" action="delete">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:bg-danger/10 hover:text-danger"
                              onClick={() =>
                                setPending({ kind: "delete", user })
                              }
                            >
                              <Trash2 className="size-4" />
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

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === "delete"
              ? "Hapus pengguna"
              : pending.kind === "restore"
                ? "Pulihkan pengguna"
                : "Buka kunci akun"
          }
          confirmLabel={
            pending.kind === "delete"
              ? "Hapus"
              : pending.kind === "restore"
                ? "Pulihkan"
                : "Buka kunci"
          }
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Hapus <strong>{pending.user.fullName}</strong>? Akunnya dinonaktifkan
              dan disembunyikan. Anda bisa memulihkannya nanti.
            </>
          ) : pending.kind === "restore" ? (
            <>
              Pulihkan <strong>{pending.user.fullName}</strong>? Bisa gagal kalau
              emailnya sudah dipakai akun lain.
            </>
          ) : (
            <>
              Buka kunci login untuk{" "}
              <strong>{pending.user.fullName}</strong>?
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
