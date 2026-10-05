"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Alert, ConfirmDialog, Spinner } from "@/components";
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
import { ApiError } from "@/services/api-error";
import { customerTypeService } from "@/services/customerType.service";
import type { CustomerType } from "@/services/customerType.service";

import { useCustomerTypeList } from "../hooks/useCustomerTypeList";
import { CustomerTypeFormDialog } from "./CustomerTypeFormDialog";
import { SettingsPageHeader } from "./SettingsHeader";

type DialogState = { mode: "create" } | { mode: "edit"; type: CustomerType } | null;

/**
 * Pengaturan › Tipe pelanggan — a tenant's own labels for the kind of
 * customer it deals with (24 September 2026, on request).
 *
 * CRUD ON A DIALOG, matching Zona and Lini bisnis: two fields do not earn a
 * page, and the common case is adding Reguler, Reseller and Grosir one after
 * another. Delete is soft and never refused: customers already filed under a
 * deleted type keep its label, so there is nothing to guard — and, with no
 * restore offered, the confirmation says so plainly.
 */
export function CustomerTypesScreen() {
  const { can } = usePermissions();
  const { types, loading, error, refetch } = useCustomerTypeList();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomerType | null>(null);
  const [working, setWorking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const mayCreate = can("customerTypes", "create");
  const mayUpdate = can("customerTypes", "update");
  const mayDelete = can("customerTypes", "delete");
  const showActions = mayUpdate || mayDelete;

  async function confirmDelete() {
    if (!pendingDelete) return;
    setWorking(true);
    setDeleteError(null);
    try {
      await customerTypeService.remove(pendingDelete._id);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.fullMessage : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="umum"
        title="Tipe pelanggan"
        description="Kategori ini menempel di profil pelanggan dan jadi dasar aturan harga khusus."
        action={
          <Can feature="customerTypes" action="create">
            <Button onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-4" aria-hidden />
              Tipe baru
            </Button>
          </Can>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && types.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat tipe pelanggan…
        </div>
      ) : types.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-semibold text-foreground">
            Belum ada tipe pelanggan.
          </p>
          {mayCreate && (
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => setDialog({ mode: "create" })}
            >
              Tambah yang pertama →
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[26%]">Tipe</TableHead>
                <TableHead>Catatan</TableHead>
                {showActions && (
                  <TableHead className="text-right">
                    <span className="sr-only">Aksi</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((type) => (
                <TableRow key={type._id}>
                  <TableCell className="font-bold text-foreground">
                    {type.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted">
                    {type.note ?? "—"}
                  </TableCell>
                  {showActions && (
                    <TableCell className="text-right">
                      {mayUpdate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Ubah ${type.name}`}
                          onClick={() => setDialog({ mode: "edit", type })}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Ubah
                        </Button>
                      )}
                      {mayDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Hapus ${type.name}`}
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(type);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Hapus
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog && (
        <CustomerTypeFormDialog
          key={dialog.mode === "edit" ? dialog.type._id : "create"}
          type={dialog.mode === "edit" ? dialog.type : undefined}
          onClose={() => setDialog(null)}
          onSaved={refetch}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Hapus ${pendingDelete.name}?`}
          confirmLabel="Hapus tipe"
          destructive
          busy={working}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        >
          Tipe ini tidak bisa dipilih lagi untuk pelanggan. Pelanggan yang sudah
          memakainya tetap menampilkan tipe ini.
        </ConfirmDialog>
      )}
    </div>
  );
}
