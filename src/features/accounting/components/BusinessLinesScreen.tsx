"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  Alert,
  Breadcrumb,
  Card,
  ConfirmDialog,
  FilterBar,
  FilterSearch,
  Spinner,
} from "@/components";
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
import { businessLineService } from "@/services/businessLine.service";
import type { BusinessLine } from "@/services/businessLine.service";
import { swalToast } from "@/lib/swal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { useBusinessLines } from "../hooks/useBusinessLines";
import { BusinessLineFormDialog } from "./BusinessLineFormDialog";

/** Which dialog is open: none, create, or edit that line. */
type DialogState =
  | { mode: "create" }
  | { mode: "edit"; line: BusinessLine }
  | null;

/**
 * Keuangan → Lini Bisnis: the units of the business whose profit is read apart.
 *
 * IT LIVES IN KEUANGAN, NOT IN MASTER DATA. A line of business is not a label on
 * the catalogue — it is a column of the profit and loss, and the screen that
 * assigns it is the chart of accounts, one menu entry above this one. Keeping
 * both here means "why is Grooming's margin empty" is answerable without leaving
 * the module.
 *
 * NO PAGINATION AND NO STATUS FILTER, unlike Kategori. A tenant runs three or
 * four lines; a list that fits on one screen is what makes "is this name taken"
 * answerable by looking. Search is here because a keyboard beats the eye once
 * the list is more than a handful.
 */
export function BusinessLinesScreen() {
  const { lines, total, query, loading, error, setQuery, refetch } =
    useBusinessLines();
  const { can } = usePermissions();

  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDelete, setPendingDelete] = useState<BusinessLine | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const showActions =
    can("businessLines", "update") || can("businessLines", "delete");

  async function runDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setActionError(null);
    try {
      await businessLineService.remove(pendingDelete._id);
      setPendingDelete(null);
      refetch();
      swalToast("Lini bisnis dihapus.");
    } catch (err) {
      // Verbatim: the 409 names how many products or accounts are in the way,
      // which is the one number that says what to do next.
      setActionError(
        err instanceof ApiError ? err.message : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[ACCOUNTING_CRUMBS.hub, { label: "Lini Bisnis" }]} />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Lini Bisnis
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Unit usaha yang laba ruginya dibaca terpisah — Grooming, Penitipan,
          Retail. Lini dipasang ke akun di Daftar Akun, jadi setiap posting ke
          akun itu ikut lininya.
        </p>
      </div>

      <FilterBar
        searchPlacement="leading"
        searchClassName="min-w-[12rem] flex-1"
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => setQuery({ search })}
            placeholder="Cari lini bisnis…"
            ariaLabel="Cari lini bisnis"
            fill
          />
        }
        actions={
          <Can feature="businessLines" action="create">
            <Button onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-4" aria-hidden />
              Lini bisnis baru
            </Button>
          </Can>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && lines.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat lini bisnis…
        </div>
      ) : lines.length === 0 ? (
        <Card>
          <p className="text-center font-semibold text-foreground">
            {query.search
              ? "Tidak ada lini bisnis yang cocok."
              : "Belum ada lini bisnis."}
          </p>
          <p className="mt-1 text-center text-sm text-muted">
            {query.search
              ? "Coba kata kunci lain."
              : "Buat yang pertama — misalnya Grooming — lalu pasang ke akunnya di Daftar Akun."}
          </p>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <Table className={loading ? "opacity-60" : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Warna</TableHead>
                  {showActions && (
                    <TableHead className="text-right">Aksi</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line._id}>
                    <TableCell className="font-medium text-foreground">
                      {line.name}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        {/*
                          The swatch carries nothing on its own — the hex beside
                          it is what a reader checks against a palette, and
                          colour alone is never the whole answer (§1.3).
                        */}
                        <span
                          aria-hidden
                          style={{ backgroundColor: line.color }}
                          className="size-4 rounded-full border border-border"
                        />
                        <span className="text-xs text-muted uppercase tabular-nums">
                          {line.color}
                        </span>
                      </span>
                    </TableCell>
                    {showActions && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Can feature="businessLines" action="update">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDialog({ mode: "edit", line })}
                            >
                              <Pencil className="size-4" aria-hidden />
                              Ubah
                            </Button>
                          </Can>
                          <Can feature="businessLines" action="delete">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDelete(line)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                              Hapus
                            </Button>
                          </Can>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted">{total} lini bisnis.</p>
        </>
      )}

      {dialog && (
        <BusinessLineFormDialog
          key={dialog.mode === "edit" ? dialog.line._id : "create"}
          line={dialog.mode === "edit" ? dialog.line : undefined}
          onClose={() => setDialog(null)}
          onSaved={refetch}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Hapus lini bisnis ${pendingDelete.name}?`}
          confirmLabel="Hapus"
          destructive
          busy={busy}
          error={actionError}
          onConfirm={runDelete}
          onCancel={() => {
            if (busy) return;
            setPendingDelete(null);
            setActionError(null);
          }}
        >
          {/*
            THE REFUSAL IS THE NORMAL OUTCOME for a line anybody actually uses,
            so it is stated up front rather than met as an error afterwards.
          */}
          Akun atau produk yang masih memakai lini ini akan menahan
          penghapusan. Lepas dulu lininya di akun-akun itu.
        </ConfirmDialog>
      )}
    </div>
  );
}
