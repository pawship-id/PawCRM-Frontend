"use client";

import { useEffect, useState } from "react";

import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { Branch } from "@/types/api";

/** One page is enough: a tenant has a handful of branches, not thousands. */
const OPTION_LIMIT = 100;

interface UseSupplierBranchOptionsResult {
  branches: Branch[];
  loading: boolean;
  error: string | null;
}

/**
 * Every branch of the tenant, for the supplier form's "Dipakai di cabang" field.
 *
 * ⚠️ THIS DELIBERATELY DOES NOT REUSE `useBranchOptions`, and the difference is
 * a data-loss bug rather than a style preference.
 *
 * That hook narrows its list to the branches the ACTING USER can reach, which is
 * right for the things it serves: a picker that filters what the user is looking
 * at, and a label for a row the server already scoped. Both are about the
 * reader.
 *
 * This field is not about the reader. It edits MASTER DATA — which branches may
 * buy from this vendor — and the form saves the list as a whole. So if the
 * picker hid a branch the editor cannot reach, that branch would be missing from
 * the ticked set, and the very next save would silently REMOVE the supplier from
 * it. A manager scoped to Surabaya, editing a phone number, would quietly cut
 * the vendor off from Jakarta, and nothing on screen would have mentioned
 * Jakarta at all.
 *
 * The server is the authority on who may edit a supplier; it is not asked to
 * narrow which branches a supplier may be offered in, because that is a property
 * of the vendor rather than of the person typing.
 *
 * IT FAILS SOFTLY. `branches:read` is a separate grant from `suppliers:update`,
 * so a role can hold the second without the first. The form reports the failure
 * beside the field and leaves "Semua cabang" as the answer — which is the
 * schema's own default and the only safe one when the list cannot be seen.
 */
export function useSupplierBranchOptions(): UseSupplierBranchOptionsResult {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    branchService
      .list({ limit: OPTION_LIMIT })
      .then((result) => {
        if (!active) return;
        setBranches(result.items);
      })
      .catch((err) => {
        if (!active) return;
        setBranches([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Daftar cabang gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { branches, loading, error };
}
