"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ImagePlus, Trash2 } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { mediaService } from "@/services/media.service";
import { formatMegabytes } from "@/utils/media";
import type { MediaAsset } from "@/types/inventory";

/**
 * `react-easy-crop` measures the DOM as it mounts, so the cropper cannot be
 * server-rendered — and it is ~12 KB nobody adding three categories in a row
 * should pay for before they pick a file.
 */
const ImageCropDialog = dynamic(
  () => import("@/components/ImageCropDialog").then((m) => m.ImageCropDialog),
  { ssr: false },
);

/** Only what the server's sharp pipeline accepts. A video is refused by the API. */
const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * The server's own ceiling, mirrored so a file that cannot possibly be accepted
 * is refused before the upload rather than after it — a duplicated constant,
 * knowingly, exactly as MediaGallery documents. The API remains the authority;
 * this only spares the user a round trip ending in a 400.
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * The one picture a category carries — pick, crop, upload, replace, remove.
 *
 * A SEPARATE COMPONENT FROM `MediaGallery`, not a `max={1}` configuration of it.
 * The gallery's whole subject is the array: reorder buttons, drag handles, a
 * "Utama" badge on index 0, a video path with a poster frame. A category has one
 * slot and no order, so every one of those either disappears or turns into a
 * control that does nothing — and `max={1}` would still accept an MP4 the API
 * then refuses. Two small components beat one with a mode.
 *
 * SQUARE CROP, LOCKED. A category renders as a tile — a grid cell, a POS group
 * button, a storefront strip — and every one of those is square. Letting the
 * shape vary means the tile either letterboxes or crops on its own, and it
 * crops without showing anyone what it removed.
 *
 * THE UPLOAD HAPPENS IMMEDIATELY, before the category is saved, and that is the
 * cost of the media endpoint being owner-agnostic (see MediaService on the
 * backend). A user who then cancels the dialog leaves bytes nothing points at;
 * `seeds/sweepOrphanMedia.js` collects them after a day. The alternative — hold
 * the file and upload on submit — would mean the save can fail on the slow half
 * of the work after the user has been told the form is valid.
 *
 * REMOVING HERE ONLY CLEARS THE FIELD. The bytes go when the category is saved,
 * because deleting them now would strand a live category's picture if the user
 * then cancelled.
 */
export function CategoryImageField({
  value,
  onChange,
  disabled = false,
}: {
  value: MediaAsset | null;
  /** A new asset replaces the picture; `null` clears the field. */
  onChange: (next: MediaAsset | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ src: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = progress !== null;

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the SAME file twice still fires a change —
    // otherwise a user who cancels the crop cannot re-pick that image.
    event.target.value = "";
    if (!file) return;

    setError(null);
    setPending({ src: URL.createObjectURL(file) });
  }

  function closeCropper() {
    if (pending) URL.revokeObjectURL(pending.src);
    setPending(null);
  }

  /**
   * The cropped bytes, already downscaled to 2048px by the dialog.
   *
   * The size check is on the ENCODED blob, not on what the user picked: after
   * the downscale those two numbers have nothing to do with each other, and a
   * 12 MB photo that becomes a 400 KB upload must not be refused for the size
   * it used to be.
   */
  async function upload(blob: Blob) {
    closeCropper();

    if (blob.size > MAX_IMAGE_BYTES) {
      setError(
        `Gambar terlalu besar (${formatMegabytes(blob.size)}). Maksimal ${formatMegabytes(MAX_IMAGE_BYTES)}.`,
      );
      return;
    }

    setProgress(0);
    try {
      const asset = await mediaService.upload(
        new File([blob], "category.webp", { type: blob.type }),
        // `category` becomes a segment of the storage key, and the orphan
        // sweeper reads it. Sending `product` would file a category's picture
        // where nothing looks for it.
        { purpose: "category", onProgress: setProgress },
      );
      onChange(asset);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Upload gagal. Coba lagi.",
      );
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/*
        A Label with no `htmlFor`, paired with `aria-labelledby` on the group.
        The control here is two buttons and a hidden file input, so there is no
        single element the label could point at — and pointing it at the hidden
        input would name a control a keyboard user cannot reach (it carries
        `tabIndex={-1}` so the visible button is the only tab stop).
      */}
      <Label id="category-image-label">Gambar</Label>

      <div
        role="group"
        aria-labelledby="category-image-label"
        className="flex items-center gap-3"
      >
        <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-dashed border-border bg-surface-hover">
          {busy ? (
            <span className="flex size-full items-center justify-center">
              <Spinner size={20} />
            </span>
          ) : value ? (
            // next/image needs a configured remote host per storage driver, and
            // the driver is chosen per deployment — the same reason MediaGallery
            // uses a plain img.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.thumbUrl ?? value.url}
              // Named rather than decorative: this tile IS the field's value,
              // and a screen-reader user needs to know the field is filled.
              // The table's thumbnail is alt="" for the opposite reason — the
              // category's name sits right beside it.
              alt="Gambar kategori"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <ImagePlus className="size-5 text-muted" aria-hidden />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || busy}
            >
              {value ? "Ganti gambar" : "Pilih gambar"}
            </Button>

            {value && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setError(null);
                  onChange(null);
                }}
                disabled={disabled || busy}
              >
                <Trash2 className="size-4" aria-hidden />
                Hapus
              </Button>
            )}
          </div>

          <p className="text-xs text-muted">
            {busy
              ? `Mengunggah… ${progress}%`
              : "PNG, JPG atau WebP. Dipotong jadi kotak — itu bentuk tampilannya di katalog dan kasir."}
          </p>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        className="hidden"
        aria-hidden
        onChange={pickFile}
      />

      {pending && (
        <ImageCropDialog
          open
          src={pending.src}
          aspect={1}
          onCancel={closeCropper}
          onCropped={(blob) => void upload(blob)}
        />
      )}
    </div>
  );
}
