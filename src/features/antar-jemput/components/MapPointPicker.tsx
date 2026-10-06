"use client";

import { Crosshair, LocateFixed, MapPin, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, Spinner, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  addressAt,
  searchAddress,
  useGoogleMaps,
  type GoogleMap,
  type LatLngLiteral,
} from "../googleMaps";

/**
 * ─── PILIH DARI PETA (28 September 2026) ───────────────────────────────────
 *
 * The picker `TripPointFields` has offered disabled since it was written, and
 * the reason `location` is a subdocument on the server. It writes the same
 * three values a typed address writes — `address`, `lat`, `lng` — so nothing
 * downstream of it changes: the zone still comes from the distance between two
 * pins, and the booking, the basket and the bill all take the shape they took
 * before.
 *
 * ─── THE PIN DOES NOT MOVE; THE MAP DOES ───────────────────────────────────
 *
 * There is no marker object. A pin is drawn in the middle of the box and stays
 * there while the map slides underneath it, and what gets saved is wherever the
 * map came to rest. This is how every delivery app in the country asks the same
 * question, so nobody has to be taught it — and it sidesteps a real constraint:
 * `AdvancedMarkerElement` needs a Map ID created in Cloud Console, which is one
 * more setup step to get wrong, and the old `Marker` it would replace is
 * deprecated. A pin that is a `<div>` outlives both.
 *
 * ─── AND IT IS A DIALOG, NOT AN INLINE MAP ─────────────────────────────────
 *
 * A booking for both directions asks for four addresses. Four inline maps is
 * four map loads on a page somebody may only have opened to change a time —
 * Maps is billed per load — and four 260 px boxes on a form nobody can see the
 * bottom of. One map, opened when an address is actually being pinned.
 */

/** Jakarta. The fallback when a tenant has pinned neither a branch nor a customer. */
const DEFAULT_CENTER: LatLngLiteral = { lat: -6.2088, lng: 106.8456 };

/** Building level when there is a pin to look at; district level when there is not. */
const PINNED_ZOOM = 17;
const SEARCHING_ZOOM = 13;

/**
 * How long the map must sit still before its address is looked up.
 *
 * A drag fires `idle` once, but a two-finger pan on a phone fires it several
 * times a second, and each one is a billed Geocoding request. 600 ms is past
 * the end of a gesture and short enough that the address is there before
 * anybody reaches for the button.
 */
const SETTLE_MS = 600;

/** Six decimals is ~11 cm — past the point a pin means anything. */
const coordText = (value: number) => value.toFixed(6);

export interface MapPoint {
  address: string;
  lat: number;
  lng: number;
}

