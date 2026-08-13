"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { stockOpnameService } from "@/services/stockOpname.service";
import { ApiError } from "@/services/api-error";
import type { Opname, OpnameItem, OpnameItemInput } from "@/types/inventory";
import { trimQty } from "@/utils/decimal";

/**
 * Long enough that typing "12" is one request rather than two, short enough that
 * a counter who looks up after a line still sees it saved. The trade is a
 * request per burst of typing, not per keystroke.
 */
const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * The lines as the sheet EDITS them: `physicalQty` shortened to what a person
 * would write.
 *
 * The API stores four decimals, which is right for a ledger and wrong for the
 * box somebody types into — a counter who enters `1` and is answered `1.0000`
 * reads that as the form having changed their number. Applied where server lines
 * arrive rather than at the input, so a half-typed `1.50` is never shortened
 * under the cursor.
 *
 * ONLY `physicalQty`, the one field a client may set. Every other quantity is
 * rendered through `formatQty`, which localises for reading and must not be fed
 * back into a payload.
 */
function forEditing(items: OpnameItem[] | undefined): OpnameItem[] {
  return (items ?? []).map((item) => ({
    ...item,
    physicalQty: trimQty(item.physicalQty),
  }));
}

/** What the save indicator shows. `saved` carries the time it happened. */
export type SaveState = "idle" | "saving" | "saved" | "error";

/** The fields a counter may change on one line. */
export interface LineEdit {
  physicalQty?: string;
  notes?: string | null;
  batchCode?: string;
  expiryDate?: string;
}

interface UseOpnameSheetResult {
  opname: Opname | null;
  /** The lines as they should render — local edits included. */
  items: OpnameItem[];
  loading: boolean;
  /** A load failure, or the API's refusal of a save. */
  error: string | null;
  saveState: SaveState;
  lastSavedAt: Date | null;
  /** How many lines somebody has actually walked up to. */
  countedCount: number;
  /** Edits one line and schedules a save. */
  editLine: (productId: string, patch: LineEdit) => void;
  /** Marks a line counted (or un-counts it) and schedules a save. */
  setCounted: (productId: string, counted: boolean) => void;
  /**
   * Takes a product back off the sheet and saves at once. Drafts only — the
   * caller gates on that, as it does for every other edit here.
   */
  removeLine: (productId: string) => Promise<void>;
  /** Flushes any pending edit immediately — call before submitting. */
  flush: () => Promise<void>;
  /**
   * Puts more products on the sheet. Resolves to the API's refusal, or null
   * when it worked — the dialog keeps itself open to show the message.
   */
  addProducts: (productIds: string[]) => Promise<string | null>;
  /**
   * Fills the sheet with the rest of the warehouse, within the scope it was
   * opened with. Same contract as `addProducts` — a message, or null.
   */
  addEveryProduct: () => Promise<string | null>;
  /** True while an add is in flight, so the buttons can disable themselves. */
  adding: boolean;
  /** Re-reads the sheet from the server, discarding nothing (nothing is dirty). */
  reload: () => void;
}

/**
 * One count sheet, its auto-save, and the arithmetic it deliberately does not do.
 *
 * THE SERVER OWNS EVERY DERIVED NUMBER. A save sends `physicalQty` and
 * `counted`; the response comes back with `systemQty`, `diffQty`, `hppAtOpname`,
 * `diffValue` and the sheet total recomputed, and those replace what is on
 * screen. The browser could subtract two numbers, but the system quantity is
 * RE-READ at submit — a draft sits open for hours while the shop keeps selling —
 * so a locally computed variance would drift from the one that will actually be
 * posted, and would drift silently.
 *
 * OPTIMISTIC ON THE WAY IN, AUTHORITATIVE ON THE WAY BACK. A keystroke updates
 * the line immediately (a count sheet that lagged the typing would be unusable),
 * and the server's answer overwrites it — but only if no newer edit happened
 * while the request was in flight. That is what `revisionRef` is for: without it
 * a slow save would land on top of the two lines typed after it and quietly undo
 * them, which on a stock count means quantities silently reverting.
 *
 * `counted` IS SENT PER LINE, not inferred from the quantity changing. A counter
 * who walks up to a shelf, finds exactly what the system predicted and moves on
 * HAS counted that line, and inferring would leave them no way to say so — the
 * progress figure would then undercount precisely the shelves that were fine.
 */
