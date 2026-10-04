"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
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
 * another. No delete here, unlike those two — nothing references a type yet,
 * so there is nothing to guard and nothing to offer a restore for. See the
 * model's own note on `deletedAt` for why the field exists regardless.
 *
 * ⚠️ WORKING, NOT USED YET. The callout at the foot says so in the mockup's
 * own words: a type is a label on the customer's profile today, and nothing
 * reads it — no price list, no report. That is the next iteration, not this
 * one.
 */
export function CustomerTypesScreen() {
  const { can } = usePermissions();
  const { types, loading, error, refetch } = useCustomerTypeList();
  const [dialog, setDialog] = useState<DialogState>(null);

  const mayCreate = can("customerTypes", "create");
  const mayUpdate = can("customerTypes", "update");

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
                {mayUpdate && (
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
                  {mayUpdate && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Ubah ${type.name}`}
                        onClick={() => setDialog({ mode: "edit", type })}
                      >
                        <Pencil className="size-4" aria-hidden />
                        Ubah
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-xl border-l-4 border-border border-l-primary bg-surface p-4">
        <p className="font-semibold text-foreground">
          Baru kategori, belum daftar harga
        </p>
        <p className="mt-1 text-sm text-muted">
          Tipe pelanggan sekarang cuma label di profil pelanggan. Daftar harga
          per tipe, dan profil pengiriman yang terpisah dari alamat profil,
          menyusul di iterasi berikutnya.
        </p>
      </div>

      {dialog && (
        <CustomerTypeFormDialog
          key={dialog.mode === "edit" ? dialog.type._id : "create"}
          type={dialog.mode === "edit" ? dialog.type : undefined}
          onClose={() => setDialog(null)}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
