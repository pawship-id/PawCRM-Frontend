"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  FormActionBar,
  Spinner,
  TextField,
  TextareaField,
} from "@/components";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/services/api-error";
import { categoryService } from "@/services/category.service";
import { swalToast } from "@/lib/swal";
import type { Category } from "@/types/api";
import type { MediaAsset } from "@/types/inventory";

import { CategoryImageField } from "./CategoryImageField";
import { CategoryParentField } from "./CategoryParentField";

/** Backend caps — NAME_MAX_LENGTH and DESCRIPTION_MAX_LENGTH in category.model.js. */
const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;

/** Where both verbs return to, and what Batal goes back to. */
const LIST_PATH = "/dashboard/inventory/categories";

/**
 * Create or edit a category, on a route of its own.
 *
 * THIS WAS A DIALOG UNTIL A CATEGORY GREW A SECOND AND THIRD FIELD, and the
 * dialog's own header carried the argument that now points the other way: a
 * modal was right while the whole form was one text input, because sending
 * somebody to a page and back to type one word made "add three categories in a
 * row" three trips through the router. A picker that uploads, an image cropper
 * on top of it, and a 500-character description are not that form. Stacked
 * inside a modal they leave no room to see what is being typed, and the cropper
 * would be a dialog opening over a dialog — which Radix will do and nobody
 * should read.
 *
 * WHAT THE MOVE COSTS, stated because it is real: the list is no longer on
 * screen while the name is typed, and that list was the thing that told you
 * whether the name already existed. The 409 still catches it — and it is still
 * shown against the name field rather than as a banner — but it now arrives
 * after a save instead of being visible before one.
 *
 * ONE COMPONENT FOR BOTH VERBS, unchanged from the dialog and for the same
 * reason: the fields are identical and only the request and the wording differ.
 * Splitting them would be two copies of the same form kept in step by hand.
 * `categoryId` is what tells them apart — absent creates, present edits and
 * makes this component fetch the category first.
 *
 * THE FETCH LIVES HERE rather than in the page, matching ProductForm: the page
 * is a Server Component that only awaits `params`, and a form that owns its own
 * loading and not-found states is one the route does not have to model.
 *
 * THE ACTIVE SWITCH ONLY APPEARS WHEN EDITING. A category is created because
 * somebody wants to use it — offering "make this one and retire it immediately"
 * answers a question nobody asked. Retiring is a decision taken later, about a
 * label that has been around a while.
 *
 * RETIRING IS NOT DELETING, and the copy under the switch says so. Deleting
 * lives in the list's row menu, not here: its confirmation names how many
 * products are in the way, which is the number that tells you what to do next,
 * and a second delete button on this page would be a second copy of that
 * reasoning to keep in step.
 */