export function useOpnameSheet(opnameId: string): UseOpnameSheetResult {
  const [opname, setOpname] = useState<Opname | null>(null);
  const [items, setItems] = useState<OpnameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [adding, setAdding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * Bumped on every local edit. A save captures it before the request and
   * discards its own response if the number has moved — see the header.
   */
  const revisionRef = useRef(0);
  /** The pending debounce, so a new keystroke replaces it rather than queueing. */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The latest lines, readable from a timer callback without re-arming it. */
  const itemsRef = useRef<OpnameItem[]>([]);
  /** Whether anything is waiting to be saved — drives `flush`. */
  const dirtyRef = useRef(false);
  /** Guards setStates after unmount. */
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    stockOpnameService
      .getById(opnameId)
      .then((result) => {
        if (!active) return;
        setOpname(result);
        const lines = forEditing(result.items);
        setItems(lines);
        itemsRef.current = lines;
      })
      .catch((err) => {
        if (!active) return;
        setOpname(null);
        setItems([]);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Lembar opname gagal dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [opnameId, reloadKey]);

  /**
   * The payload: one entry per line, carrying only what a client may set.
   *
   * `counted` is derived from `countedAt` being present rather than tracked
   * separately, so the flag the server stamps and the flag the client sends
   * cannot disagree about which lines are done.
   */
  const buildPayload = useCallback(
    (source: OpnameItem[]): OpnameItemInput[] =>
      source.map((item) => ({
        productId: item.productId,
        physicalQty: item.physicalQty,
        counted: item.countedAt !== null,
        notes: item.notes,
        ...(item.batchCode ? { batchCode: item.batchCode } : {}),
        ...(item.expiryDate ? { expiryDate: item.expiryDate } : {}),
      })),
    [],
  );

  const save = useCallback(async () => {
    const revision = revisionRef.current;
    const payload = buildPayload(itemsRef.current);

    setSaveState("saving");

    try {
      const saved = await stockOpnameService.update(opnameId, {
        items: payload,
      });

      if (!activeRef.current) return;

      setOpname(saved);
      setError(null);

      /**
       * The server's recomputed lines replace what is on screen — UNLESS the
       * counter typed again while this was in flight. Landing a stale response
       * on top of newer edits would silently revert quantities, which on a stock
       * count is the one failure nobody would notice until the submit.
       */
      if (revisionRef.current === revision) {
        const lines = forEditing(saved.items);
        setItems(lines);
        itemsRef.current = lines;
        dirtyRef.current = false;
        setSaveState("saved");
        setLastSavedAt(new Date());
      } else {
        // Newer edits are pending; the next save will carry them.
        setSaveState("idle");
      }
    } catch (err) {
      if (!activeRef.current) return;
      setSaveState("error");
      // `fullMessage` carries the actionable half of a 409 — "It was submitted
      // while you were editing" — which `message` alone drops.
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Perubahan gagal disimpan. Periksa koneksi lalu coba lagi.",
      );
    }
  }, [buildPayload, opnameId]);

  /** Replaces the pending save rather than queueing another one. */
  const schedule = useCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [save]);

  const applyEdit = useCallback(
    (productId: string, patch: Partial<OpnameItem>) => {
      revisionRef.current += 1;
      setItems((current) => {
        const next = current.map((item) =>
          item.productId === productId ? { ...item, ...patch } : item,
        );
        itemsRef.current = next;
        return next;
      });
      schedule();
    },
    [schedule],
  );

  const editLine = useCallback(
    (productId: string, patch: LineEdit) => {
      /**
       * TYPING A QUANTITY COUNTS THE LINE. Somebody who writes a number has been
       * to that shelf, and making them tick a second control to say so would
       * mean a sheet that reports as half-done after being fully walked.
       * Confirming a line that already matched is the case the explicit
       * `setCounted` below exists for.
       */
      const counts =
        patch.physicalQty !== undefined && patch.physicalQty.trim() !== "";

      applyEdit(productId, {
        ...patch,
        ...(counts ? { countedAt: new Date().toISOString() } : {}),
      });
    },
    [applyEdit],
  );

  const setCounted = useCallback(
    (productId: string, counted: boolean) => {
      applyEdit(productId, {
        countedAt: counted ? new Date().toISOString() : null,
      });
    },
    [applyEdit],
  );

  /**
   * Takes a product off the sheet.
   *
   * A SAVE THAT OMITS THE LINE — no endpoint of its own, because `items`
   * replaces the array, so a sheet shrinks the same way it grows. Adding needed
   * one (`POST /:id/items`) only because a new line has to start at a system
   * quantity the browser must not compute; removing carries no such number.
   *
   * SAVED IMMEDIATELY rather than debounced. The 800ms delay is right for
   * keystrokes, where the next one supersedes the last; a removed row disappears
   * from the screen at once, and leaving it unsent would mean a sheet that looks
   * different from the one stored for as long as the counter does nothing else —
   * closing the tab in that window would bring the line back.
   */
  const removeLine = useCallback(
    async (productId: string) => {
      revisionRef.current += 1;

      const next = itemsRef.current.filter(
        (item) => item.productId !== productId,
      );
      itemsRef.current = next;
      setItems(next);
      dirtyRef.current = true;

      // The pending keystroke save would carry the same array anyway; cancelling
      // it stops a second identical request landing right behind this one.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      await save();
    },
    [save],
  );

  /**
   * Saves anything pending, NOW.
   *
   * Called before a submit: the debounce means the last thing a counter typed
   * may still be sitting in a timer, and submitting without it would post a
   * count that is one line out of date — against quantities the server re-reads
   * anyway, so the discrepancy would be invisible afterwards.
   */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (dirtyRef.current) {
      await save();
    }
  }, [save]);

  /**
   * The shared half of both ways to put products on the sheet.
   *
   * FLUSHES FIRST, and skipping that would lose work: the auto-save sends the
   * WHOLE items array, so a pending save built from the old line list would land
   * after the append and replace the sheet with a version that never had the new
   * products on it. Flushing settles the outstanding edit before the server is
   * asked to extend the list it just accepted.
   *
   * The response IS the new sheet, so it replaces the lines outright rather than
   * being merged in — the same contract as a save, and `revisionRef` moves with
   * it so a save already in flight cannot land on top.
   */
  const runAdd = useCallback(
    async (request: () => Promise<Opname>) => {
      setAdding(true);

      try {
        await flush();

        const updated = await request();

        if (!activeRef.current) return null;

        revisionRef.current += 1;
        setOpname(updated);
        const lines = forEditing(updated.items);
        setItems(lines);
        itemsRef.current = lines;
        dirtyRef.current = false;
        setError(null);

        return null;
      } catch (err) {
        // Returned rather than pushed into `error`: the dialog that asked for
        // these products is where the refusal is actionable — "already on this
        // sheet" names products the user can untick and try again.
        return err instanceof ApiError
          ? err.fullMessage
          : "Produk gagal ditambahkan. Coba lagi.";
      } finally {
        if (activeRef.current) setAdding(false);
      }
    },
    [flush],
  );

  const addProducts = useCallback(
    (productIds: string[]) =>
      productIds.length === 0
        ? Promise.resolve(null)
        : runAdd(() => stockOpnameService.addItems(opnameId, productIds)),
    [opnameId, runAdd],
  );

  const addEveryProduct = useCallback(
    () => runAdd(() => stockOpnameService.addEveryProduct(opnameId)),
    [opnameId, runAdd],
  );

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return {
    opname,
    items,
    loading,
    error,
    saveState,
    lastSavedAt,
    countedCount: items.filter((item) => item.countedAt !== null).length,
    editLine,
    setCounted,
    removeLine,
    flush,
    addProducts,
    addEveryProduct,
    adding,
    reload,
  };
}
