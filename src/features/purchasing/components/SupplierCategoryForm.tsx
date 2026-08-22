"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, Spinner, TextField } from "@/components";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/services/api-error";
import { supplierCategoryService } from "@/services/supplierCategory.service";
import { swalToast } from "@/lib/swal";
import type { SupplierCategory } from "@/types/api";

/** Backend cap — NAME_MAX_LENGTH in category.model.js. */
const NAME_MAX_LENGTH = 120;

/** Where both verbs return to, and what Batal goes back to. */
const LIST_PATH = "/dashboard/purchasing/supplier-categories";

/**
 * Create or edit a supplier category, on a route of its own.
 *
 * ONE INPUT. That is the whole design brief and it is worth stating plainly,
 * because the underlying collection would accept more: a supplier category is
 * stored beside product categories, which carry a parent, a description and a
 * picture. None of those are offered here and none are sent — the API refuses
 * them on this resource — so the form shows a vendor group for what it is,
 * a name.
 *
 * ONE COMPONENT FOR BOTH VERBS, matching CategoryForm: the fields are identical
 * and only the request and the wording differ. `categoryId` is what tells them
 * apart — absent creates, present edits and makes this component fetch the
 * category first.
 *
 * THE FETCH LIVES HERE rather than in the page: the page is a Server Component
 * that only awaits `params`, and a form that owns its own loading and not-found
 * states is one the route does not have to model.
 *
 * A PAGE RATHER THAN A DIALOG, and this is the one place the reasoning differs
 * from the product form's. That form left its modal when it grew a description
 * and an image picker; this one never will, and a modal would genuinely be
 * cheaper for "add four groups in a row". It is a page anyway, so that the two
 * category screens are navigated the same way — same routes, same Batal, same
 * back button — and so that a middle-click on Edit does what it does everywhere
 * else. What that costs is real and the same cost CategoryForm names: the list
 * is no longer on screen while the name is typed, and the list is what would
 * have told you the name already exists. The 409 still catches it, just after
 * the save rather than before it.
 *
 * THE ACTIVE SWITCH ONLY APPEARS WHEN EDITING. A category is created because
 * somebody wants to use it — offering "make this one and retire it immediately"
 * answers a question nobody asked.
 */
export function SupplierCategoryForm({ categoryId }: { categoryId?: string }) {
  const editing = categoryId !== undefined;

  const [category, setCategory] = useState<SupplierCategory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) return;

    let active = true;

    supplierCategoryService
      .getById(categoryId)
      .then((result) => {
        if (!active) return;
        setCategory(result);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Kategori ini tidak bisa dimuat.",
        );
      });

    return () => {
      active = false;
    };
  }, [categoryId]);

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  if (editing && !category) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat kategori…
      </div>
    );
  }

  return (
    // Remounted per category so the fields start from the right values: without
    // the key, arriving at another category through a client-side navigation
    // would keep the previous one's state.
    <SupplierCategoryFields
      key={category?._id ?? "new"}
      category={category ?? undefined}
    />
  );
}

/* -------------------------------------------------------------------------- */

function SupplierCategoryFields({
  category,
}: {
  category?: SupplierCategory;
}) {
  const router = useRouter();
  const editing = category !== undefined;

  const [name, setName] = useState(category?.name ?? "");
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function goBack() {
    router.push(LIST_PATH);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();

    if (trimmed === "") {
      setNameError("Nama kategori wajib diisi.");
      return;
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      setNameError(`Maksimal ${NAME_MAX_LENGTH} karakter.`);
      return;
    }

    // A patch that changes nothing is a request the backend rejects outright
    // (`.min(1)` on the body), so BOTH fields have to be compared — otherwise
    // flipping only the switch, or saving an untouched form, would submit an
    // empty body and read as a failure.
    const renamed = editing && trimmed !== category.name;
    const retired = editing && isActive !== category.isActive;

    if (editing && !renamed && !retired) {
      // Nothing moved. Leaving is the honest outcome.
      goBack();
      return;
    }

    setSaving(true);
    setNameError(null);
    setFormError(null);

    try {
      if (editing) {
        // Only what moved: the name is left out of a patch that merely retires
        // a category, so the 409 name check never runs against its own name.
        await supplierCategoryService.update(category._id, {
          ...(renamed ? { name: trimmed } : {}),
          ...(retired ? { isActive } : {}),
        });
      } else {
        await supplierCategoryService.create({ name: trimmed });
      }

      // Navigate first, then toast, so the message rides along on the list.
      goBack();
      swalToast(
        editing ? "Kategori diperbarui." : `Kategori ${trimmed} dibuat.`,
      );
    } catch (error) {
      // A name clash belongs on the field; anything else is a banner, because
      // it is not something the user can fix by retyping.
      if (error instanceof ApiError && error.status === 409) {
        setNameError(
          `Nama "${trimmed}" sudah dipakai kategori supplier lain. Kategori yang sudah dihapus masih memegang namanya sampai dipulihkan atau diganti.`,
        );
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : "Terjadi kesalahan. Coba lagi.",
        );
      }
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Card
        title="Identitas"
        description="Nama yang muncul waktu mengelompokkan supplier."
      >
        <TextField
          label="Nama kategori"
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
          }}
          error={nameError ?? undefined}
          placeholder="mis. Distributor Pakan"
          maxLength={NAME_MAX_LENGTH}
          autoFocus
          disabled={saving}
          required
        />
      </Card>

      {editing && (
        <Card
          title="Ketersediaan"
          description="Kategori nonaktif tidak hilang — cuma berhenti ditawarkan."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="supplier-category-active">Aktif</Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Kategori nonaktif tidak ditawarkan lagi saat mengelompokkan
                supplier baru. Supplier yang sudah masuk ke sini tetap ada, dan
                kategorinya bisa diaktifkan lagi kapan saja. Ini bukan hapus —
                menghapus ada di menu barisnya.
              </p>
            </div>
            <Switch
              id="supplier-category-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={saving}
            />
          </div>
        </Card>
      )}

      {/* Stacks on a phone (the primary on top), one row from sm up. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={goBack}
          disabled={saving}
        >
          Batal
        </Button>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          {editing ? "Simpan" : "Buat kategori"}
        </Button>
      </div>
    </form>
  );
}
