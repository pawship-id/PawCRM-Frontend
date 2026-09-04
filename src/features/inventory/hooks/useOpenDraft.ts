"use client";

import { useEffect, useState } from "react";

import { stockOpnameService } from "@/services/stockOpname.service";
import type { Opname } from "@/types/inventory";

interface OpenDraft {
  /** The draft blocking this warehouse, or null when it is free to count. */
  draft: Opname | null;
  checking: boolean;
}

/**
 * Whether a warehouse already has a count open.
 *
 * ASKED BEFORE THE CLICK, NOT AFTER. The API refuses a second draft per
 * warehouse with a 409 that names the blocking sheet, so this changes no rule —
 * it moves the answer to where it is useful. A counter who is about to open a
 * count wants to be sent to the sheet that already exists, not told about it
 * after pressing a button labelled "start".
 *
 * NOT A GUARANTEE, and the create path still handles the 409. Somebody else can
 * open a draft between this read and that write; what this removes is the common
 * case, not the race.
 *
 * A FAILURE HERE IS SILENT, deliberately: it reports "no draft" and lets the
 * create attempt speak. `stockOpnames:read` is a separate grant from `create`,
 * and a role holding only the latter must still be able to start a count —
 * blocking the button on a check it may not run would lock it out entirely.
 */
export function useOpenDraft(warehouseId: string): OpenDraft {
  const [draft, setDraft] = useState<Opname | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!warehouseId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(null);
      return;
    }

    let active = true;
    setChecking(true);

    stockOpnameService
      .list({ warehouseId, status: "draft", limit: 1 })
      .then((result) => {
        if (!active) return;
        setDraft(result.items[0] ?? null);
      })
      .catch(() => {
        if (!active) return;
        setDraft(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [warehouseId]);

  return { draft, checking };
}
