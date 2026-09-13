"use client";

import { useEffect, useState } from "react";

import { serviceService } from "@/services/service.service";

interface Loaded {
  key: string;
  all: number;
  active: number;
}

/**
 * "6 aktif dari 6" — the Grooming line's whole catalogue, whatever the filters
 * say. Two one-row queries read off `pagination.total`, the trick every header
 * hook here plays.
 *
 * `version` IS BUMPED BY THE SCREEN after a delete or restore, the only things on
 * it that change either figure.
 *
 * NULL WHILE UNKNOWN OR FAILED: the line then reads "6 layanan" alone rather
 * than claiming a total it does not have.
 */
export function useGroomingServiceTotals(lineId: string | null, version: number) {
  const key = lineId ? `${lineId}:${version}` : "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!lineId) return;

    let active = true;

    Promise.all([
      serviceService.list({ businessLineId: lineId, limit: 1 }),
      serviceService.list({ businessLineId: lineId, isActive: true, limit: 1 }),
    ])
      .then(([all, live]) => {
        if (active) {
          setLoaded({
            key,
            all: all.pagination.total,
            active: live.pagination.total,
          });
        }
      })
      .catch(() => {
        if (active) setLoaded(null);
      });

    return () => {
      active = false;
    };
  }, [key, lineId]);

  return loaded && loaded.key === key
    ? { all: loaded.all, active: loaded.active }
    : null;
}
