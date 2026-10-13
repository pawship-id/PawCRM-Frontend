"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { usePathname } from "next/navigation";

import { FinanceScopeCard, PageTabs } from "@/components";
import { Button as SlotButton } from "@/components/ui/button";
import {
  currentMonthRange,
  isoDate,
  reportPresets,
} from "@/features/accounting/financeSummary";
import { useAuth } from "@/features/auth";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { usePermissions } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";
import type { Branch } from "@/types/api";

import { BERANDA_HREF, berandaTabs } from "./tabs";

/**
 * Beranda — the screen somebody opens first every morning, after the
 * `buloo-navigation-v3` mockup: one heading, one Cabang + Periode row, and four
 * tabs (Hari Ini · Uang · Operasional · Cabang).
 *
 * THE TABS ARE ROUTES and this shell is their LAYOUT, so the scope — which
 * cabang, which period — survives moving between them. A tab held in state
 * would put four screens' reads behind one component and lose the URL.
 *
 * HARI INI HAS NO PERIODE. Its figures are today's by definition, so the chips
 * are not drawn there rather than drawn and ignored; Cabang still applies.
 *
 * IT OPENS ON THIS MONTH, the mockup's "Bulan Ini", and Reset returns there.
 *
 * `now` COMES FROM THE SERVER — the default month, the presets and "today" are
 * all dates, and a client reading the clock while rendering would disagree with
 * the HTML it was sent (the same reason Keuangan's Ringkasan takes one).
 *
 * The mockup's Ekspor button is not drawn: nothing exports this page yet, and
 * a button that only says so is a button nobody trusts twice.
 */

export interface BerandaScope {
  /** The server's clock, as the page rendered it. */
  now: Date;
  /** `yyyy-mm-dd`, local. */
  today: string;
  /** Empty = every cabang this user holds. */
  branchIds: string[];
  /** The cabang this user holds — what "every" means. */
  branches: Branch[];
  /** `yyyy-mm-dd`; both empty = every date. */
  dateFrom: string;
  dateTo: string;
}

const BerandaContext = createContext<BerandaScope | null>(null);

export function useBerandaScope(): BerandaScope {
  const scope = useContext(BerandaContext);
  if (!scope) throw new Error("useBerandaScope dipakai di luar BerandaShell");
  return scope;
}

export function BerandaShell({
  now: nowIso,
  children,
}: {
  now: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { can } = usePermissions();
  const scope = useBranchScope();

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const today = isoDate(now);
  const presets = useMemo(() => reportPresets(now), [now]);
  const month = useMemo(() => currentMonthRange(now), [now]);

  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [range, setRange] = useState({ from: month.dateFrom, to: month.dateTo });

  const readsLedger = can("journalEntries", "read");
  const manyBranches = scope.branches.length > 1;
  const tabs = berandaTabs({
    ledger: readsLedger,
    bookings: can("bookings", "read"),
    manyBranches,
  });

  /* "Reset filter (n)" — one per field narrowed away from the opening state:
     every cabang, this month. */
  const monthMoved =
    range.from !== month.dateFrom || range.to !== month.dateTo;
  const onHariIni = pathname === BERANDA_HREF;
  const narrowed =
    (branchIds.length > 0 ? 1 : 0) + (!onHariIni && monthMoved ? 1 : 0);

  const value = useMemo<BerandaScope>(
    () => ({
      now,
      today,
      branchIds,
      branches: scope.branches,
      dateFrom: range.from,
      dateTo: range.to,
    }),
    [now, today, branchIds, scope.branches, range],
  );

  const firstName = user?.fullName.split(" ")[0];
  const subtitle =
    readsLedger && manyBranches
      ? "Ringkasan cabang yang kamu pegang."
      : "Yang perlu kamu kerjakan hari ini.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeading crumbs={[{ label: "Beranda" }]} title="Beranda">
        {firstName ? `Halo, ${firstName}. ` : ""}
        {subtitle}
      </PageHeading>

      <FinanceScopeCard
        branches={scope.branches}
        branchIds={branchIds}
        onBranchIdsChange={setBranchIds}
        presets={onHariIni ? undefined : presets}
        dateFrom={onHariIni ? undefined : range.from}
        dateTo={onHariIni ? undefined : range.to}
        onDateRangeChange={onHariIni ? undefined : setRange}
        trailing={
          narrowed > 0 ? (
            <SlotButton
              type="button"
              variant="link"
              className="min-h-11 px-0"
              onClick={() => {
                setBranchIds([]);
                setRange({ from: month.dateFrom, to: month.dateTo });
              }}
            >
              Reset filter ({narrowed})
            </SlotButton>
          ) : undefined
        }
      />

      {tabs.length > 1 && <PageTabs tabs={tabs} ariaLabel="Bagian beranda" />}

      <BerandaContext.Provider value={value}>{children}</BerandaContext.Provider>
    </div>
  );
}
