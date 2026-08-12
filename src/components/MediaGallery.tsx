"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ImageCropDialog } from "./ImageCropDialog";
import { mediaService } from "@/services/media.service";
import { ApiError } from "@/services/api-error";
import { cn } from "@/lib/utils";
import type { ProductMedia } from "@/types/inventory";

/**
 * The product's image and video gallery — upload, crop, delete and reorder.
 *
 * ORDER IS THE DATA. The array's order is the display order and index 0 is the
 * primary image, which is why there is no sort field to keep in step: a reorder
 * is a new array, and a new array is what gets saved.
 *
 * REORDERING IS BUTTONS PLUS NATIVE DRAG, NOT A DND LIBRARY. Nine items, one
 * dimension, no nesting, no virtualisation, no cross-container moves — the exact
 * case HTML5 `draggable` handles in about twenty lines, where `@dnd-kit` would
 * be ~40 KB. Native drag does not work on touch, so the ◀ ▶ buttons are not a
 * fallback bolted on: they are the touch path, the keyboard path, the
 * screen-reader path, and the only path testable in jsdom, which has no
 * `DataTransfer`. That combination is why the library is unnecessary rather than
 * merely avoidable.
 *
 * CROP RUNS BEFORE UPLOAD, on the file the user picked, so the server receives
 * bytes that are already final — see ImageCropDialog for why that beats sending
 * coordinates. Videos skip it: there is nothing to crop and no canvas to do it
 * with.
 */

const ACCEPT = "image/png,image/jpeg,image/webp,video/mp4";

interface MediaGalleryProps {
  value: ProductMedia[];
  onChange: (next: ProductMedia[]) => void;
  max?: number;
  /** Shown when the API refused an item — usually the 9-item cap. */
  error?: string;
  disabled?: boolean;
}

export function MediaGallery({
  value,
  onChange,
  max = 9,
  error,
  disabled = false,
}: MediaGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; src: string } | null>(
    null,
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const full = value.length >= max;

  function pick() {
    inputRef.current?.click();
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the SAME file twice still fires a change —
    // otherwise a user who cancels a crop cannot re-pick that image.
    event.target.value = "";
    if (!file) return;

    setUploadError(null);

    if (file.type.startsWith("video/")) {
      void upload(file);
      return;
    }

    // Images go through the cropper first. The object URL is revoked when the
    // dialog closes, either way.
    setPending({ file, src: URL.createObjectURL(file) });
  }

  async function upload(file: File | Blob, name = "image.jpg") {
    setProgress(0);
    try {
      const asset = await mediaService.upload(
        file instanceof File ? file : new File([file], name, { type: file.type }),
        { onProgress: setProgress },
      );
      onChange([...value, asset]);
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : "Upload gagal. Coba lagi.",
      );
    } finally {
      setProgress(null);
    }
  }

  function closeCropper() {
    if (pending) URL.revokeObjectURL(pending.src);
    setPending(null);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length) return;

    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function remove(index: number) {
    // Removed from the array only. The bytes are deleted by the API once the
    // product is saved — doing it here would strand a live product's image if
    // the user then cancelled the form.
    onChange(value.filter((_, position) => position !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {value.map((item, index) => (
          <figure
            key={item.storageKey}
            draggable={!disabled}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
            }}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-lg border border-border bg-accent",
              dragIndex === index && "opacity-50",
            )}
          >
            {item.mediaType === "video" ? (
              <>
                {item.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.posterUrl}
                    alt={item.alt ?? "Video produk"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-accent" />
                )}
                <span className="absolute inset-0 flex items-center justify-center">
                  <Play className="size-8 text-surface drop-shadow" />
                </span>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbUrl ?? item.url}
                alt={item.alt ?? "Gambar produk"}
                className="h-full w-full object-cover"
              />
            )}

            {/* index 0 is the primary image everywhere it is rendered — the
                catalogue row, the POS tile, the marketplace listing. Saying so
                is what makes the reorder buttons mean something. */}
            {index === 0 && (
              <Badge className="absolute top-1 left-1 text-[10px]">Utama</Badge>
            )}

            {!disabled && (
              <figcaption className="absolute inset-x-0 bottom-0 flex justify-between bg-foreground/60 p-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <span className="flex gap-0.5">
                  <button
                    type="button"
                    aria-label={`Geser kiri ${index + 1}`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    className="rounded p-0.5 text-surface disabled:opacity-30"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Geser kanan ${index + 1}`}
                    disabled={index === value.length - 1}
                    onClick={() => move(index, index + 1)}
                    className="rounded p-0.5 text-surface disabled:opacity-30"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </span>
                <button
                  type="button"
                  aria-label={`Hapus ${index + 1}`}
                  onClick={() => remove(index)}
                  className="rounded p-0.5 text-surface"
                >
                  <X className="size-4" />
                </button>
              </figcaption>
            )}
          </figure>
        ))}

        {!disabled && !full && (
          <button
            type="button"
            onClick={pick}
            aria-label="Tambah gambar atau video"
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted transition hover:border-primary hover:text-primary"
          >
            {progress === null ? (
              <>
                <Plus className="size-5" />
                <span className="text-[10px]">Tambah</span>
              </>
            ) : (
              <span className="text-xs tabular-nums">{progress}%</span>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onFileChosen}
        className="hidden"
        // Not `aria-hidden`: the visible add-tile is the label, and hiding this
        // from the tree entirely would leave the picker unreachable in tests.
        tabIndex={-1}
      />

      <p className="text-xs text-muted">
        Maksimal {max} file. Gambar PNG/JPG/WebP (maks 5 MB) dan video MP4 (maks
        50 MB). Urutan kiri-ke-kanan adalah urutan tampil; yang pertama jadi
        gambar utama. Geser tile atau pakai tombol{" "}
        <ChevronLeft className="inline size-3" />
        <ChevronRight className="inline size-3" /> untuk mengurutkan.
      </p>

      {(uploadError || error) && (
        <p role="alert" className="text-xs text-danger">
          {uploadError ?? error}
        </p>
      )}

      <ImageCropDialog
        src={pending?.src ?? null}
        open={pending !== null}
        onCancel={closeCropper}
        onCropped={(blob) => {
          closeCropper();
          void upload(blob, pending?.file.name ?? "image.jpg");
        }}
      />
    </div>
  );
}
