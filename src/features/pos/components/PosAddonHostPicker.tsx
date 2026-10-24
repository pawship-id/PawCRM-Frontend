"use client";

import { Alert, Spinner } from "@/components";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BookingStatusBadge } from "@/features/booking";
import type { PosAddonHost } from "@/types/api";

/** One option's radio value — a booking is one animal and one main service. */
export const addonHostKey = (host: PosAddonHost) =>
  `${host.source}:${host.bookingId ?? ""}:${host.serviceId}`;

/**
 * The option picked before the cashier picks one: the first host that does not
 * already carry this add-on, else "Booking baru". A host with `hasAddon` is
 * drawn but disabled — the server refuses the same add-on twice on one
 * booking (21 October 2026).
 */
export const defaultAddonHost = (hosts: PosAddonHost[]): string => {
  const first = hosts.find((host) => !host.hasAddon);
  return first ? addonHostKey(first) : NEW_ADDON_BOOKING;
};

/** "Jum, 24 Okt · 10.00" — when the diary has it. */
function whenOf(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "ADD-ON INI UNTUK LAYANAN YANG MANA?" (21 October 2026).
 *
 * An add-on picked alone off the grid used to raise a booking of its own — a
 * second appointment for a spray of perfume on a dog already in for a bath,
 * which the groomer then saw as two jobs. Once the animal is chosen the till
 * asks where it goes: one of that animal's unfinished groomings ALREADY IN
 * THIS BASKET, one in the DIARY (pulled into the basket in the same tap), or a
 * new booking holding only the add-on — what happened before.
 *
 * INLINE IN THE ANIMAL DIALOG (21 October 2026, on request), right under the
 * price, as soon as the animal is clicked — not a second dialog after
 * "Tambah ke keranjang". The dialog owns the list and the choice; this only
 * draws it. `value` is `addonHostKey(host)` or `NEW_ADDON_BOOKING`.
 */
export const NEW_ADDON_BOOKING = "new";

export function PosAddonHostPicker({
  hosts,
  value,
  onChange,
  loading = false,
  loadError = null,
  disabled = false,
}: {
  hosts: PosAddonHost[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  /** The list could not be read — "Booking baru" is still offered. */
  loadError?: string | null;
  disabled?: boolean;
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner size={14} /> Mencari grooming hewan ini…
      </p>
    );
  }

  /* Nothing to offer and nothing failed: the add-on is its own booking, as before. */
  if (hosts.length === 0 && !loadError) return null;

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">Tambahkan ke layanan yang mana?</legend>

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <RadioGroup
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        aria-label="Tempat add-on"
        className="gap-2"
      >
        {hosts.map((host) => {
          const key = addonHostKey(host);
          const id = `addon-host-${key.replace(/[^a-z0-9]/gi, "-")}`;

          const taken = host.hasAddon;

          return (
            <div
              key={key}
              className={`flex min-h-11 items-start gap-3 rounded-lg border border-border p-3${taken ? " bg-surface-hover" : ""}`}
            >
              <RadioGroupItem
                value={key}
                id={id}
                className="mt-1"
                disabled={taken}
                aria-describedby={taken ? `${id}-taken` : undefined}
              />
              <Label
                htmlFor={id}
                className={`flex min-w-0 flex-1 flex-col items-start gap-1 ${taken ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span className="text-sm font-medium text-foreground">
                  {host.serviceName ?? "Layanan"}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-sm font-normal text-muted">
                  <span>
                    {host.source === "cart"
                      ? "Di keranjang ini"
                      : host.scheduledAt
                        ? whenOf(host.scheduledAt)
                        : "Tanpa jadwal"}
                  </span>
                  {host.status && <BookingStatusBadge status={host.status} />}
                  {host.bookingNumber && (
                    <span className="tabular-nums">{host.bookingNumber}</span>
                  )}
                </span>
                {taken ? (
                  <span id={`${id}-taken`} className="text-xs font-normal text-muted">
                    Sudah ada add-on ini
                  </span>
                ) : (
                  host.source === "diary" && (
                    <span className="text-xs font-normal text-muted">
                      Booking ini ikut ditarik ke keranjang.
                    </span>
                  )
                )}
              </Label>
            </div>
          );
        })}

        <div className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3">
          <RadioGroupItem value={NEW_ADDON_BOOKING} id="addon-host-new" className="mt-1" />
          <Label
            htmlFor="addon-host-new"
            className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1"
          >
            <span className="text-sm font-medium text-foreground">
              Booking baru (hanya add-on ini)
            </span>
            <span className="text-xs font-normal text-muted">
              Add-on dicatat sebagai booking tersendiri.
            </span>
          </Label>
        </div>
      </RadioGroup>
    </fieldset>
  );
}
