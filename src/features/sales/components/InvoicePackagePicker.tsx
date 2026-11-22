"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatPlanDuration } from "@/features/memberships/labels";
import { membershipService } from "@/services/membership.service";
import { formatMoney } from "@/utils/decimal";
import type { MembershipPlan } from "@/types/membership";

/** The API's page cap. */
const FETCH_LIMIT = 100;

/**
 * WHICH PACKAGE TO SELL ON THIS FAKTUR (19 November 2026) — the faktur's
 * stand-in for the till's package tiles. Picking one hands it to the same sell
 * dialog the till uses (`PosMembershipSaleDialog`), which asks whose it is and
 * from when, so a package is sold the same way on both.
 *
 * Only ACTIVE packages offered at this branch are listed (an empty
 * `branchIds` is every branch). The price is the plan's; a per-variant plan
 * shows its lowest as "mulai", and the sell dialog shows the holder's own.
 */
export function InvoicePackagePicker({
  open,
  branchId,
  onPick,
  onOpenChange,
}: {
  open: boolean;
  branchId: string;
  onPick: (plan: MembershipPlan) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;

    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    membershipService
      .listPlans({ isActive: true, limit: FETCH_LIMIT, sort: "nameAsc" })
      .then((result) => {
        if (live) setPlans(result?.items ?? []);
      })
      .catch(() => {
        if (live) setError("Daftar paket membership tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [open]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return plans.filter(
      (plan) =>
        plan.isActive !== false &&
        ((plan.branchIds ?? []).length === 0 ||
          !branchId ||
          plan.branchIds.includes(branchId)) &&
        (!term ||
          plan.name.toLowerCase().includes(term) ||
          (plan.code ?? "").toLowerCase().includes(term)),
    );
  }, [plans, search, branchId]);

  function handleOpenChange(next: boolean) {
    if (!next) setSearch("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tambah paket membership</DialogTitle>
          <DialogDescription>
            Kartunya langsung dibuat bersama faktur. Benefitnya bisa dipakai
            setelah faktur lunas.
          </DialogDescription>
        </DialogHeader>

        <Input
          aria-label="Cari paket"
          placeholder="Cari nama atau kode paket"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {error ? (
          <Alert variant="error">{error}</Alert>
        ) : loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {plans.length === 0
              ? "Belum ada paket membership yang aktif."
              : "Tidak ada paket yang cocok untuk cabang atau pencarian ini."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((plan) => (
              <li key={plan.id}>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-auto w-full justify-between gap-3 px-3 py-2.5 text-left"
                  onClick={() => {
                    setSearch("");
                    onPick(plan);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{plan.name}</span>
                    <span className="block truncate text-xs font-normal text-muted">
                      {[plan.code, formatPlanDuration(plan)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {plan.priceMode === "variant" ? "mulai " : ""}
                    {formatMoney(plan.price)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
