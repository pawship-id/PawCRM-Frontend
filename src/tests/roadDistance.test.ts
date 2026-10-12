import { act, renderHook, waitFor } from "@testing-library/react";

import { zoneService } from "@/services/zone.service";
import { clearRoadDistances, roadDistanceOf, useRoadDistance } from "@/utils/roadDistance";
import { resolveZone } from "@/utils/zoneDistance";
import type { Zone } from "@/types/api";

jest.mock("@/services/zone.service");

const measure = zoneService.measure as jest.Mock;

const BRANCH = { lat: -7.2575, lng: 112.7521 };
const HOUSE = { lat: -7.2395, lng: 112.7521 };

/**
 * A FORM'S ZONE PREVIEW USES THE SERVER'S ROAD DISTANCE (11 October 2026) — the
 * crow's line until it answers, then the drive, so the preview is what the line
 * will store.
 */
beforeEach(() => {
  clearRoadDistances();
  measure.mockReset();
});

it("asks the server once, in a batch, and remembers the answer", async () => {
  measure.mockResolvedValue([{ distanceKm: 3.915, source: "road" }]);
  const { result } = renderHook(() => useRoadDistance());

  expect(result.current(BRANCH, HOUSE)).toBeNull();
  await waitFor(() => expect(result.current(BRANCH, HOUSE)).toEqual({ km: 3.915, source: "road" }));
  expect(measure).toHaveBeenCalledTimes(1);
  expect(measure).toHaveBeenCalledWith([{ from: BRANCH, to: HOUSE }]);

  act(() => {
    roadDistanceOf(BRANCH, HOUSE);
  });
  expect(measure).toHaveBeenCalledTimes(1);
});

it("keeps the crow's line when the server cannot be reached", async () => {
  measure.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useRoadDistance());

  result.current(BRANCH, HOUSE);
  await waitFor(() => expect(measure).toHaveBeenCalled());

  expect(result.current(BRANCH, HOUSE)).toBeNull();
});

it("matches the zone on the measured distance, and says when it was a straight line", () => {
  const zones = [
    { _id: "z-a", name: "Zona A", minKm: 0, maxKm: 3, deletedAt: null },
    { _id: "z-b", name: "Zona B", minKm: 3, maxKm: 6, deletedAt: null },
  ] as Zone[];

  expect(resolveZone(BRANCH, HOUSE, zones)).toMatchObject({ ok: true, zone: { name: "Zona A" } });
  expect(resolveZone(BRANCH, HOUSE, zones, { km: 3.915, source: "road" })).toMatchObject({
    ok: true,
    zone: { name: "Zona B" },
    distanceKm: 3.915,
    source: "road",
  });
});
