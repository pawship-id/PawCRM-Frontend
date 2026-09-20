"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, Repeat, RotateCcw } from "lucide-react";

import { Alert, Card, FilterToggle, PageTabs, StatTile } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CashTransactionsPanel,
  useCashTransactions,
  type CashTransactionsQuery,
} from "@/features/cash-transactions";
import { Can, usePermissions } from "@/features/permissions";
import { formatMoney, subtractDecimals } from "@/utils/decimal";

import { reportPresets, type FinanceQuery } from "../financeSummary";
import { useCashBankAccounts } from "../hooks/useCashBankAccounts";
import { AccountingModuleHeader } from "./AccountingModuleHeader";
import { CashBankAccountsTable } from "./CashBankAccountsTable";
import { FinanceReportToolbar } from "./FinanceReportToolbar";

/** The two halves of Kas & Bank, as the mockup names them. */
export type KasBankSection = "transaksi" | "biaya-tetap";

const KAS_BANK_HREF = "/dashboard/keuangan/kas-bank";

/** Where the channel list moved to on 20 September 2026 — see the header. */
const CHANNELS_HREF = "/dashboard/pengaturan/channel-pembayaran";

/**
 * KAS & BANK — where the shop's money sits, and everything that moved it.
 *
 * ONE PAGE, TWO SUB-TABS, adopted from the mockup on 16 September 2026.
 * Transaksi used to be a tab of the module in its own right; it is the first
 * sub-tab here, because a list of movements is only readable next to the
 * accounts they moved through. Biaya Tetap is the second.
 *
 * WHAT IS ABOVE THE SUB-TABS IS TRUE OF BOTH: the three cards and the account
 * table are the page's subject, and the sub-tab chooses what to say about it.
 * That is also why the context bar sits above them rather than inside either.
 *
 * ACCOUNTS, NOT CHANNELS (20 September 2026). The table used to list payment
 * channels and now lists the ledger accounts filed under Kas & Bank. A channel
 * is a BUTTON A CASHIER PRESSES — "QRIS Xendit", "BCA 8730…" — and several of
 * them land in one account, so a table of channels could not print a saldo
 * column that added up. The channels moved to Pengaturan › Channel Pembayaran,
 * beside the other things configured once and then referred to; this page kept
 * the question it was named for, which is where the money is.
 *
 * ONE CONTEXT BAR, ONE QUERY. Cabang and Periode are the page's, and they edit
 * the SAME `useCashTransactions` state the list below reads — so the cards, the
 * table and the rows can never be about different months. The list keeps its own
 * search, its jenis/channel/status panel and its arah pill row; those narrow the
 * rows without changing what the cards above are counting, which is exactly the
 * line §8 draws between a context bar and a filter bar.
 *
 * NO LINI BISNIS. A rupiah in the till belongs to the shop, not to grooming or
 * retail — the line is a property of what was sold, and cash has none. The
 * toolbar leaves the control out rather than disabling it, for the reason it
 * states: a control that cannot narrow anything is worse than one that is not
 * there, because somebody eventually reaches for it.
 */
