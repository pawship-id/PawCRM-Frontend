"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

import type { LocationFieldsValue } from "@/components";
import { Button } from "@/components/ui/button";

import { mapsConfigured } from "@/features/antar-jemput/googleMaps";
import {
  MapPointPicker,
  type MapPoint,
} from "@/features/antar-jemput/components/MapPointPicker";

/**
 * "Pilih dari peta" for a warehouse's address and pin.
 *
 * It writes the same three values typing writes — `address`, `lat`, `lng` — so
 * the two forms keep their own state and `LocationFields` stays the manual
 * fallback beneath it. The picker is the one Antar-Jemput built; this is only
 * the button that opens it and the translation between its numbers and the
 * form's strings (see `LocationFields` for why those are strings).
 */
export function WarehousePinButton({
  address,
  location,
  disabled,
  onPick,
}: {
  address: string;
  location: LocationFieldsValue;
  disabled?: boolean;
  onPick: (point: {
    address: string;
    location: LocationFieldsValue;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const configured = mapsConfigured();

  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const pinned =
    location.lat.trim() !== "" &&
    location.lng.trim() !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  /*
    THE COORDINATES THE ADDRESS WAS WRITTEN FOR. Typing a new lat/lng under an
    old address leaves the two disagreeing, and the dialog would open on the new
    pin still showing the old street. When the pair no longer matches this, the
    address is handed over blank so the picker looks it up again.
  */
  const key = (l: LocationFieldsValue) => `${l.lat.trim()},${l.lng.trim()}`;
  const [anchor, setAnchor] = useState(() => key(location));
  const addressIsStale = key(location) !== anchor;

  function handlePick(point: MapPoint) {
    // Six decimals is ~11 cm; Google's own centre carries fifteen digits.
    const picked = { lat: point.lat.toFixed(6), lng: point.lng.toFixed(6) };
    setAnchor(key(picked));
    onPick({
      // A pin dropped with the address box emptied should not wipe what was typed.
      address: point.address || address,
      location: picked,
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || !configured}
        onClick={() => setOpen(true)}
      >
        <MapPin />
        {pinned ? "Ubah titik di peta" : "Pilih dari peta"}
      </Button>
      {!configured && (
        <p className="text-sm text-muted">
          Peta belum diaktifkan. Isi latitude dan longitude secara manual.
        </p>
      )}

      <MapPointPicker
        open={open}
        title="Lokasi gudang"
        value={
          pinned
            ? { address: addressIsStale ? "" : address, lat, lng }
            : null
        }
        onOpenChange={setOpen}
        onPick={handlePick}
      />
    </div>
  );
}
