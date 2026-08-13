"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Crops an image in the browser and hands back the cropped bytes.
 *
 * CROPPING HAPPENS HERE, NOT ON THE SERVER, and the reasoning is worth keeping:
 * sending crop coordinates instead would mean the server has to keep the
 * ORIGINAL to re-crop from (double storage), has to define whose coordinate
 * space the numbers are in — natural pixels or displayed pixels, the single most
 * common bug in this feature — and has to round-trip a preview. The browser
 * already has the pixels and a canvas, so it sends bytes that are already right
 * and the server's job collapses to validate, normalise, store.
 *
 * `react-easy-crop` is the one library in this repo that earns its bytes (~12
 * KB): pinch-zoom, touch drag and aspect-locked cropping over a rotated image is
 * four hundred lines of pointer arithmetic, and it is the part users notice
 * immediately when it is wrong.
 */

/**
 * Draws the selected region onto a canvas and returns it as a JPEG blob.
 *
 * `crop` comes back from the cropper in NATURAL image pixels, which is why the
 * canvas is sized from it directly rather than from anything on screen — the
 * displayed size is a CSS concern and would silently scale the output.
 */
async function cropToBlob(src: string, crop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.addEventListener("load", () => resolve(element));
    element.addEventListener("error", () =>
      reject(new Error("Gambar tidak bisa dibaca")),
    );
    element.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas tidak tersedia");

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Gambar gagal diproses")),
      // JPEG at high quality: the server re-encodes to WebP anyway, so this is
      // only the transport format, and PNG would make a photo several times
      // larger for no gain.
      "image/jpeg",
      0.92,
    );
  });
}

interface ImageCropDialogProps {
  /** An object URL for the file being cropped. */
  src: string | null;
  open: boolean;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
  /** 1 for a square catalogue tile; omit to crop freely. */
  aspect?: number;
}

export function ImageCropDialog({
  src,
  open,
  onCancel,
  onCropped,
  aspect = 1,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    // The SECOND argument is in natural pixels; the first is percentages. Using
    // the wrong one crops a thumbnail-sized region out of a 4000px photo.
    setArea(pixels);
  }, []);

  async function confirm() {
    if (!src || !area) return;

    setBusy(true);
    setError(null);
    try {
      onCropped(await cropToBlob(src, area));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gambar gagal diproses");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sesuaikan gambar</DialogTitle>
        </DialogHeader>

        <div className="relative h-72 w-full overflow-hidden rounded-lg bg-accent">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            aria-label="Zoom"
            onChange={(event) => setZoom(Number(event.target.value))}
            className="flex-1"
          />
        </label>

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="button" onClick={confirm} disabled={busy || !area}>
            {busy ? "Memproses…" : "Gunakan gambar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