export function CategoryForm({ categoryId }: { categoryId?: string }) {
  const editing = categoryId !== undefined;

  const [category, setCategory] = useState<Category | null>(null);
  const [childCount, setChildCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) return;

    let active = true;

    /**
     * The category, and how many sub-categories it holds.
     *
     * THE COUNT COMES FROM A LIST QUERY rather than a field on the category,
     * and that is a deliberate trade. Putting `childCount` on every read would
     * mean an aggregation on the list endpoint — a per-row count on a screen
     * that shows twenty rows — to answer a question only this form asks. One
     * extra request on one page, with `limit: 1` so only the total crosses the
     * wire, is the cheaper side of it.
     *
     * It decides whether the parent picker is usable at all: a category that is
     * already a parent cannot become a child, because the tree is two deep.
     * Concurrent with the read — neither needs the other.
     */
    Promise.all([
      categoryService.getById(categoryId),
      categoryService.list({ parentId: categoryId, limit: 1 }),
    ])
      .then(([result, children]) => {
        if (!active) return;
        setCategory(result);
        setChildCount(children.pagination.total);
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

  if (editing && (!category || childCount === null)) {
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
    <CategoryFields
      key={category?._id ?? "new"}
      category={category ?? undefined}
      // Zero when creating: a category that does not exist yet holds nothing.
      childCount={childCount ?? 0}
    />
  );
}

/* -------------------------------------------------------------------------- */

function CategoryFields({
  category,
  childCount,
}: {
  category?: Category;
  childCount: number;
}) {
  const router = useRouter();
  const editing = category !== undefined;

  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState<string | null>(
    category?.parentId ?? null,
  );
  const [description, setDescription] = useState(category?.description ?? "");
  const [image, setImage] = useState<MediaAsset | null>(category?.image ?? null);
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
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

    const blurb = description.trim();

    if (blurb.length > DESCRIPTION_MAX_LENGTH) {
      setDescriptionError(`Maksimal ${DESCRIPTION_MAX_LENGTH} karakter.`);
      return;
    }

    // A patch that changes nothing is a request the backend rejects outright
    // (`.min(1)` on the body), so EVERY field has to be compared, not just the
    // name — otherwise flipping only the switch would submit an empty body.
    const renamed = editing && trimmed !== category.name;
    const retired = editing && isActive !== category.isActive;
    // "" and null both mean "no description" on the server, so a category that
    // never had one and an emptied box must not read as a change.
    const rewritten = editing && blurb !== (category.description ?? "");
    // Compared by storage key rather than by object identity: the asset is
    // replaced wholesale on every upload, so `!==` on the objects would call a
    // re-render a change.
    const repictured =
      editing &&
      (image?.storageKey ?? null) !== (category.image?.storageKey ?? null);
    const removed = editing && parentId !== (category.parentId ?? null);

    if (
      editing &&
      !renamed &&
      !retired &&
      !rewritten &&
      !repictured &&
      !removed
    ) {
      // Nothing moved. Leaving is the honest outcome — a "save" that sends an
      // empty body would come back a 400 and read as a failure.
      goBack();
      return;
    }

    setSaving(true);
    setNameError(null);
    setDescriptionError(null);
    setFormError(null);

    try {
      if (editing) {
        // ONLY WHAT MOVED, and for two different reasons. The name is left out
        // of a patch that merely retires a category, so the 409 name check
        // never runs against its own name — and the image is left out of every
        // patch that did not change it, because the API deletes the bytes an
        // update drops. Resending an unchanged asset is one dropped connection
        // away from losing the picture.
        await categoryService.update(category._id, {
          ...(renamed ? { name: trimmed } : {}),
          // A move can collide on the name just as a rename can — the API
          // checks it against the parent the category is heading INTO — so this
          // shares the 409 handling below rather than having its own.
          ...(removed ? { parentId } : {}),
          ...(rewritten ? { description: blurb } : {}),
          ...(repictured ? { image } : {}),
          ...(retired ? { isActive } : {}),
        });
      } else {
        await categoryService.create({
          name: trimmed,
          ...(parentId ? { parentId } : {}),
          // Sent only when filled: an empty string is accepted and stored as
          // null anyway, but a create carrying keys nobody filled in reads as
          // though it did.
          ...(blurb ? { description: blurb } : {}),
          ...(image ? { image } : {}),
        });
      }

      // Navigate first, then toast, so the message rides along on the list —
      // the same order BranchCreateForm uses.
      goBack();
      swalToast(
        editing ? "Kategori diperbarui." : `Kategori ${trimmed} dibuat.`,
      );
    } catch (error) {
      // A name clash belongs on the field; anything else is a banner, because
      // it is not something the user can fix by retyping.
      if (error instanceof ApiError && error.status === 409) {
        // A 409 has two causes now, and they need different sentences: a name
        // clash belongs on the name field, while "this category still holds
        // sub-categories" is about the move and is not fixable by retyping.
        if (error.message.toLowerCase().includes("move")) {
          setFormError(error.reason ?? error.message);
        } else {
          setNameError(
            `Nama "${trimmed}" sudah dipakai di tingkat yang sama. Nama boleh berulang di induk yang berbeda, dan kategori yang sudah dihapus masih memegang namanya sampai dipulihkan atau diganti.`,
          );
        }
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
      {/* The document's head — §16. Not pinned; it scrolls with the page. */}
      <FormActionBar
        title={editing ? "Ubah kategori" : "Kategori baru"}
        meta={editing ? category.name : undefined}
        submitLabel={editing ? "Simpan kategori" : "Buat kategori"}
        submitting={saving}
        onCancel={goBack}
      />

      {formError && <Alert variant="error">{formError}</Alert>}

      <Card
        title="Identitas"
        description="Nama yang muncul di setiap picker produk, penjelasan singkat soal isinya, dan posisinya di dalam pengelompokan."
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nama kategori"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
            placeholder="mis. Makanan Kucing"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            disabled={saving}
            required
          />

          {/* Klasifikasi before the free text, and the free text closes the
              card — §16's entity order: Nama, identifier, classification,
              optional attributes, then the note last whatever its length. */}
          <CategoryParentField
            value={parentId}
            onChange={setParentId}
            categoryId={category?._id}
            childCount={childCount}
            disabled={saving}
          />

          <TextareaField
            label="Deskripsi"
            name="description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setDescriptionError(null);
            }}
            error={descriptionError ?? undefined}
            hint="Opsional. Sebaris dua baris soal apa yang masuk kategori ini — yang baca orang yang lagi input produk."
            placeholder="mis. Makanan basah dan kering — bukan camilan"
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={saving}
          />
        </div>
      </Card>

      <Card
        title="Gambar"
        description="Dipakai di kartu kategori, tombol grup di kasir, dan etalase."
      >
        <CategoryImageField
          value={image}
          onChange={setImage}
          disabled={saving}
        />
      </Card>

      {editing && (
        <Card
          title="Ketersediaan"
          description="Kategori nonaktif tidak hilang — cuma berhenti ditawarkan."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="category-active">Aktif</Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Kategori nonaktif tidak ditawarkan lagi untuk produk baru.
                Produk yang sudah difilekan di sini tetap ada, dan kategorinya
                bisa diaktifkan lagi kapan saja. Ini bukan hapus — menghapus ada
                di menu barisnya, dan ditolak selama masih ada produk di
                dalamnya.
              </p>
            </div>
            <Switch
              id="category-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={saving}
            />
          </div>
        </Card>
      )}

    </form>
  );
}
