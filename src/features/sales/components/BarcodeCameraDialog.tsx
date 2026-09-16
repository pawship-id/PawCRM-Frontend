"use client";

import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** The last scan's outcome, shown under the field and inside the dialog. */
export type ScanStatus = { tone: "success" | "error"; text: string } | null;

/**
 * How long the same code is ignored after it was read.
 *
 * The decoder reports a barcode on EVERY frame it can see it — several times a
 * second while it is held in front of the lens. Without a window one steady
 * scan would be ten bags on the bill. Two seconds is long enough to move the
 * item away, short enough that scanning a second identical bag still works.
 */
const REPEAT_WINDOW_MS = 2000;

const UNSUPPORTED =
  "Kamera tidak bisa dibuka di sini. Browser hanya mengizinkan kamera lewat HTTPS — pakai alat scanner, atau buka halaman ini lewat alamat https.";

/**
 * Reads barcodes through the device's camera, continuously, until closed.
 *
 * THE DECODER IS LOADED WHEN THE DIALOG OPENS, not with the page: it is a few
 * hundred kilobytes that most invoices — typed, or scanned with a counter
 * scanner — never need.
 *
 * THE BACK CAMERA ON A PHONE (`facingMode: "environment"`). The front one shows
 * the cashier's face, and a barcode held up to it reads mirrored.
 *
 * NO BROWSER-SPECIFIC API. `BarcodeDetector` would be lighter, but Safari and
 * Firefox do not have it, and an iPhone at the counter is the likeliest camera
 * this dialog meets. The zxing decoder reads frames in plain JavaScript.
 *
 * STOPPED ON CLOSE, always. A camera left streaming keeps the device's light
 * on and the tab marked as recording after the dialog is gone.
 */
export function BarcodeCameraDialog({
  onDetected,
  status,
  onClose,
}: {
  onDetected: (code: string) => void;
  status: ScanStatus;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  /*
    READ IN RENDER, not set from the effect: whether this browser can open a
    camera at all is a fact about the page, and a synchronous setState in the
    effect is a cascading render. Only a secure context exposes `mediaDevices`.
  */
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  // The latest callback, without restarting the camera on every render.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    if (!supported) return;

    let stopped = false;
    let controls: { stop: () => void } | null = null;
    const last = { code: "", at: 0 };

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped || !videoRef.current) return;

        const reader = new BrowserMultiFormatReader();
        const started = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result) => {
            if (!result) return;

            const code = result.getText();
            const now = Date.now();
            if (code === last.code && now - last.at < REPEAT_WINDOW_MS) return;

            last.code = code;
            last.at = now;
            onDetectedRef.current(code);
          },
        );

        // Closed while the camera was still opening: stop what just started.
        if (stopped) started.stop();
        else controls = started;
      } catch (err) {
        if (stopped) return;
        const name = (err as { name?: string } | null)?.name;
        setError(
          name === "NotAllowedError"
            ? "Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, lalu buka lagi."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "Tidak ada kamera yang bisa dipakai di perangkat ini."
              : "Kamera gagal dibuka. Coba lagi, atau pakai alat scanner.",
        );
      } finally {
        if (!stopped) setStarting(false);
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [supported]);

  const problem = supported ? error : UNSUPPORTED;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan barcode pakai kamera</DialogTitle>
          <DialogDescription>
            Arahkan kamera ke barcode kemasan atau label batch. Setiap kode yang
            terbaca langsung masuk ke faktur — lanjut scan tanpa menutup ini.
          </DialogDescription>
        </DialogHeader>

        {problem ? (
          <Alert variant="error">{problem}</Alert>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-foreground">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Tampilan kamera"
              className="aspect-video w-full object-cover"
            />
            {/* Where to hold the code — a frame, not decoration. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-primary-foreground/80"
            />
            {starting && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-primary-foreground">
                Membuka kamera…
              </p>
            )}
          </div>
        )}

        {status && (
          <p
            aria-live="polite"
            className={cn(
              "text-sm",
              status.tone === "error"
                ? "font-semibold text-danger"
                : "text-success",
            )}
          >
            {status.text}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Selesai
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
