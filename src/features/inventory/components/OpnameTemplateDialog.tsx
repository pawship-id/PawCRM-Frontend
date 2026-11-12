"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import {
  Alert,
  FilterMultiSelect,
  Spinner,
  type FilterOption,
  type TemplateFormat,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { categoryService } from "@/services/category.service";
import type { Category } from "@/types/api";

import { saveOpnameTemplate } from "../utils/opnameImport";

type Scope = "all" | "categories";

const FORMAT_LABEL: Record<TemplateFormat, string> = {
  xlsx: "Excel",
  csv: "CSV",
};

/**
 * WHAT GOES INTO THE OPNAME TEMPLATE — every product the sheet covers, or only
 * the categories picked here (12 November 2026, on request). A big warehouse is
 * counted a few shelves at a time, and a file of three thousand rows somebody
 * only fills forty of is a file nobody can find their rows in.
 *
 * SEVERAL CATEGORIES AT ONCE, and each takes its sub-categories along — the
 * same rule the sheet's own Kategori filter follows, so picking "Makanan" does
 * not quietly leave out "Makanan › Kering".
 *
 * NEVER WIDER THAN THE SHEET. A sheet opened for one category only offers that
 * category and its children here; the server enforces the same bound.
 */
export function OpnameTemplateDialog({
  opnameId,
  format,
  sheetCategoryId,
  onClose,
}: {
  opnameId: string;
  format: TemplateFormat;
  /** The sheet's own `categoryFilter` — null when it covers the warehouse. */
  sheetCategoryId: string | null;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    categoryService
      .list()
      .then((page) => {
        if (!cancelled) setCategories(page.items);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Daftar kategori gagal dimuat.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () => categoryOptions(categories, sheetCategoryId),
    [categories, sheetCategoryId],
  );

  const pickedNames = options
    .filter((option) => picked.includes(option.value))
    .map((option) => option.label);

  const blocked = scope === "categories" && picked.length === 0;

  async function download() {
    setBusy(true);
    try {
      await saveOpnameTemplate(
        opnameId,
        format,
        scope === "categories" ? picked : [],
      );
      onClose();
    } catch (err) {
      // A failed act is a toast (ui-rules §9); the dialog stays so the choice
      // can be changed — "no products in these categories" is the usual one.
      swalToast(
        err instanceof ApiError && err.status === 400
          ? err.message
          : "Gagal menyiapkan template. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Unduh template opname</DialogTitle>
          <DialogDescription>
            Pilih produk yang mau dimasukkan ke file {FORMAT_LABEL[format]}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <RadioGroup
            value={scope}
            onValueChange={(value) => setScope(value as Scope)}
            disabled={busy}
            aria-label="Produk di template"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="all" id="tpl-all" className="mt-0.5" />
              <Label
                htmlFor="tpl-all"
                className="flex flex-col items-start gap-0.5"
              >
                <span>Semua produk</span>
                <span className="text-xs font-normal text-muted">
                  {sheetCategoryId
                    ? "Semua produk di kategori lembar ini."
                    : "Semua produk aktif di gudang ini."}
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem
                value="categories"
                id="tpl-categories"
                className="mt-0.5"
              />
              <Label
                htmlFor="tpl-categories"
                className="flex flex-col items-start gap-0.5"
              >
                <span>Pilih kategori</span>
                <span className="text-xs font-normal text-muted">
                  Boleh lebih dari satu. Sub-kategori ikut masuk.
                </span>
              </Label>
            </div>
          </RadioGroup>

          {scope === "categories" &&
            (loadingCategories ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Memuat kategori…
              </p>
            ) : loadError ? (
              <Alert variant="error">{loadError}</Alert>
            ) : (
              <FilterMultiSelect
                layout="form"
                label="Kategori"
                ariaLabel="Kategori yang masuk template"
                values={picked}
                options={options}
                searchable
                required
                disabled={busy}
                onApply={setPicked}
                onReset={() => setPicked([])}
                formatValue={(values) =>
                  values.length === 0
                    ? "Pilih kategori"
                    : `${values.length} kategori`
                }
                hint={
                  pickedNames.length > 0
                    ? pickedNames.join(", ")
                    : "Belum ada kategori yang dipilih."
                }
              />
            ))}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={download} disabled={busy || blocked}>
            {busy ? <Spinner /> : <Download className="size-4" />}
            Unduh template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Parents A–Z, each followed by its own children as "Induk › Anak" — the tree
 * is exactly two deep. Narrowed to the sheet's category when it has one.
 */
function categoryOptions(
  categories: Category[],
  sheetCategoryId: string | null,
): FilterOption<string>[] {
  const byName = (a: Category, b: Category) =>
    a.name.localeCompare(b.name, "id");

  const inScope = sheetCategoryId
    ? categories.filter(
        (category) =>
          category._id === sheetCategoryId ||
          category.parentId === sheetCategoryId,
      )
    : categories;

  const ids = new Set(inScope.map((category) => category._id));
  const roots = inScope
    .filter((category) => !category.parentId || !ids.has(category.parentId))
    .sort(byName);

  return roots.flatMap((root) => [
    {
      value: root._id,
      label: root.parent ? `${root.parent.name} › ${root.name}` : root.name,
    },
    ...inScope
      .filter((child) => child.parentId === root._id)
      .sort(byName)
      .map((child) => ({
        value: child._id,
        label: `${root.name} › ${child.name}`,
      })),
  ]);
}
