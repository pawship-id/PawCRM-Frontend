"use client";

import { useCallback, useState } from "react";

import * as demo from "../data/demoStore";
import type { DemoState } from "../data/demoStore";

/**
 * The single seam between the prototype screens and their data.
 *
 * Every stock screen reads through this hook, so wiring the module to the real
 * API later means changing THIS FILE and nothing else: the components take
 * plain props and never import the store directly.
 *
 * `version` is bumped after each write so React re-renders from a fresh
 * snapshot. The demo store keeps its state in a module variable rather than in
 * React state on purpose — three screens share it, and a page navigation
 * between them must not reset the stock a user just adjusted.
 */
export function useInventoryDemo() {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<DemoState>(() => demo.getState());

  const sync = useCallback(() => {
    setState(demo.getState());
    setVersion((n) => n + 1);
  }, []);

  const reset = useCallback(() => {
    demo.resetState();
    sync();
  }, [sync]);

  return { ...state, version, sync, reset };
}
