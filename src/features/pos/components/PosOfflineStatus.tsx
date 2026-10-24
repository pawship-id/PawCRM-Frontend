"use client";

import { CloudOff, RefreshCw, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * WHERE THE TILL IS SELLING FROM, ON THE SHIFT BAR (POS offline mode,
 * 19 October 2026).
 *
 * Always a word beside the icon (ui-rules §1.3): "Online", "Offline", and the
 * number of sales still waiting to be sent. It is a button because the list
 * behind it is where those sales are — and where they are sent from by hand.
 */
export function PosOfflineStatus({
  selling,
  connectionDown,
  pendingCount,
  reviewCount,
  syncing,
  onOpen,
}: {
  selling: "online" | "offline";
  /** The connection is down but this device cannot sell offline. */
  connectionDown: boolean;
  pendingCount: number;
  reviewCount: number;
  syncing: boolean;
  onOpen: () => void;
}) {
  const offline = selling === "offline" || connectionDown;
  const label = offline ? "Offline" : "Online";
  const waiting =
    pendingCount > 0
      ? ` · ${pendingCount} belum terkirim`
      : reviewCount > 0
        ? ` · ${reviewCount} perlu dicek`
        : "";

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onOpen}
      aria-label={`Status kasir: ${label}${waiting}`}
    >
      {syncing ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : offline ? (
        <CloudOff className="size-4" />
      ) : (
        <Wifi className="size-4" />
      )}
      {syncing ? "Mengirim…" : label}
      {waiting}
    </Button>
  );
}
