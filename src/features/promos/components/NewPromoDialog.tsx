"use client";

import { Gift, Layers, Package, Plus, Scissors, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

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
import { AVAILABLE_PROMO_TYPES, type PromoType } from "@/types/promo";

import { PROMO_TYPES, PROMO_TYPE_HINT, PROMO_TYPE_LABEL, promoNewHref } from "../labels";

const TYPE_ICON: Record<PromoType, ReactNode> = {
  coret: <Scissors className="size-4" aria-hidden />,
  tiered: <Layers className="size-4" aria-hidden />,
  bundle: <Package className="size-4" aria-hidden />,
  bxgy: <Gift className="size-4" aria-hidden />,
  bab: <Tag className="size-4" aria-hidden />,
};

/**
 * "Buat promo" — the button and the dialog it opens (BO mockup `openPicker`).
 *
 * ALL FIVE TYPES ARE DRAWN; Harga coret (Promo V1, 8 November 2026) and
 * Diskon bertingkat (10 November 2026) open. The other three say "Menyusul"
 * and are disabled rather than hidden, so
 * the shop sees where the module is going and the dialog will not change shape
 * when they arrive.
 */
export function NewPromoButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Buat promo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Buat promo</DialogTitle>
            <DialogDescription>
              Pilih jenis. Semua jenis memakai struktur yang sama: syarat → hasil → batasan.
            </DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-2">
            {PROMO_TYPES.map((type) => {
              const available = AVAILABLE_PROMO_TYPES.includes(type);
              return (
                <li key={type}>
                  <button
                    type="button"
                    disabled={!available}
                    onClick={() => {
                      setOpen(false);
                      router.push(promoNewHref(type));
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left transition",
                      "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      available
                        ? "cursor-pointer hover:bg-surface-hover hover:shadow-md"
                        : "cursor-not-allowed opacity-70",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 flex-none items-center justify-center rounded-lg",
                        available ? "bg-navy-100 text-primary" : "bg-tint-neutral text-muted",
                      )}
                    >
                      {TYPE_ICON[type]}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                        {PROMO_TYPE_LABEL[type]}
                        {!available && (
                          <span className="rounded-full bg-tint-warning px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                            Menyusul
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-sm text-muted">{PROMO_TYPE_HINT[type]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
