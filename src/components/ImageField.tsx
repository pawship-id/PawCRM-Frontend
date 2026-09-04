"use client";

import { useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ImagePlus, Trash2 } from "lucide-react";

import { Alert } from "./Alert";
import { Spinner } from "./Spinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { mediaService } from "@/services/media.service";
import type { MediaUploadPurpose } from "@/services/media.service";
import { formatMegabytes } from "@/utils/media";
import type { MediaAsset } from "@/types/inventory";

/**
 * `react-easy-crop` measures the DOM as it mounts, so the cropper cannot be
 * server-rendered — and it is ~12 KB nobody adding three records in a row
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
 * The ONE picture a record carries — pick, crop, upload, replace, remove.
 *
 * PROMOTED OUT OF THE CATEGORIES FEATURE, where it lived as
 * `CategoryImageField` until a second feature needed it (ui-rules §14: a
 * component lives in its feature until a second one genuinely needs it, then it
 * is promoted rather than copy-pasted). Services was that second feature;
 * `PetForm` records the same wait in its header. What changes per caller is the
 * label, the storage `purpose` and the alt text — the crop, the upload and the
 * failure paths are identical, which is what made this a promotion rather than
 * two components.
 *
 * A SEPARATE COMPONENT FROM `MediaGallery`, not a `max={1}` configuration of it.
 * The gallery's whole subject is the array: reorder buttons, drag handles, a
 * "Utama" badge on index 0, a video path with a poster frame. A single slot has
 * no order, so every one of those either disappears or turns into a control that
 * does nothing — and `max={1}` would still accept an MP4 the API then refuses.
 * Two small components beat one with a mode.
 *
 * SQUARE CROP, LOCKED. Every caller renders its picture as a tile — a grid cell,
 * a POS button, a storefront strip — and every one of those is square. Letting
 * the shape vary means the tile either letterboxes or crops on its own, and it
 * crops without showing anyone what it removed.
 *
 * THE UPLOAD HAPPENS IMMEDIATELY, before the record is saved, and that is the
 * cost of the media endpoint being owner-agnostic (see MediaService on the
 * backend). A user who then cancels the dialog leaves bytes nothing points at;
 * `seeds/sweepOrphanMedia.js` collects them after a day. The alternative — hold
 * the file and upload on submit — would mean the save can fail on the slow half
 * of the work after the user has been told the form is valid.
 *
 * REMOVING HERE ONLY CLEARS THE FIELD. The bytes go when the record is saved,
 * because deleting them now would strand a live record's picture if the user
 * then cancelled.
 */
export function ImageField({
  value,
  onChange,
  purpose,
  label = "Gambar",
  alt,
  hint = "PNG, JPG atau WebP. Dipotong jadi kotak — itu bentuk tampilannya di katalog dan kasir.",
  disabled = false,
}: {
  value: MediaAsset | null;
  /** A new asset replaces the picture; `null` clears the field. */
  onChange: (next: MediaAsset | null) => void;
  /**
   * Becomes a segment of the storage key, and the orphan sweeper reads it —
   * filing a service's picture under `category` would put it where nothing
   * looks for it. The server maps unknown values to `product` rather than
   * trusting the string, so this union is the client half of a closed list.
   */
  purpose: MediaUploadPurpose;
  label?: string;
  /** Named, not decorative: this tile IS the field's value. */
  alt: string;
  hint?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
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
        new File([blob], `${purpose}.webp`, { type: blob.type }),
        { purpose, onProgress: setProgress },
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
      <Label id={labelId}>{label}</Label>

      <div
        role="group"
        aria-labelledby={labelId}
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
              alt={alt}
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
            {busy ? `Mengunggah… ${progress}%` : hint}
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
