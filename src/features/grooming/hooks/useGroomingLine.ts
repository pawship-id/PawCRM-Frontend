"use client";

import { useEffect, useState } from "react";

import {
  businessLineService,
  type BusinessLine,
} from "@/services/businessLine.service";

import { pickGroomingLine } from "../board";

/**
 * The name a booking row snapshots when the line list cannot be read — see
 * `GroomingScope.lineName`.
 */
export const GROOMING_LINE_FALLBACK = "Grooming";

export interface GroomingLineState {
  line: BusinessLine | null;
  loading: boolean;
  /** The list loaded, and nothing on it is grooming. */
  missing: boolean;
  /** The list could not be read at all. */
  failed: boolean;
}

/**
 * The tenant's Grooming business line.
 *
 * A LINE IS A FREE LABEL THE TENANT NAMES, not an enum (businessLine.service),
 * so "which services are grooming" starts by finding it by name.
 */
export function useGroomingLine(): GroomingLineState {
  const [state, setState] = useState<GroomingLineState>({
    line: null,
    loading: true,
    missing: false,
    failed: false,
  });

  useEffect(() => {
    let active = true;

    businessLineService
      .list({ limit: 100 })
      .then((result) => {
        if (!active) return;
        const line = pickGroomingLine(result.items);
        setState({ line, loading: false, missing: line === null, failed: false });
      })
      .catch(() => {
        if (active) {
          setState({ line: null, loading: false, missing: false, failed: true });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
