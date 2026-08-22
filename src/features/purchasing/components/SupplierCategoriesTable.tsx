"use client";

import { useState } from "react";
import Link from "next/link";
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
import { supplierCategoryService } from "@/services/supplierCategory.service";
import { swalToast } from "@/lib/swal";
import type { SupplierCategory } from "@/types/api";

/** The row action awaiting confirmation, plus the category it targets. */
type PendingAction = {
  kind: "delete" | "restore";
  category: SupplierCategory;
} | null;

/**
 * The supplier-category table and its row actions.
 *
 * Read data arrives as props; the lifecycle actions are owned here because each
 * is local to a row — confirm, call, then ask the parent to refetch. The same
 * shape CategoriesTable uses, so the two screens behave identically.
 *
 * TWO COLUMNS, WHERE THE PRODUCT TABLE HAS THE SAME TWO PLUS A PICTURE AND A
 * PARENT TRAIL. A supplier category is a name and a status; there is no image
 * cell and no trail because the API has neither field. That is the difference
 * this whole feature exists to keep — a form and a table that only ever show
 * what the resource actually holds.
 *
 * EDIT IS A LINK, not a callback the parent turns into a dialog: the row owns
 * its own destination, and a real `<a href>` is what middle-click and "buka di
 * tab baru" need.
 *
 * THE DELETE CONFIRM DOES NOT PROMISE A GUARD. Deleting a product category is
 * refused while products are filed under it, and its dialog says so; nothing
 * references a supplier category yet, so this one says what deleting actually
 * does — the name is freed, the row is restorable — rather than describing a
 * refusal that cannot happen. A server 409 is still shown verbatim if that ever
 * changes.
 */
export function SupplierCategoriesTable({
  categories,
  loading,
  search,
  onChanged,
}: {
  categories: SupplierCategory[];
  loading: boolean;
  /** Active search term, highlighted in the name cell. */
  search?: string;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one LISTED row would render a
  // button, so a read-only role does not get an empty column.
  const rowHasActions = (category: SupplierCategory) =>
    category.deletedAt !== null
      ? can("supplierCategories", "restore")
      : can("supplierCategories", "update") ||
        can("supplierCategories", "delete");
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
      if (kind === "delete") await supplierCategoryService.remove(category._id);
      else await supplierCategoryService.restore(category._id);
      setPending(null);
      onChanged();
      swalToast(kind === "delete" ? "Kategori dihapus." : "Kategori dipulihkan.");
    } catch (error) {
      // `fullMessage`, not `message`. A 409 here is one of two refusals and
      // both put what to do next in `reason` rather than in `message`: a name
      // clash on restore, and — since suppliers gained a category — a delete
      // blocked by the vendors still filed under the label, whose reason
      // carries the COUNT. `message` alone would say "Cannot delete supplier
      // category" and withhold the only actionable part.
      setActionError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && categories.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        Belum ada kategori supplier yang cocok dengan filter ini.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Kategori</TableHead>
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
                              <Can
                                feature="supplierCategories"
                                action="restore"
                              >
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
                                <Can
                                  feature="supplierCategories"
                                  action="update"
                                >
                                  {/* asChild so the menu item IS the link:
                                      Radix would otherwise render a div around
                                      an anchor, and the keyboard activation the
                                      menu provides would not follow the href. */}
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/dashboard/purchasing/supplier-categories/${category._id}`}
                                    >
                                      <Pencil />
                                      Edit
                                    </Link>
                                  </DropdownMenuItem>
                                </Can>
                                <Can
                                  feature="supplierCategories"
                                  action="delete"
                                >
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
              Hapus <strong>{pending.category.name}</strong>? Namanya jadi bebas
              dipakai lagi, dan kategorinya masih bisa dipulihkan. Kalau cuma
              mau berhenti menawarkannya, nonaktifkan saja lewat Edit.
              {/*
                Said up front rather than left to the 409: somebody who has to
                re-file a dozen vendors first would rather know before clicking
                Hapus than after.
              */}{" "}
              Kalau masih ada supplier yang memakai kategori ini, hapusnya
              ditolak — pindahkan dulu supplier-nya.
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