export function KasBankScreen({
  now,
  section = "transaksi",
  initialQuery,
}: {
  /** The server's clock — the period presets are dates. */
  now: string;
  section?: KasBankSection;
  /** From the URL — see `cashTransactionsQueryFromParams`. */
  initialQuery?: Partial<CashTransactionsQuery>;
}) {
  const { can } = usePermissions();
  const today = useMemo(() => new Date(now), [now]);
  const presets = useMemo(() => reportPresets(today), [today]);

  const readsTransactions = can("cashTransactions", "read");

  /*
    LOCAL, NOT PART OF THE QUERY. "Tampilkan nonaktif" is about which ACCOUNTS
    the table lists; it says nothing about which transactions the rows below are.
    Putting it on the shared query would re-request the transaction list every
    time somebody went looking for a retired account.
  */
  const [includeInactive, setIncludeInactive] = useState(false);
  const state = useCashTransactions(initialQuery);
  const { query, setQuery, totals, branches } = state;

  const accounts = useCashBankAccounts(
    {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      branchId: query.branchId,
      includeInactive,
    },
    { enabled: can("chartOfAccounts", "read") },
  );

  /*
    THE CONTEXT BAR'S SHAPE, over the transaction query. `FinanceReportToolbar`
    speaks `FinanceQuery`; this page's state is a `CashTransactionsQuery` that
    happens to carry the same three fields. Translating here rather than making
    the toolbar generic keeps one bar across Keuangan — the same control, in the
    same place, on four screens.
  */
  const contextQuery: FinanceQuery = {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    branchId: query.branchId,
    businessLineId: "",
  };

  // Masuk − keluar, in minor units: two server-side aggregates subtracted, never
  // a sum over the rows on the page.
  const net = totals ? subtractDecimals(totals.in.amount, totals.out.amount) : null;

  const tabs = [
    { label: "Transaksi", href: KAS_BANK_HREF, exact: true },
    { label: "Biaya Tetap", href: `${KAS_BANK_HREF}/biaya-tetap` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AccountingModuleHeader
        action={
          /*
            A POINTER, NOT A FORM. Channels are configured in Pengaturan now, and
            this link is here because the person who came looking for "Channel
            baru" on this page for the last four days has to be told where it
            went — once, in the place they looked.
          */
          <Can feature="paymentChannels" action="read">
            <Button variant="secondary" asChild>
              <Link href={CHANNELS_HREF}>
                <CreditCard className="size-4" />
                Channel pembayaran
              </Link>
            </Button>
          </Can>
        }
      />

      <FinanceReportToolbar
        query={contextQuery}
        branches={branches}
        presets={presets}
        disabled={state.loading}
        onChange={(patch: Partial<FinanceQuery>) =>
          setQuery({
            ...(patch.dateFrom !== undefined && { dateFrom: patch.dateFrom }),
            ...(patch.dateTo !== undefined && { dateTo: patch.dateTo }),
            ...(patch.branchId !== undefined && { branchId: patch.branchId }),
          })
        }
      />

      {readsTransactions && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Uang masuk"
            value={totals ? formatMoney(totals.in.amount) : "—"}
            caption={
              totals
                ? `${totals.in.count} transaksi · tanpa yang dibatalkan`
                : undefined
            }
            loading={!totals && !state.error}
            error={Boolean(state.error)}
          />
          <StatTile
            label="Uang keluar"
            value={totals ? formatMoney(totals.out.amount) : "—"}
            caption={
              totals
                ? `${totals.out.count} transaksi · tanpa yang dibatalkan`
                : undefined
            }
            loading={!totals && !state.error}
            error={Boolean(state.error)}
          />
          <StatTile
            label="Net"
            value={net !== null ? formatMoney(net) : "—"}
            caption="Uang masuk dikurangi uang keluar"
            loading={!totals && !state.error}
            error={Boolean(state.error)}
          />
        </div>
      )}

      <Can feature="chartOfAccounts" action="read">
        <Card
          title="Akun Kas &amp; Bank"
          action={
            <FilterToggle
              label="Tampilkan nonaktif"
              checked={includeInactive}
              onChange={setIncludeInactive}
            />
          }
        >
          {accounts.error && (
            <Alert variant="error" className="mb-3">
              <span className="flex flex-wrap items-center gap-3">
                {accounts.error}
                <Button variant="secondary" size="sm" onClick={accounts.refetch}>
                  <RotateCcw className="size-4" />
                  Coba lagi
                </Button>
              </span>
            </Alert>
          )}
          <CashBankAccountsTable
            rows={accounts.rows}
            loading={accounts.loading}
          />
        </Card>
      </Can>

      <PageTabs tabs={tabs} ariaLabel="Bagian kas & bank" />

      {section === "transaksi" ? (
        readsTransactions ? (
          <CashTransactionsPanel state={state} />
        ) : (
          <Card>
            <p className="text-sm text-muted">
              Kamu belum punya akses ke daftar transaksi. Minta admin menambahkan
              izin baca transaksi keuangan.
            </p>
          </Card>
        )
      ) : (
        <RecurringSection />
      )}
    </div>
  );
}

/**
 * Biaya Tetap — the sub-tab the mockup draws with figures in it, and this one
 * does not.
 *
 * BADGED, NOT BLANK, AND CERTAINLY NOT FILLED IN. The model carries a
 * `recurring` subdocument and nothing executes it: there is no scheduler and no
 * endpoint that lists them, so every number the mockup shows here — the count,
 * the monthly total, the next due date — would be invented. An invented figure
 * on a finance screen is indistinguishable from a real one.
 *
 * A TAB RATHER THAN A HIDDEN ROW, for the reason `PageTabs` gives: the row is
 * this page's table of contents, and drawing a two-part page as a one-part one
 * sends people looking for the other half in Pengaturan.
 */
function RecurringSection() {
  return (
    <Card>
      <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
        <Repeat className="size-4 text-muted" aria-hidden />
        Biaya tetap
        <Badge variant="outline">Segera</Badge>
      </p>
      <p className="mt-1.5 max-w-2xl text-sm text-muted">
        Gaji, sewa, dan langganan yang berulang tiap bulan akan tercatat sendiri
        dan muncul di sini beserta jatuh temponya — masuk maupun keluar. Sampai
        penjadwalnya ada, catat biayanya lewat Tambah transaksi seperti biasa dan
        transaksinya tetap masuk ke daftar di tab sebelah.
      </p>
    </Card>
  );
}
