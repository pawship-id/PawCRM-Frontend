"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The three the print stylesheet knows how to lay out. */
export const RECEIPT_SIZES = ["58", "80", "a4"] as const;

export type ReceiptSize = (typeof RECEIPT_SIZES)[number];

/**
 * What a till prints on before anybody tells it otherwise.
 *
 * 80 mm, because it is the common thermal roll and the one a shop that never
 * opens the setting is most likely to have. A4 as the default would waste a
 * sheet per sale for most of them.
 */
export const DEFAULT_RECEIPT_SIZE: ReceiptSize = "80";

/**
 * How each one is written, wherever it is named.
 *
 * Here rather than in a component because two places say it: Pengaturan Kasir
 * offers the choice, and the receipt dialog reports what the choice was.
 */
export const RECEIPT_SIZE_LABELS: Record<ReceiptSize, string> = {
  "58": "58 mm",
  "80": "80 mm",
  a4: "A4",
};

/*
  PER DEVICE, WHICH IS WHY IT IS NOT ON THE SERVER (FR-8: "sesuai konfigurasi
  printer per perangkat"). A shop has a thermal printer at the counter and an
  A4 printer in the back office, and the two are the same tenant, the same
  branch, often the same person. A tenant-level setting would be wrong for one
  of them every day.

  The consequence is the honest one: clearing the browser's data forgets it, and
  a cashier moving to another till sets it again there. That is what "per
  perangkat" means.
*/
const STORAGE_KEY = "buloo.pos.receiptSize";

function isReceiptSize(value: unknown): value is ReceiptSize {
  return RECEIPT_SIZES.includes(value as ReceiptSize);
}

/**
 * Reads the stored size, falling back for every way this can go wrong.
 *
 * localStorage THROWS, it does not merely return null: Safari in private mode
 * and a browser told to block site data both raise on access. A settings read
 * that takes the till down with it would be a worse bug than a forgotten paper
 * size.
 */
function readStored(): ReceiptSize {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isReceiptSize(stored) ? stored : DEFAULT_RECEIPT_SIZE;
  } catch {
    return DEFAULT_RECEIPT_SIZE;
  }
}

/*
  STORAGE IS THE SOURCE OF TRUTH, memory is the understudy.

  Reading straight from `localStorage` on every render is right for the browsers
  that work — nothing to keep in step, and another tab's write is visible the
  moment it happens. But a browser that REFUSES to write (a private window, site
  data blocked) would then have every read hand back the old value: the cashier
  clicks A4, the button stays on 80, and they print on the wrong paper while
  watching the screen deny the click.

  So a failed write flips this. From then on the value is remembered in memory
  for as long as the tab lives — the choice always applies; only its survival
  across a reload depends on storage working.
*/
let writable = true;
let inMemory: ReceiptSize | null = null;

function snapshot(): ReceiptSize {
  // A primitive, so `useSyncExternalStore` compares it by value and re-reading
  // per render costs nothing — there is no cache here to go stale.
  if (writable) return readStored();
  return inMemory ?? DEFAULT_RECEIPT_SIZE;
}

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  /*
    ANOTHER TAB WROTE THE KEY. A cashier with the till open twice should not have
    the two disagree about what they are about to print on.
  */
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The receipt paper size for THIS device (FR-8).
 *
 * `useSyncExternalStore` rather than `useState` + an effect, for two reasons
 * that both bite in practice: the server snapshot keeps the first paint and the
 * hydration agreeing on the default instead of flashing, and every component
 * reading this hook moves together — the picker in the settings dialog and the
 * one in the receipt dialog are the same value, not two copies to keep in step.
 */
export function useReceiptSize(): [ReceiptSize, (next: ReceiptSize) => void] {
  const size = useSyncExternalStore(
    subscribe,
    snapshot,
    // On the server there is no device, so there is nothing remembered yet.
    () => DEFAULT_RECEIPT_SIZE,
  );

  const setSize = useCallback((next: ReceiptSize) => {
    inMemory = next;

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      writable = true;
    } catch {
      writable = false;
      /*
        Storage refused — a private window, or site data blocked. The size still
        changed; it just will not survive a reload. Refusing to change it because
        it cannot be remembered would be the wrong trade at a counter.
      */
    }

    // `storage` does not fire in the tab that wrote it, so this is what tells
    // the other readers in THIS tab.
    notify();
  }, []);

  return [size, setSize];
}
