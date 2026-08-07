"use client";

import { TextField } from "./TextField";
import {
  validateCoordinatePair,
  validateLatitude,
  validateLongitude,
} from "@/utils/validation";
import type { GeoLocation, GeoLocationInput } from "@/types/api";

/**
 * Latitude / longitude entry for a branch or a warehouse address.
 *
 * THIS COMPONENT IS THE SEAM. The goal is a Google Maps place picker so a
 * location can be pinned exactly; typing coordinates by hand is the stopgap
 * until it lands. Every form therefore talks to this component through a
 * `{ lat, lng }` value object and never to two loose input strings, so the
 * picker replaces the INSIDE of this file — a Places autocomplete and a
 * draggable marker — while BranchCreateForm, BranchEditForm and both warehouse
 * forms stay exactly as they are.
 *
 * The value is held as STRINGS, not numbers. Number-typed state cannot hold
 * "-6." — the intermediate a user is in the middle of typing — without either
 * rejecting the keystroke or snapping the caret to the end. Parsing happens
 * once, on submit, in `toGeoLocation`.
 *
 * Errors are read under the BACKEND's key ("location.lat"), so a form can hand
 * its whole `fieldErrors` map straight through with no remapping: Joi reports
 * nested paths dotted, and ApiError.fieldErrors strips only the leading "body.".
 */

/**
 * Google Maps puts a pin on the clipboard as "-6.260712, 106.813377". Pasting
 * that into either field fills BOTH, because splitting it by hand is precisely
 * where a digit goes missing — and copying a pin off Maps is the entire
 * workflow this interim solution exists to serve.
 */
const COORDINATE_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

export interface LocationFieldsValue {
  lat: string;
  lng: string;
}

export interface LocationFieldsProps {
  value: LocationFieldsValue;
  onChange: (value: LocationFieldsValue) => void;
  /** The form's whole fieldErrors map; the dotted backend keys are read here. */
  errors?: Record<string, string>;
  disabled?: boolean;
}

/** Seeds the inputs from an API document. A missing pin becomes empty fields. */
export function toLocationFieldsValue(
  location?: Pick<GeoLocation, "lat" | "lng"> | null,
): LocationFieldsValue {
  return {
    lat: location?.lat == null ? "" : String(location.lat),
    lng: location?.lng == null ? "" : String(location.lng),
  };
}

/**
 * Converts the inputs back into a request payload.
 *
 * Returns `null` — "clear the pin" — when both are blank, rather than
 * `{ lat: null, lng: null }`: `null` is what the API documents for a removal,
 * and having one representation of "no pin" leave this file means the four
 * forms cannot disagree about it.
 */
export function toGeoLocation(
  value: LocationFieldsValue,
): GeoLocationInput | null {
  const lat = value.lat.trim();
  const lng = value.lng.trim();

  if (lat === "" && lng === "") return null;

  return { lat: Number(lat), lng: Number(lng) };
}

/**
 * Client-side checks for the pin, keyed the way the backend keys them.
 *
 * Lives here rather than in each form because all four forms need the identical
 * three rules AND the identical error keys — and a key that drifts from the one
 * `LocationFields` reads produces an error the user never sees, which is worse
 * than no client validation at all. The server remains the authority; this is
 * the usual UX nicety that saves a round trip.
 */
export function validateLocationFields(
  value: LocationFieldsValue,
): Record<string, string> {
  const errors: Record<string, string> = {};

  const latError = validateLatitude(value.lat);
  const lngError = validateLongitude(value.lng);
  if (latError) errors["location.lat"] = latError;
  if (lngError) errors["location.lng"] = lngError;

  // Only worth asking once both values are individually well-formed; a pair
  // complaint on top of "must be a number" is noise.
  if (!latError && !lngError) {
    const pairError = validateCoordinatePair(value.lat, value.lng);
    if (pairError) {
      errors[`location.${pairError.field}`] = pairError.message;
    }
  }

  return errors;
}

export function LocationFields({
  value,
  onChange,
  errors = {},
  disabled,
}: LocationFieldsProps) {
  const lat = value.lat.trim();
  const lng = value.lng.trim();

  // Only meaningful once both are filled — half a pair has nowhere to point.
  const preview =
    lat !== "" && lng !== ""
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${lat},${lng}`,
        )}`
      : null;

  function handleChange(field: "lat" | "lng", raw: string) {
    onChange({ ...value, [field]: raw });
  }

  /**
   * Splits a pasted "lat, lng" pair across both inputs, whichever one received
   * it. Anything else falls through to the browser's ordinary paste.
   *
   * Hooked to PASTE specifically, not to change. Sniffing the pattern on every
   * keystroke looks equivalent and is not: someone typing the pair by hand
   * passes through the intermediate "-6.26, 1", which matches, so the split
   * fires mid-word and the remaining characters land in the wrong field.
   */
  function handlePaste(
    field: "lat" | "lng",
    event: React.ClipboardEvent<HTMLInputElement>,
  ) {
    const pair = COORDINATE_PAIR.exec(event.clipboardData.getData("text"));

    if (!pair) return;

    event.preventDefault();
    onChange({ lat: pair[1], lng: pair[2] });
  }

  return (
    <>
      <TextField
        label="Latitude"
        name="latitude"
        // Not type="number": that rejects "-6." mid-typing, adds spinners no
        // one wants on a coordinate, and lets a stray scroll change the value.
        inputMode="decimal"
        placeholder="Optional — e.g. -6.260712"
        value={value.lat}
        onChange={(e) => handleChange("lat", e.target.value)}
        onPaste={(e) => handlePaste("lat", e)}
        error={errors["location.lat"]}
        disabled={disabled}
        hint="Paste a “lat, lng” pair from Google Maps to fill both."
      />
      <TextField
        label="Longitude"
        name="longitude"
        inputMode="decimal"
        placeholder="Optional — e.g. 106.813377"
        value={value.lng}
        onChange={(e) => handleChange("lng", e.target.value)}
        onPaste={(e) => handlePaste("lng", e)}
        // The backend reports the all-or-nothing rule against the object
        // itself, so "location" is a real error key and belongs on the field a
        // half pair usually leaves empty.
        error={errors["location.lng"] ?? errors.location}
        disabled={disabled}
        hint={
          preview ? (
            // The plain Maps URL scheme: no API key, no billing, no SDK. The
            // pin can be eyeballed today, which is the point of the interim
            // step. The Places picker will replace this, not depend on it.
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Verify this pin on Google Maps
            </a>
          ) : (
            "Both coordinates are needed, or leave both blank."
          )
        }
      />
    </>
  );
}
