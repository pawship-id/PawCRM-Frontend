"use client";

import { useState } from "react";
import { EllipsisVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { ConfirmDialog, HighlightText } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { categoryService } from "@/services/category.service";
import { swalToast } from "@/lib/swal";
import type { Category } from "@/types/api";

/** The row action awaiting confirmation, plus the category it targets. */
type PendingAction = { kind: "delete" | "restore"; category: Category } | null;

/**
 * The category table and its row actions.
 *
 * Read data arrives as props; the lifecycle actions are owned here because each
 * is local to a row — confirm, call, then ask the parent to refetch. Rename is
 * raised to the parent instead, since it opens the same dialog the create button
 * does and only one of those may be open at a time.
 *
 * THE DELETE GUARD IS THE POINT OF THE CONFIRM COPY. The backend refuses to
 * delete a category while any live product is still filed under it, and answers
 * with the count. That refusal is the normal outcome for a category anybody
 * actually uses, so the dialog says so up front rather than letting the user
 * discover it as an error — and the server's message, which names the count, is
 * shown verbatim when it happens.
 */
export function CategoriesTable({
  categories,
  loading,
  search,
  onChanged,
  onEdit,
}: {
  categories: Category[];
  loading: boolean;
  /** Active search term, highlighted in the name cell. */
  search?: string;
  onChanged: () => void;
  onEdit: (category: Category) => void;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one LISTED row would render a
  // button, so a read-only role does not get an empty column — the same
  // per-row reasoning BranchesTable applies.
  const rowHasActions = (category: Category) =>
    category.deletedAt !== null
      ? can("categories", "restore")
      : can("categories", "update") || can("categories", "delete");
  const showActions = categories.some(rowHasActions);

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
      const { kind, category } = pending;
      if (kind === "delete") await categoryService.remove(category._id);
      else await categoryService.restore(category._id);
      setPending(null);
      onChanged();
      swalToast(kind === "delete" ? "Kategori dihapus." : "Kategori dipulihkan.");
    } catch (error) {
      // Shown verbatim: the 409 names how many products are in the way, which
      // is the one number that tells the user what to do next.
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && categories.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        Belum ada kategori yang cocok dengan filter ini.
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
              <TableHead>Status</TableHead>
              {showActions && (
                <TableHead className="text-right">Aksi</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => {
              const deleted = category.deletedAt !== null;
              return (
                <TableRow key={category._id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      <HighlightText text={category.name} query={search} />
                    </div>
                  </TableCell>
                  <TableCell>
                    {/*
                      Three states, and deleted outranks retired: a deleted
                      category may well also be inactive, and saying "Nonaktif"
                      about a row that is gone from every ordinary read answers
                      the less important half of the question.
                    */}
                    {deleted ? (
                      <Badge variant="outline" className="text-muted">
                        Dihapus
                      </Badge>
                    ) : category.isActive ? (
                      <Badge variant="outline">Aktif</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted">
                        Nonaktif
                      </Badge>
                    )}
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex items-center justify-end">
                        {/*
                          A KEBAB, like the catalogue's — and gated on the same
                          `rowHasActions` as before, so the trigger never opens
                          onto an empty menu. Unlike the catalogue's it is not
                          rendered unconditionally: a product row always has
                          Detail to offer, and a category has no detail page, so
                          a read-only role here would get a button that does
                          nothing at all.
                        */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              // The icon carries no name of its own, so the
                              // label says which row this menu belongs to — a
                              // screen-reader user hearing twenty identical
                              // "Aksi" buttons has learnt nothing.
                              aria-label={`Aksi untuk ${category.name}`}
                            >
                              <EllipsisVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent>
                            {deleted ? (
                              <Can feature="categories" action="restore">
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setPending({ kind: "restore", category })
                                  }
                                >
                                  <RotateCcw />
                                  Pulihkan
                                </DropdownMenuItem>
                              </Can>
                            ) : (
                              <>
                                <Can feature="categories" action="update">
                                  <DropdownMenuItem
                                    onSelect={() => onEdit(category)}
                                  >
                                    <Pencil />
                                    Edit
                                  </DropdownMenuItem>
                                </Can>
                                <Can feature="categories" action="delete">
                                  {/* Separated and tinted: the item above only
                                      opens a form, and this one writes. */}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() =>
                                      setPending({ kind: "delete", category })
                                    }
                                  >
                                    <Trash2 />
                                    Hapus
                                  </DropdownMenuItem>
                                </Can>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
            pending.kind === "delete" ? "Hapus kategori" : "Pulihkan kategori"
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
              Hapus <strong>{pending.category.name}</strong>? Kategori ini tidak
              bisa dihapus selama masih ada produk yang difilekan di sini —
              pindahkan produknya dulu. Namanya jadi bebas dipakai lagi, dan
              kategorinya masih bisa dipulihkan.
            </>
          ) : (
            <>
              Pulihkan <strong>{pending.category.name}</strong>? Bisa gagal kalau
              namanya sudah keburu dipakai kategori lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
