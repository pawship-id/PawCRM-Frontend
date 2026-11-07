"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MouseEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A block of generated guide HTML (see `features/help/types.ts` — our own
 * Markdown, rendered at build time, so `dangerouslySetInnerHTML` carries no
 * user input).
 *
 * TWO BEHAVIOURS A STRING OF HTML CANNOT HAVE, added by one click handler on
 * the wrapper rather than by parsing the HTML into components:
 *
 * - **An internal link navigates client-side.** "lihat bagian 25" is an `<a>`
 *   in the string; left alone it reloads the whole app, rail and session check
 *   included, to move one article over. A modified click (new tab) is left to
 *   the browser.
 * - **A screenshot opens full size.** They are 1440 px wide and shrink to the
 *   column, which on a phone makes the labels they point at unreadable.
 */
export function HelpProse({ html, className }: { html: string; className?: string }) {
  const router = useRouter();
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    const image = target.closest("img");
    if (image) {
      setZoomed({ src: image.currentSrc || image.src, alt: image.alt });
      return;
    }

    const link = target.closest("a");
    const href = link?.getAttribute("href");
    if (
      !link ||
      !href?.startsWith("/") ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    router.push(href);
  }

  return (
    <>
      {/* The click handler is delegation for the links and images INSIDE; each
          of those is itself focusable or decorative, so the wrapper is not. */}
      <div
        className={cn("help-prose", className)}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-6xl p-3 sm:max-w-6xl">
          <DialogTitle className="sr-only">{zoomed?.alt || "Gambar"}</DialogTitle>
          <DialogDescription className="sr-only">Gambar layar dalam ukuran penuh.</DialogDescription>
          {zoomed && (
            // eslint-disable-next-line @next/next/no-img-element -- a static file under public/, shown at its own size
            <img
              src={zoomed.src}
              alt={zoomed.alt}
              className="max-h-[85vh] w-full rounded-lg object-contain"
            />
          )}
          {zoomed?.alt && <p className="px-1 text-sm text-muted">{zoomed.alt}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
