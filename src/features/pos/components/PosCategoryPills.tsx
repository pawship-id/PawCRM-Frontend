"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { categoryService } from "@/services/category.service";
import type { PosCatalogState } from "../hooks/usePosCatalog";

/** The API's page cap. */
const FETCH_LIMIT = 100;

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
  const [categories, setCategories] = useState<{ _id: string; name: string }[]>(
    [],
  );

  useEffect(() => {
    let active = true;

    categoryService
      .list({ isActive: true, limit: FETCH_LIMIT })
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

      {categories.map((category) => {
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
    </div>
  );
}
