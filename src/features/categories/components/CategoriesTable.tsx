"use client";

import { useState } from "react";
import Link from "next/link";
import {
  EllipsisVertical,
  ImageOff,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";

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
 * is local to a row — confirm, call, then ask the parent to refetch.
 *
 * EDIT IS A LINK, not a callback the parent turns into a dialog. It used to be
 * the latter, because the create button and every row's rename shared one modal
 * slot and only one could be open; both are routes now (see CategoryForm), so
 * the row owns its own destination and the parent no longer holds form state at
 * all. A real `<a href>` is also what middle-click and "buka di tab baru" need.
 *
 * THE TREE IS SHOWN AS A TRAIL, NOT AS AN INDENTED TREE. A tree widget fights
 * pagination — the children of a row on page 2 may be on page 3, and a level
 * that only sometimes shows its contents is worse than a flat list that always
 * says where each row belongs. The parent's name above the row's own is the
 * whole of it, and the Tingkat filter narrows to one level when that is the
 * question.
 *
 * THE PICTURE IS A CELL, NOT A COLUMN OF ITS OWN. It sits inside the name cell
 * as a 40px tile, because a column would be a header with no word for it and an
 * empty rectangle on every category nobody gave a picture to — and most will
 * not have one. Inside the name cell an absent image is a placeholder next to
 * the thing it belongs to, which reads as "this one has no photo" rather than
 * as a broken column. The description sits under the name for the same reason.
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
}: {
  categories: Category[];
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
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        Belum ada kategori yang cocok dengan filter ini.
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
                    <div className="flex items-start gap-3">
                      <div className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-surface-hover">
                        {category.image ? (
                          // A plain img, like MediaGallery's: next/image needs a
                          // remote host configured per storage driver, and the
                          // driver is a per-deployment choice.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={category.image.thumbUrl ?? category.image.url}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <span
                            className="flex size-full items-center justify-center"
                            aria-hidden
                          >
                            <ImageOff className="size-4 text-muted" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        {/*
                          THE PARENT SITS ABOVE THE NAME, as a trail rather than
                          a column. A column would be empty on every top-level
                          row — most of them — and a name with no context is the
                          ambiguity sub-categories were added to remove: two
                          rows both called "Kering" are unreadable without it.

                          Not a link: the row's own Edit already goes to this
                          category, and a second destination in the same cell is
                          two targets a click has to choose between.
                        */}
                        {category.parent && (
                          <div className="truncate text-xs text-muted">
                            {category.parent.name} ›
                          </div>
                        )}
                        <div className="font-medium text-foreground">
                          <HighlightText text={category.name} query={search} />
                        </div>
                        {category.description && (
                          // Clamped to two lines: 500 characters is a paragraph,
                          // and a row that grows to fit one turns the table into
                          // a page nobody can scan. Plain text — the API stores
                          // it as text, never HTML.
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                            {category.description}
                          </p>
                        )}
                      </div>
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
                                  {/* asChild so the menu item IS the link:
                                      Radix would otherwise render a div around
                                      an anchor, and the keyboard activation the
                                      menu provides would not follow the href. */}
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/dashboard/inventory/categories/${category._id}`}
                                    >
                                      <Pencil />
                                      Edit
                                    </Link>
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
