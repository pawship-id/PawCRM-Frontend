"use client";

import { useSyncExternalStore } from "react";

import {
  connectivitySnapshot,
  subscribeConnectivity,
  type ConnectivityState,
} from "@/lib/connectivity";

const SERVER_STATE: ConnectivityState = { status: "online", forced: false, lastChange: 0 };

export function useConnectivity(): ConnectivityState & { offline: boolean } {
  const current = useSyncExternalStore(subscribeConnectivity, connectivitySnapshot, () => SERVER_STATE);
  return { ...current, offline: current.forced || current.status === "offline" };
}