export function MapPointPicker({
  open,
  title,
  value,
  fallbackCenter,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  /** Which end is being pinned — "Alamat asal", "Tujuan". */
  title: string;
  /** What the field holds now, or null for an end nobody has pinned yet. */
  value: MapPoint | null;
  /** Where to open when there is no pin yet — the branch, then the customer. */
  fallbackCenter?: LatLngLiteral | null;
  onOpenChange: (open: boolean) => void;
  onPick: (point: MapPoint) => void;
}) {
  const { state, retry } = useGoogleMaps(open);

  /*
    THE MAP IS BUILT AGAINST A NODE IN STATE, not a ref. Radix unmounts the
    dialog's contents while it is closed, so a ref read in an effect is null on
    the pass that matters; a callback ref that sets state re-runs the effect on
    the render where the box actually exists.
  */
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const map = useRef<GoogleMap | null>(null);

  const [center, setCenter] = useState<LatLngLiteral>(DEFAULT_CENTER);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  /*
    ⚠️ WHERE THE DIALOG OPENED, and the reason the first `idle` does not cost a
    request: a pin that came in with an address of its own has nothing to look
    up, and re-geocoding it would replace what somebody typed ("depan warung
    biru") with Google's own wording before they had touched anything.
  */
  const opened = useRef<LatLngLiteral | null>(null);
  /* A pin that arrives with an EMPTY address still needs one looked up — the
     caller blanks it when the coordinates were edited after the address was set. */
  const openedWithAddress = useRef(false);

  /* Filled from the field each time it opens, and edited on a copy — Batal
     must leave the address exactly as it was. */
  useEffect(() => {
    if (!open) return;

    const start =
      value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
        ? { lat: value.lat, lng: value.lng }
        : (fallbackCenter ?? DEFAULT_CENTER);

    opened.current = value ? start : null;
    openedWithAddress.current = !!value?.address.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCenter(start);
    setAddress(value?.address ?? "");
    setQuery("");
    setNotFound(false);
  }, [open, value, fallbackCenter]);

  /* The map itself, made once per opening and thrown away with the dialog. */
  useEffect(() => {
    if (!box || state !== "ready" || !window.google?.maps) return;

    const created = new window.google.maps.Map(box, {
      center,
      zoom: opened.current ? PINNED_ZOOM : SEARCHING_ZOOM,
      // Off, all of them: this box asks one question, and Street View, the
      // satellite toggle and the fullscreen button are three ways to leave it.
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      // Kept — a pin is placed by zooming in, and a pinch is not always available.
      zoomControl: true,
      gestureHandling: "greedy",
      clickableIcons: false,
    });

    map.current = created;

    const listener = created.addListener("idle", () => {
      const at = created.getCenter();
      if (at) setCenter({ lat: at.lat(), lng: at.lng() });
    });

    return () => {
      listener.remove();
      map.current = null;
    };
    // `center` is the map's STARTING point here; re-running on every pan would
    // rebuild the map under the finger doing the panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, state]);

  /*
    ─── THE ADDRESS UNDER THE PIN ────────────────────────────────────────────

    Debounced past the end of the gesture, and skipped entirely for the point
    the dialog opened on — see `opened`.
  */
  useEffect(() => {
    if (!open || state !== "ready") return;

    const from = opened.current;
    if (
      from &&
      openedWithAddress.current &&
      from.lat === center.lat &&
      from.lng === center.lng
    )
      return;

    let alive = true;
    setLooking(true);

    const timer = setTimeout(async () => {
      const found = await addressAt(center);
      if (!alive) return;
      setLooking(false);
      if (found) setAddress(found);
    }, SETTLE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
      setLooking(false);
    };
  }, [center, open, state]);

  const moveTo = useCallback((point: LatLngLiteral, zoom = PINNED_ZOOM) => {
    setCenter(point);
    map.current?.panTo(point);
    map.current?.setZoom(zoom);
  }, []);

  async function runSearch() {
    const text = query.trim();
    if (!text || searching) return;

    setSearching(true);
    setNotFound(false);

    const found = await searchAddress(text);

    setSearching(false);

    if (!found) {
      setNotFound(true);
      return;
    }

    /* The search answers both questions at once, so the debounced lookup above
       has nothing left to do — which is what pointing `opened` at it says. */
    opened.current = found.point;
    setAddress(found.address);
    moveTo(found.point);
  }

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        opened.current = null;
        moveTo({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      /* A refused permission is an answer, not an error worth a banner —
         the map is still there to drag. */
      () => {},
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function save() {
    onPick({
      address: address.trim(),
      lat: center.lat,
      lng: center.lng,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Geser petanya sampai pin tepat di lokasinya, lalu tekan Gunakan titik
            ini.
          </DialogDescription>
        </DialogHeader>

        {state === "unconfigured" ? (
          <Alert variant="warning">
            Peta belum diaktifkan untuk toko ini. Minta admin mengaturnya, atau
            isi alamat dan titiknya lewat Ketik manual.
          </Alert>
        ) : state === "failed" ? (
          <div className="flex flex-col gap-3">
            <Alert variant="error">
              Petanya tidak bisa dimuat. Cek koneksi internetnya, lalu coba lagi.
            </Alert>
            <Button type="button" variant="secondary" onClick={retry}>
              Coba lagi
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* ─── CARI ALAMAT ─── */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                  />
                  <input
                    type="search"
                    aria-label="Cari alamat"
                    placeholder="Cari alamat atau nama tempat"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setNotFound(false);
                    }}
                    /* The dialog is portalled out of the booking form, so Enter
                       cannot submit it — this is only to stop the browser's own
                       search-field behaviour. */
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void runSearch();
                    }}
                    disabled={state !== "ready"}
                    className="h-11 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <Button
                  type="button"
                  className="h-11"
                  disabled={state !== "ready" || searching || !query.trim()}
                  onClick={() => void runSearch()}
                >
                  {searching ? <Spinner /> : null}
                  Cari
                </Button>
              </div>

              {notFound && (
                <p className="text-sm font-semibold text-danger" role="alert">
                  Alamat itu tidak ketemu. Coba kata lain, atau geser petanya
                  langsung.
                </p>
              )}
            </div>

            {/* ─── PETA, DENGAN PIN YANG DIAM DI TENGAH ─── */}
            <div className="relative h-72 overflow-hidden rounded-xl border border-border bg-surface">
              <div ref={setBox} className="size-full" />

              {state === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface text-sm text-muted">
                  <Spinner /> Memuat peta…
                </div>
              )}

              {state === "ready" && (
                <>
                  {/* The pin. `-translate-y-full` puts its POINT on the centre
                      of the box, not its middle — a pin that marks its own
                      waist is off by half its height, every time. */}
                  <MapPin
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-full fill-primary text-primary drop-shadow-md"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    aria-label="Ke lokasi saya"
                    title="Ke lokasi saya"
                    className="absolute right-3 bottom-3 shadow-md"
                    onClick={useMyLocation}
                  >
                    <LocateFixed />
                  </Button>
                </>
              )}
            </div>

            {/* ─── TITIKNYA, DALAM ANGKA ─── */}
            <p className="flex items-center gap-2 text-sm text-muted tabular-nums">
              <Crosshair aria-hidden className="size-4 shrink-0" />
              <span>
                Titik: {coordText(center.lat)}, {coordText(center.lng)}
              </span>
              {looking && <Spinner />}
            </p>

            {/*
              EDITABLE, and that is the point of having it here. Google returns
              the street and the number; a driver needs "pagar hijau, sebelah
              warung" — and the pin is what the fare is measured from either way.
            */}
            <TextareaField
              label="Alamat"
              name="map-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Alamat terisi otomatis dari peta — tambahkan patokan kalau perlu"
              hint="Boleh diubah. Yang dipakai menghitung tarif adalah titiknya, bukan tulisannya."
            />
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" disabled={state !== "ready"} onClick={save}>
            Gunakan titik ini
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
