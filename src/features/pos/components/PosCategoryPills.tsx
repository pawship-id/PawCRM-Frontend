"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { categoryService } from "@/services/category.service";
import type { Category } from "@/types/api";
import type { PosCatalogState } from "../hooks/usePosCatalog";

/** The API's page cap. */
const FETCH_LIMIT = 100;

/**
 * How many categories the row shows before "Lainnya" (28 September 2026, on
 * request).
 *
 * THE ROW WAS THREE LINES DEEP on a real tenant — seventeen categories above a
 * grid of eight tiles, so the thing being chosen from had less of the screen
 * than the chooser. Five plus Semua and Layanan fits one line on a till.
 */
const VISIBLE_LIMIT = 5;

/**
 * The category row above the grid (FR-1).
 *
 * A PILL ROW, not a select, and ui-rules §8 says which: one dimension that is
 * the page's main lens, small cardinality, always auto-apply. A cashier taps
 * once and the grid answers — no Terapkan, no popover.
 *
 * "LAYANAN" IS A PILL AMONG THE CATEGORIES even though it is not a category. It
 * is how the PRD lists it, and it is what a cashier means: the pills answer
 * "what am I looking at", and services are one of the answers. Selecting it
 * narrows the union to the services side rather than filtering by a category id.
 */
export function PosCategoryPills({
  state,
  onChange,
}: {
  state: PosCatalogState;
  onChange: (patch: Partial<PosCatalogState>) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;

    categoryService
      // `withProductCount` is what the ranking below is ordered by.
      .list({ isActive: true, limit: FETCH_LIMIT, withProductCount: true })
      .then((result) => {
        if (active) setCategories(result.items);
      })
      // A pill row that cannot load its categories falls back to Semua and
      // Layanan, which still works. A red banner over a working grid would not.
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const isAll = state.categoryId === "" && state.kind === "";
  const isServices = state.kind === "service";
  const isMemberships = state.kind === "membership";

  /**
   * Busiest first, and ties broken by name so the row is STABLE.
   *
   * Without the tie-break, every category with the same count sits in whatever
   * order the page came back in — and a pill row that reshuffles between loads
   * is one a cashier has to read every time instead of reaching for by muscle
   * memory, which is the whole value of a row of five.
   */
  const ranked = useMemo(
    () =>
      [...categories].sort(
        (a, b) =>
          (b.productCount ?? 0) - (a.productCount ?? 0) ||
          a.name.localeCompare(b.name, "id"),
      ),
    [categories],
  );

  /*
    THE CHOSEN CATEGORY IS ALWAYS DRAWN, even when it ranks below the cut. A row
    that hides the filter currently applied leaves the grid narrowed with
    nothing on screen saying by what — the reader sees a short catalogue and no
    reason for it.
  */
  const shown = useMemo(() => {
    const head = ranked.slice(0, VISIBLE_LIMIT);
    if (expanded) return ranked;

    const chosen = ranked.find(
      (category) => category._id === state.categoryId,
    );

    return chosen && !head.includes(chosen) ? [...head, chosen] : head;
  }, [ranked, expanded, state.categoryId]);

  const hidden = ranked.length - shown.length;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant={isAll ? "default" : "secondary"}
        aria-pressed={isAll}
        onClick={() => onChange({ categoryId: "", kind: "" })}
      >
        Semua
      </Button>

      {shown.map((category) => {
        const active = state.categoryId === category._id && state.kind === "";

        return (
          <Button
            key={category._id}
            type="button"
            size="sm"
            variant={active ? "default" : "secondary"}
            aria-pressed={active}
            onClick={() => onChange({ categoryId: category._id, kind: "" })}
          >
            {category.name}
          </Button>
        );
      })}

      <Button
        type="button"
        size="sm"
        variant={isServices ? "default" : "secondary"}
        aria-pressed={isServices}
        onClick={() => onChange({ categoryId: "", kind: "service" })}
      >
        Layanan
      </Button>

      {/*
        MEMBERSHIP IS ITS OWN LENS, beside Layanan rather than inside it
        (29 September 2026). A package is not a service: it is not performed, it
        has no groomer and no duration on the day, and it is sold a handful of
        times a week rather than every sale. Folding it into Layanan would bury
        it under every grooming the shop offers, on the one pill a cashier
        presses most.

        NOT A CATEGORY EITHER — a package has no `categoryId`, which is exactly
        why it needs a lens of its own to be reachable at all.
      */}
      <Button
        type="button"
        size="sm"
        variant={isMemberships ? "default" : "secondary"}
        aria-pressed={isMemberships}
        onClick={() => onChange({ categoryId: "", kind: "membership" })}
      >
        Membership
      </Button>

      {/*
        IT SAYS HOW MANY ARE HIDDEN, rather than a bare chevron. "Lainnya" alone
        asks the cashier to press it to find out whether it was worth pressing;
        the count is the answer to the question the button raises.

        A GHOST BUTTON, not another pill: it does not narrow the grid, so
        drawing it like the things that do would make an eighth lens out of a
        control that selects nothing.
      */}
      {(hidden > 0 || expanded) && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" />
              Ringkas
            </>
          ) : (
            <>
              <ChevronDown className="size-4" />
              {`${hidden} lainnya`}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
