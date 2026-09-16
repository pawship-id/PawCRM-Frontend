"use client";

import Link from "next/link";
import { PawPrint, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
/*
  THE ONE REACH INTO ANOTHER FEATURE, and it is a route constant with no imports
  of its own — the grooming booking form owns its address, and writing the path
  out here by hand is how two copies of it drift apart.
*/
import { GROOMING_NEW_BOOKING_PATH } from "@/features/grooming/paths";

/**
 * "Booking baru" — pick the kind of work first, because the forms differ.
 *
 * ─── TWO DOORS, NOT THE MOCKUP'S THREE ─────────────────────────────────────
 *
 * The mockup offers Grooming, Hotel and Antar-Jemput. Hotel has no form of its
 * own — a night's boarding is a service in the catalogue like any other, taken
 * on the general form — and antar-jemput is not a booking at all: it is asked
 * for ON one, by the two trip fields inside either form. Offering either as a
 * door would be a door onto a room that does not exist.
 *
 * LINKS, NOT HANDLERS, so both are addresses somebody can open in a new tab.
 */
export function TodayNewBookingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Booking baru</DialogTitle>
          <DialogDescription>
            Pilih jenis pekerjaannya dulu — bentuk formulirnya berbeda.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Choice
            href={GROOMING_NEW_BOOKING_PATH}
            icon={<Scissors className="size-5" aria-hidden />}
            title="Grooming"
            description="Varian dan ukuran hewan, tahapan, harga dan diskon per baris."
            onPicked={() => onOpenChange(false)}
          />
          <Choice
            href="/dashboard/booking/new"
            icon={<PawPrint className="size-5" aria-hidden />}
            title="Layanan lain"
            description="Hotel, day care, atau layanan apa pun di katalog — bisa beberapa hewan sekali simpan."
            onPicked={() => onOpenChange(false)}
          />
        </div>

        <p className="text-sm text-muted">
          Jemput dan antar diminta di dalam formulirnya, bukan sebagai booking
          tersendiri.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  href,
  icon,
  title,
  description,
  onPicked,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onPicked: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onPicked}
      className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-primary hover:bg-surface-hover focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-navy-100 text-primary">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{description}</span>
      </span>
    </Link>
  );
}
