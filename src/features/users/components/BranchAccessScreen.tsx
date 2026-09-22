"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Alert, Pagination, Spinner } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/features/permissions";
import { SettingsPageHeader } from "@/features/settings/components/SettingsHeader";
import { SETTINGS_PATHS } from "@/features/settings/paths";
import type { User } from "@/types/api";

import { useLookups } from "../hooks/useLookups";
import { useUsers } from "../hooks/useUsers";

/**
 * Pengaturan › Akses cabang — which branches each person can see, by name
 * (mockup `buloo-navigation-v3`, 22 September 2026).
 *
 * READ-ONLY, AND NOT A SECOND EDITOR. Access is set on the person's own form
 * (`BranchScopeField`), where it sits beside the role and the warehouses it
 * governs; the Ubah on each row goes there. What this page adds over the user
 * list is the NAMES — that list says "2 cabang", which answers "how many" when
 * the question somebody opens this with is "who can see Pawship Barat".
 *
 * Deleted users are left out: a closed account sees nothing, whatever its
 * scope says.
 */
export function BranchAccessScreen() {
  const { users, pagination, loading, error, setQuery } = useUsers();
  const { roles, branches } = useLookups();

  const roleName = useMemo(
    () => new Map(roles.map((role) => [role._id, role.name])),
    [roles],
  );
  const branchName = useMemo(
    () => new Map(branches.map((branch) => [branch._id, branch.name])),
    [branches],
  );

  function scope(user: User): string {
    if (user.allBranches) return "Semua cabang";
    if (user.branchAccess.length === 0) return "Belum ada cabang";
    return user.branchAccess
      .map((id) => branchName.get(id) ?? "Cabang terhapus")
      .join(", ");
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="sistem"
        title="Akses cabang"
        description="Cabang mana yang datanya terlihat oleh tiap pengguna. Cabang di luar akses tidak muncul sebagai pilihan sama sekali. Diubah dari profil penggunanya masing-masing."
      />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && users.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat pengguna…
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Aksi</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell>
                      <div className="font-semibold text-foreground">
                        {user.fullName}
                      </div>
                      <div className="text-xs text-muted">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      {user.roleId ? (roleName.get(user.roleId) ?? "—") : "—"}
                    </TableCell>
                    <TableCell>{scope(user)}</TableCell>
                    <TableCell className="text-right">
                      <Can feature="users" action="update">
                        <Link
                          href={`${SETTINGS_PATHS.pengguna}/${user._id}`}
                          className="rounded-md px-2 py-1 text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          Ubah
                        </Link>
                      </Can>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="pengguna"
            unitPlural="pengguna"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
