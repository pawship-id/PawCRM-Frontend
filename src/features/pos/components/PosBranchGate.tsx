"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/filters";
import { useAuth } from "@/features/auth";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";

/** The API's page cap — asking for more is a 400. */
const FETCH_LIMIT = 100;

/**
 * Choosing which shop you are standing in.
 *
 * THE FIRST GATE, BEFORE THE SHIFT. A user who reaches every branch signs in
 * pointed at none of them — `auth.service.js#createSession` defaults the session
 * only when there is exactly one branch and therefore no choice to make. Until
 * one is chosen the till cannot answer a single question it exists to answer:
 * `posShifts.branchId` is the sole authority for which branch a sale is booked
 * to, so guessing one would put a sale in the wrong shop's books silently.
 *
 * IT SWITCHES THE SESSION, NOT THE SCREEN. That is deliberate and it is why the
 * call lives in the auth context: the branch decides where a shift, a sale and
 * its journal entry are booked, and a branch that meant something different on
 * each screen is a bookkeeping error nobody could see. The choice therefore
 * outlives this page.
 *
 * IT IS ALSO THE SCREEN AFTER TUTUP KASIR, which is why the caller may pass
 * `onChosen`: the session still names a branch once a shift is closed, so
 * nothing about the session would bring this gate back on its own. The screen
 * that closed the shift holds that flag, and this clears it.
 */
export function PosBranchGate({ onChosen }: { onChosen?: () => void } = {}) {
  const { switchBranch } = useAuth();

  const [branches, setBranches] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    branchService
      .list({ isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setBranches(
          result.items.map((branch) => ({
            value: branch._id,
            label: branch.name,
          })),
        );
      })
      .catch(() => {
        if (active) setError("Daftar cabang gagal dimuat. Coba muat ulang.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!branchId) return;

    setSubmitting(true);
    setError(null);

    try {
      await switchBranch(branchId);
      onChosen?.();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? "Cabang gagal dipilih. Coba lagi.")
          : "Cabang gagal dipilih. Coba lagi.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-6">
      <h1 className="text-2xl font-extrabold text-foreground">Pilih cabang</h1>
      <p className="mt-1 text-[15px] text-muted">
        Kasir mencatat penjualan per cabang, yuk pilih cabangmu!
      </p>

      {error && (
        <div className="mt-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <FilterSelect
          layout="form"
          label="Cabang"
          value={branchId}
          options={branches}
          onChange={setBranchId}
          /* Otherwise an answered field goes navy and announces a filter. */
          active={false}
          placeholder={loading ? "Memuat…" : "Pilih cabang"}
          disabled={loading}
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting || !branchId}
        >
          {submitting && <Spinner />}
          Lanjut
        </Button>
      </form>
    </div>
  );
}
