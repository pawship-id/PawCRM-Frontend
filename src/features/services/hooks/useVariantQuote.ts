"use client";

import { useCallback, useMemo } from "react";

import { useVariantOptions } from "@/hooks/useVariantOptions";
import { useZones } from "@/hooks/useZones";
import type { GeoLocation, Pet, Service, VariantChoice, VariantOption } from "@/types/api";
import {
  priceForPet,
  staffAxesOf,
  variesByZone,
  type PriceLookup,
} from "@/utils/serviceVariant";
import { resolveZone, ZONE_FAILURE_MESSAGE, type ZoneLookup } from "@/utils/zoneDistance";

type Priced = Parameters<typeof priceForPet>[0];
type Pin = Pick<GeoLocation, "lat" | "lng"> | null | undefined;

/**
 * What a transaction screen needs to PREVIEW a price beyond the pet
 * (17 September 2026) — booking, till and invoice alike.
 *
 *   zone          — the zone the customer is in, measured from the chosen
 *                   branch (utils/zoneDistance.ts), or why it cannot be said.
 *   zoneText      — that answer as one line: "Zona A · 2,1 km" or the reason.
 *   quote(...)    — `priceForPet` with the zone and the staff's choices.
 *   problemOf(..) — what a quote is missing beyond the pet, as a sentence, or
 *                   null (the pet-axis reasons stay with each screen).
 *   cardsFor(..)  — the "Dipilih staf" cards the given services declare, in
 *                   card order — what `VariantChoicePicker` draws.
 *   needsZone(..) — whether any of the given services varies by Zona.
 *
 * A PREVIEW: the server measures and matches again, and is what the line
 * stores. It refuses with the same sentences.
 */
export function useVariantQuote({ branchPin, customerPin }: { branchPin: Pin; customerPin: Pin }) {
  const cards = useVariantOptions();
  const zones = useZones();

  const zone: ZoneLookup = useMemo(
    () => resolveZone(branchPin, customerPin, zones.items),
    [branchPin, customerPin, zones.items],
  );

  const zoneText = zone.ok
    ? `${zone.zone.name} · ${String(zone.distanceKm).replace(".", ",")} km`
    : zone.reason === "outside_zones"
      ? `${ZONE_FAILURE_MESSAGE.outside_zones} (${String(zone.distanceKm).replace(".", ",")} km)`
      : ZONE_FAILURE_MESSAGE[zone.reason];


  const quote = useCallback(
    (
      service: Priced,
      pet: Pet | null | undefined,
      choices?: readonly VariantChoice[] | null,
      /*
        A ZONE OTHER THAN THE TRANSACTION'S (24 September 2026). An antar-jemput
        line is a band of the distance THE VAN DRIVES, and a document may carry
        several journeys going different ways — so the caller resolves each one
        with `zoneBetween` and quotes it here. Everything else leaves it out and
        gets the transaction's own zone.
      */
      zoneOverride?: ZoneLookup,
    ): PriceLookup => {
      const found = zoneOverride ?? zone;
      return priceForPet(service, pet, {
        zoneId: found.ok ? found.zone._id : null,
        choices,
      });
    },
    [zone],
  );

  /**
   * The zone between two given points, out of the bands this hook already
   * holds — no second read, however many journeys a document carries.
   */
  const zoneBetween = useCallback(
    (from: Pin, to: Pin): ZoneLookup => resolveZone(from, to, zones.items),
    [zones.items],
  );

  /** One zone as a line — "Zona A · 2,1 km", or why it cannot be said. */
  const textOf = useCallback(
    (found: ZoneLookup): string =>
      found.ok
        ? `${found.zone.name} · ${String(found.distanceKm).replace(".", ",")} km`
        : found.reason === "outside_zones"
          ? `${ZONE_FAILURE_MESSAGE.outside_zones} (${String(found.distanceKm).replace(".", ",")} km)`
          : ZONE_FAILURE_MESSAGE[found.reason],
    [],
  );

  const cardName = useCallback(
    (optionId: string) => cards.items.find((card) => card.axisKey === optionId)?.name ?? "opsi",
    [cards.items],
  );

  const problemOf = useCallback(
    (service: Pick<Service, "name">, lookup: PriceLookup): string | null => {
      if (lookup.missingZone) return `${zoneText} — harga ${service.name} ditentukan dari zona`;
      if (lookup.missingChoice) return `Pilih ${cardName(lookup.missingChoice)} untuk ${service.name} dulu`;
      return null;
    },
    [zoneText, cardName],
  );

  const cardsFor = useCallback(
    (services: ReadonlyArray<Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined>): VariantOption[] => {
      const wanted = new Set(services.flatMap((service) => staffAxesOf(service)));
      return cards.items
        .filter((card) => card.deletedAt === null && wanted.has(card.axisKey))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [cards.items],
  );

  const needsZone = useCallback(
    (services: ReadonlyArray<Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined>) =>
      services.some((service) => variesByZone(service)),
    [],
  );

  return {
    zone,
    zoneText,
    zoneBetween,
    zoneTextOf: textOf,
    quote,
    problemOf,
    cardsFor,
    needsZone,
    loading: cards.loading || zones.loading,
  };
}
