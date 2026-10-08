"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components";
import { groomerService } from "@/services/groomer.service";
import type { MyCommission } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

/** This month as `YYYY-MM`, in the phone's clock — which is the shop's. */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * "Komisi bulan ini" — the groomer's own month, one card.
 *
 * ONLY MOUNTED WHEN THE SHOP ALLOWS IT (`settings.showOwnCommission`), and the
 * server refuses the read otherwise, so a client that rendered it anyway would
 * show an error rather than a number. There is no per-job amount anywhere in the
 * app (decision of 8 Oktober 2026); this is the month, and nothing finer.
 *
 * FAILS QUIETLY. The list underneath is what the groomer opened the tab for; a
 * commission read that errors says so in a line and does not take the page down.
 */
export function CommissionSummary() {
  const [data, setData] = useState<MyCommission | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let active = true;

    groomerService
      .commission(thisMonth())
      .then((result) => {
        if (!active) return;
        setData(result);
        setState("ok");
      })
      .catch(() => {
        if (active) setState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section aria-label="Komisi bulan ini" className="mb-4 rounded-xl bg-primary p-4 text-primary-foreground">
      <p className="text-xs font-semibold text-primary-foreground/80">Komisi bulan ini</p>

      {state === "loading" && (
        <div className="py-2">
          <Spinner size={20} />
        </div>
      )}
      {state === "error" && (
        <p className="mt-1 text-sm">Komisi tidak bisa dimuat sekarang.</p>
      )}
      {state === "ok" && (
        <>
          <p className="text-2xl font-extrabold tabular-nums">
            {data?.earned ? formatMoney(data.earned.amount) : formatMoney("0")}
          </p>
          <p className="text-xs text-primary-foreground/80">
            {data?.earned ? `dari ${data.earned.rows} layanan` : "Belum ada komisi bulan ini."}
            {data && data.outstanding.recordCount > 0 && (
              <> · belum dibayar {formatMoney(data.outstanding.amount)}</>
            )}
          </p>
        </>
      )}
    </section>
  );
}
