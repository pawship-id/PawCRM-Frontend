"use client";

import { useEffect, useState } from "react";

import { env } from "@/utils/env";

/**
 * ─── THE GOOGLE MAPS JAVASCRIPT API, LOADED ONCE PER TAB ───────────────────
 *
 * Behind "Pilih dari peta" on a trip's address (28 September 2026), the option
 * `TripPointFields` has carried disabled since the day it was written.
 *
 * ONLY TWO APIS ARE TOUCHED — Maps JavaScript (the tiles) and Geocoding (an
 * address from a pin, a pin from a search). Places Autocomplete is deliberately
 * NOT loaded: it is a third SKU with its own free tier, its own enablement step
 * and a web component whose event names have moved twice, and a shop pinning
 * its own customers' houses does it by dragging the map far more often than by
 * typing a street name. Add `libraries=places` here when somebody asks for the
 * suggestion list — nothing else in this file changes.
 *
 * ONE SCRIPT TAG FOR THE WHOLE TAB, held in a module-level promise. Four
 * addresses can be open on one booking form; four `<script>` tags would each
 * count as a map load and Google would only honour the first anyway.
 *
 * NOT `next/script`. The picker needs to know the moment the API is usable, and
 * a promise is the plainest way to say that — no component-tree placement, no
 * strategy to choose, nothing that moves between Next majors.
 */

/** The bits of `google.maps` this feature uses, and nothing more. */
export interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}

export interface GoogleMap {
  setCenter: (position: LatLngLiteral) => void;
  getCenter: () => GoogleLatLng | undefined;
  setZoom: (zoom: number) => void;
  getZoom: () => number | undefined;
  panTo: (position: LatLngLiteral) => void;
  addListener: (event: string, handler: () => void) => { remove: () => void };
}

interface GeocoderResult {
  formatted_address?: string;
  geometry?: { location?: GoogleLatLng };
}

interface Geocoder {
  geocode: (request: {
    address?: string;
    location?: LatLngLiteral;
    region?: string;
  }) => Promise<{ results: GeocoderResult[] }>;
}

interface GoogleMapsApi {
  maps: {
    Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    Geocoder: new () => Geocoder;
  };
}

declare global {
  interface Window {
    google?: GoogleMapsApi;
    /** The `callback=` the bootstrap script calls once `google.maps` exists. */
    __pawcrmGoogleMapsReady?: () => void;
  }
}

const CALLBACK = "__pawcrmGoogleMapsReady";

/**
 * The map's language and country. Hard-coded rather than read from a locale:
 * every tenant is Indonesian, and `region=ID` is what makes a search for
 * "Kelapa Gading" land in Jakarta instead of biasing to the browser's country.
 */
const LANGUAGE = "id";
const REGION = "ID";

/** Shared by every picker in the tab — see the note above. */
let loading: Promise<void> | null = null;

function loadScript(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();

  return new Promise((resolve, reject) => {
    window[CALLBACK] = () => resolve();

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      v: "weekly",
      language: LANGUAGE,
      region: REGION,
      // `loading=async` is what Google asks for, and it is why the callback
      // above exists: with it, `google.maps` is NOT ready at the script's own
      // load event.
      loading: "async",
      callback: CALLBACK,
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      /*
        LET THE NEXT PICKER TRY AGAIN. A failed load is usually the network or a
        key restriction somebody is in the middle of fixing, and a promise
        cached as rejected would keep saying no for the rest of the session.
      */
      loading = null;
      reject(new Error("Google Maps gagal dimuat"));
    };

    document.head.appendChild(script);
  });
}

export type GoogleMapsState = "unconfigured" | "loading" | "ready" | "failed";

/**
 * Loads the API on first use and reports where it got to.
 *
 * `enabled` is how a dialog avoids paying for a map nobody opened: the picker
 * passes `open`, so a booking form with four addresses on it loads Maps when
 * the first one is actually looked at and never on the way to the page.
 */
export function useGoogleMaps(enabled: boolean): {
  state: GoogleMapsState;
  /** Try the script again after a failure — see `loadScript`'s onerror. */
  retry: () => void;
} {
  const key = env.googleMapsApiKey;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GoogleMapsState>(() =>
    key ? "loading" : "unconfigured",
  );

  useEffect(() => {
    if (!enabled || !key) return;

    let alive = true;

    loading ??= loadScript(key);
    loading.then(
      () => alive && setState("ready"),
      () => alive && setState("failed"),
    );

    return () => {
      alive = false;
    };
  }, [enabled, key, attempt]);

  return {
    state: key ? state : "unconfigured",
    retry: () => {
      setState("loading");
      setAttempt((n) => n + 1);
    },
  };
}

/** Whether "Pilih dari peta" can be offered at all. */
export const mapsConfigured = () => env.googleMapsApiKey !== "";

/** A geocoder, made once per tab — constructing one per lookup is waste. */
let geocoder: Geocoder | null = null;

function geocoderOf(): Geocoder | null {
  if (!window.google?.maps) return null;
  geocoder ??= new window.google.maps.Geocoder();
  return geocoder;
}

/**
 * THE PIN'S ADDRESS. Returns null rather than throwing — a pin with no address
 * is still a perfectly good pin, and the fare is measured from the numbers.
 */
export async function addressAt(point: LatLngLiteral): Promise<string | null> {
  const service = geocoderOf();
  if (!service) return null;

  try {
    const { results } = await service.geocode({ location: point });
    return results[0]?.formatted_address ?? null;
  } catch {
    // ZERO_RESULTS rejects here. Open sea, a new estate — both are ordinary.
    return null;
  }
}

/** WHERE A SEARCH POINTS. Null when Google recognises nothing. */
export async function searchAddress(
  query: string,
): Promise<{ point: LatLngLiteral; address: string } | null> {
  const service = geocoderOf();
  if (!service) return null;

  try {
    const { results } = await service.geocode({ address: query, region: REGION });
    const found = results[0];
    const location = found?.geometry?.location;

    if (!found || !location) return null;

    return {
      point: { lat: location.lat(), lng: location.lng() },
      address: found.formatted_address ?? query,
    };
  } catch {
    return null;
  }
}

/** Exported for the tests, which load a fresh module per case. */
export function __resetGoogleMapsLoader() {
  loading = null;
  geocoder = null;
}
