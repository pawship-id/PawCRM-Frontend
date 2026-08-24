"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/services/api-error";
import { categoryService } from "@/services/category.service";
import { TOP_LEVEL_ONLY } from "@/types/api";
import type { Category } from "@/types/api";

/**
 * The value the trigger shows for "this is a top-level category".
 *
 * A REAL OPTION RATHER THAN AN EMPTY ONE. Radix Select forbids `value=""`, and
 * beyond that "kategori induk" is a genuine choice a user makes rather than a
 * field they left blank — an empty picker would read as unanswered.
 */
const NONE = "__none__";

/** Matches the API's list cap; a tenant's label set fits in one page. */
const PAGE_SIZE = 100;

/**
 * Picks which category this one sits under, if any.
 *
 * ONE CONTROL FOR A BINARY PLUS A CHOICE. "Is this a parent or a
 * sub-category?" and "which parent?" are the same question asked twice — a
 * radio pair followed by a select would make the user answer the first, watch a
 * second control appear, and answer it again. The first option IS the top-level
 * answer.
 *
 * IT OFFERS TOP-LEVEL CATEGORIES ONLY, because the tree is two deep: a
 * sub-category cannot hold sub-categories of its own. Fetched with
 * `parentId: TOP_LEVEL_ONLY` rather than filtered client-side, so the list is
 * the same set the API would accept — a picker that offers what the save
 * refuses is the failure this exists to prevent.
 *
 * RETIRED PARENTS ARE OFFERED, and this is deliberate rather than an oversight:
 * `isActive` retires a label for NEW PRODUCTS, and filing a sub-category under
 * a retired parent is how a shop reorganises a line it has paused. The API
 * takes the same view.
 *
 * TWO REASONS THE WHOLE FIELD LOCKS, and they are different enough that the
 * copy names which one applies:
 *   this category has children — it is already a parent, and a parent cannot
 *                                become a child without making the tree three
 *                                deep. The API refuses it with a 409.
 *   there are no other roots   — the first category a tenant ever creates has
 *                                nothing to sit under.
 */
export function CategoryParentField({
  value,
  onChange,
  /** Absent when creating. Excluded from the options — nothing is its own parent. */
  categoryId,
  /** How many sub-categories this one already holds. 0 when creating. */
  childCount,
  disabled = false,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  categoryId?: string;
  childCount: number;
  disabled?: boolean;
}) {
  const [roots, setRoots] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    categoryService
      .list({ parentId: TOP_LEVEL_ONLY, limit: PAGE_SIZE, sort: "nameAsc" })
      .then((result) => {
        if (active) setRoots(result.items);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Daftar kategori induk tidak bisa dimuat.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  // Nothing is its own parent. Filtered here rather than asked of the API,
  // which has no "except this one" parameter and should not grow one for a
  // list of tens of rows.
  const options = (roots ?? []).filter((root) => root._id !== categoryId);

  const isParent = childCount > 0;
  const noRoots = roots !== null && options.length === 0;
  const locked = disabled || isParent || noRoots;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="category-parent">Induk kategori</Label>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : roots === null ? (
        <div className="flex h-11 items-center gap-2 text-sm text-muted">
          <Spinner size={16} /> Memuat kategori induk…
        </div>
      ) : (
        <Select
          value={value ?? NONE}
          onValueChange={(next) => onChange(next === NONE ? null : next)}
          disabled={locked}
        >
          {/* shadcn's SelectTrigger defaults to w-fit, which collapses in a
              form column — the same note ShippingFieldsCard carries. */}
          <SelectTrigger id="category-parent" size="lg" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Tidak ada — kategori induk</SelectItem>
            {options.map((root) => (
              <SelectItem key={root._id} value={root._id}>
                {root.name}
                {!root.isActive && " (nonaktif)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <p className="text-xs text-muted">
        {isParent
          ? `Kategori ini sudah punya ${childCount} sub-kategori, jadi tidak bisa dijadikan sub-kategori juga. Pindahkan dulu isinya kalau mau diubah.`
          : noRoots
            ? "Belum ada kategori lain yang bisa jadi induk. Kategori ini otomatis jadi kategori induk."
            : "Kosongkan kalau ini kategori induk. Kedalaman maksimal dua tingkat — sub-kategori tidak bisa punya sub-kategori lagi."}
      </p>
    </div>
  );
}
