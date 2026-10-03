"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PawPrint, Plus, User } from "lucide-react";

import { Alert, FilterSelect, InfoTooltip, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { customerService } from "@/services/customer.service";
import type { Customer, CustomerStats, DormantCustomer } from "@/types/api";
import { formatMoney } from "@/utils/decimal";
import { whatsAppLink } from "@/utils/phone";

import { day, DORMANT_DAYS } from "../labels";
import { CustomerModuleHeader } from "./CustomerModuleHeader";

/** The windows "Pelanggan baru" offers, matching the mockup's own select. */
const NEW_DAYS = [7, 14, 30, 60].map((days) => ({
  value: days,
  label: `${days} hari`,
}));

/** How many rows each worklist draws before it stops. */
const ROWS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const NUMBER = new Intl.NumberFormat("id-ID");
const ONE_DECIMAL = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

/**
 * The Ringkasan tab — the module's front page, and the only screen in it that
 * names somebody to do something about today.
 *
 * ITS OWN CARD ROW, NOT THE REGISTER'S. Every other tab wears the four tiles
 * that say how big the shop is; this one replaces them with three that say what
 * the period DID — arrivals against last period, what each buying customer
 * spent, and how much of the register came back for a second visit. Both rows at
 * once would be seven numbers stacked over a worklist, and a reader would have
 * to work out which four the page below is not about. See `tiles` on
 * CustomerModuleHeader.
 *
 * THREE WORKLISTS UNDER THEM, in the mockup's order and its colours: amber for
 * the two that are somebody's job today, plain for the one that is only worth
 * knowing. Each row carries the one action worth taking on it.
 *
 * WHAT IS MEASURED WHERE. Dormancy and the spend figures come from settled till
 * sales, counted by the server (`/customers/stats`, `/customers/dormant`) — a
 * customer who has never bought anything is in the dormant list, counted from
 * the day they were registered, because an inner join would have dropped exactly
 * the most neglected contacts a shop has.
 *
 * WHAT IS BADGED RATHER THAN BUILT: the mockup's membership-expiry worklist.
 * There is no membership in the system.
 *
 * "PELANGGAN BARU DALAM" ONLY SHOWS WHO JOINED. The mockup's "Tandai sudah
 * dihubungi" was dropped on request (3 October 2026) rather than built, and the
 * "Segera" note about it removed — do not add it back as a tidy-up.
 */
export function CustomerSummaryScreen() {
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    customerService
      .stats()
      .then((result) => {
        if (!active) return;
        setStats(result);
        setStatsError(false);
      })
      .catch(() => {
        if (active) setStatsError(true);
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <CustomerModuleHeader
        /* The module's primary action, on this tab as on the others — the
           mockup keeps it on every one of them. */
        action={
          <Can feature="customers" action="create">
            <Button asChild>
              <Link href="/dashboard/master/customers/new">
                <Plus className="size-4" />
                Pelanggan baru
              </Link>
            </Button>
          </Can>
        }
        tiles={
          <section
            aria-label="Ringkasan periode"
            className="grid grid-cols-1 gap-4 lg:grid-cols-3"
          >
            <SummaryTile
              label="Pelanggan baru periode ini"
              value={NUMBER.format(stats?.newCustomers.count ?? 0)}
              caption={`${stats?.newCustomers.days ?? 30} hari terakhir`}
              hint="Pelanggan yang didaftarkan dalam jangka waktu di atas, dihitung dari tanggal daftar."
              delta={growth(stats)}
              loading={statsLoading}
              error={statsError}
            />
            <SummaryTile
              label="Rata-rata belanja / pelanggan"
              value={formatMoney(stats?.activeCustomers.averageSpend ?? null)}
              /*
                THE FORMULA MOVED OFF THE CARD AND INTO THE ⓘ (2 October
                2026, on request) — it used to sit under the value as a third
                line (`caption`). KEPT SHORT, on a second request the same
                day: the tooltip ran to two sentences once the old `hint`
                (the denominator rationale) was folded in underneath it, and
                that's more than an ⓘ popover should hold. The formula alone
                answers "what is this number", which is what the ⓘ is for.
              */
              hint="Omzet periode ÷ pelanggan yang transaksi periode ini."
              loading={statsLoading}
              error={statsError}
            />
            <SummaryTile
              label={`Repeat rate (${stats?.activeCustomers.days ?? 90} hari terakhir)`}
              value={share(stats?.activeCustomers.repeatShare)}
              hint={`Pelanggan dengan ≥ 2 transaksi dalam ${stats?.activeCustomers.days ?? 90} hari terakhir`}
              loading={statsLoading}
              error={statsError}
            />
          </section>
        }
      />

      <DormantPanel />
      <NewCustomersPanel />
      <MembershipPanel />

      {/*
        THE MOCKUP'S CLOSING NOTE, minus its line about cabang: a customer has no
        branch in this database, so a sentence promising the lists follow the
        branch picker would promise something no control here does.
      */}
      <div className="rounded-xl border border-border border-l-[3px] border-l-primary bg-surface px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          Dari sini, bukan tab Analitik sendiri
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          Metrik dan worklist di halaman ini khusus pelanggan. Untuk laba per
          lini, arus kas, dan laporan formal, lihat{" "}
          <Link
            href="/dashboard/keuangan"
            className="text-primary underline-offset-2 hover:underline"
          >
            Keuangan
          </Link>{" "}
          dan{" "}
          <Link
            href="/dashboard/reports"
            className="text-primary underline-offset-2 hover:underline"
          >
            Laporan
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tiles */

/**
 * One of the three cards above the worklists.
 *
 * NOT `StatTile`, and this is the one place in the module that does not reuse
 * it. These carry two things it has no room for — a signed comparison against
 * the period before, and an explanation of how the figure was arrived at — and
 * both are load-bearing here: an average with no stated denominator is a number
 * people quote wrongly, and "23 pelanggan baru" means nothing without last
 * month's 19 beside it. The shell is deliberately identical, so a reader moving
 * between tabs does not see two kinds of card.
 *
 * `caption` IS OPTIONAL (2 October 2026) — the denominator still has to be
 * stated somewhere, it just doesn't have to be a permanent third line; see
 * "Rata-rata belanja / pelanggan", which now says it once, in `hint`.
 */
function SummaryTile({
  label,
  value,
  caption,
  hint,
  delta,
  loading,
  error,
}: {
  label: string;
  value: string;
  caption?: string;
  /** The long "why this number is what it is", opened from the ⓘ. */
  hint?: string;
  delta?: { pct: number; label: string } | null;
  loading: boolean;
  error: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {label}
        {hint && <InfoTooltip hint={hint} />}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
        {loading || error ? "—" : value}
      </p>
      {/* `error` still has to say so even on a tile with no caption of its own
          (Rata-rata belanja's denominator moved into `hint`) — a card that
          goes silent on failure is worse than one with an empty line. */}
      {(caption || error) && (
        <p className="mt-1 text-xs text-muted">
          {error ? "gagal dimuat" : caption}
        </p>
      )}
      {!loading && !error && delta && (
        <p
          className={`mt-2 text-xs font-bold tabular-nums ${
            delta.pct > 0
              ? "text-success"
              : delta.pct < 0
                ? "text-danger"
                : "text-muted"
          }`}
        >
          {delta.pct > 0 ? "↗" : delta.pct < 0 ? "↘" : "→"} {delta.label}
        </p>
      )}
    </div>
  );
}

/**
 * "18,4% vs periode sebelumnya", or nothing at all.
 *
 * NOTHING WHEN THE PREVIOUS PERIOD WAS EMPTY, which is the case a percentage
 * cannot describe: one customer after none is not "+100%", it is the first one.
 * A shop's opening month would otherwise wear a growth figure invented by a
 * division by zero.
 */
function growth(stats: CustomerStats | null) {
  if (!stats) return null;

  const { count, previousCount } = stats.newCustomers;
  if (previousCount === 0) return null;

  const pct = ((count - previousCount) / previousCount) * 100;

  return {
    pct,
    label: `${ONE_DECIMAL.format(Math.abs(pct))}% vs periode sebelumnya`,
  };
}

/** "42%", or a dash when the server declined to divide an empty register. */
function share(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

/* --------------------------------------------------------------- worklists */

/**
 * The mockup's `.na` panel: a heading with an icon, a count on the right, and
 * rows under it.
 *
 * `tone="warn"` IS THE AMBER ONE — a job somebody has today. It is a fill with
 * ordinary ink, never orange text (ui-rules §4), and the count says in a number
 * what the colour says in a glance, so nothing here depends on seeing the
 * colour at all.
 */
function Panel({
  icon,
  title,
  control,
  count,
  tone = "plain",
  seeAll,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  control?: React.ReactNode;
  count?: number;
  tone?: "plain" | "warn";
  /**
   * The footer link out to the full list (2 October 2026) — present as soon
   * as the worklist has ANY row, not only once it overflows the ten shown
   * (on request): a reader with one dormant customer should be able to reach
   * the same full-list screen as a reader with fifty.
   */
  seeAll?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        tone === "warn"
          ? "rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-3"
          : "rounded-xl border border-border bg-surface px-4 py-3"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-5 items-center justify-center text-muted">
          {icon}
        </span>
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {control}
        {count !== undefined && (
          <span className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-surface px-2 text-xs font-bold tabular-nums text-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="mt-2">{children}</div>
      {seeAll && (
        <div className="mt-2 border-t border-border/70 pt-2 text-right">
          <Link
            href={seeAll.href}
            className="text-xs font-medium text-primary hover:text-primary-hover"
          >
            {seeAll.label} →
          </Link>
        </div>
      )}
    </section>
  );
}

/** One row of a worklist: who it is, why they are on the list, what to do. */
function WorkRow({
  name,
  meta,
  action,
}: {
  name: React.ReactNode;
  meta: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-border/70 py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-foreground">{name}</div>
        <p className="text-xs text-muted">{meta}</p>
      </div>
      {action}
    </li>
  );
}

/**
 * The action at the end of a row.
 *
 * `text-warning` IS THE ONLY ORANGE THAT MAY BE TEXT (ui-rules §4) — the
 * mockup's link colour, and the token that actually passes contrast. It is a
 * link rather than a button because it opens WhatsApp.
 */
function RowAction({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-none text-xs font-bold text-warning underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

function CustomerName({ id, children }: { id: string; children: string }) {
  return (
    <Link
      href={`/dashboard/master/customers/${id}`}
      className="underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */

function DormantPanel() {
  const [days, setDays] = useState(60);
  const [rows, setRows] = useState<DormantCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    customerService
      .dormant({ days, limit: ROWS })
      .then((result) => {
        if (!active) return;
        setRows(result.items);
        setTotal(result.pagination.total);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Daftar pelanggan tidak aktif tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [days]);

  return (
    <Panel
      tone="warn"
      icon={<PawPrint className="size-4" />}
      title="Pelanggan tidak aktif ≥"
      count={loading || error ? undefined : total}
      seeAll={
        !loading && !error && total > 0
          ? {
              href: `/dashboard/master/customers/dormant?days=${days}`,
              label: "Lihat semua",
            }
          : undefined
      }
      control={
        <FilterSelect
          layout="bar"
          label="Batas tidak aktif"
          ariaLabel="Batas tidak aktif"
          value={days}
          options={DORMANT_DAYS}
          onChange={setDays}
          /* A choice, not a filter — ui-rules §16. Navy here would announce an
             applied filter nobody set. */
          active={false}
          unsetValue={-1}
        />
      }
    >
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted">
          <Spinner /> Memuat…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-3 text-sm text-muted">
          Tidak ada pelanggan yang tertinggal ≥{days} hari. Tidak ada yang perlu
          dihubungi hari ini.
        </p>
      ) : (
        <ul>
          {rows.map((row) => {
            const chat = whatsAppLink(row.phone);

            return (
              <WorkRow
                key={row._id}
                name={<CustomerName id={row._id}>{row.name}</CustomerName>}
                meta={
                  (row.lastVisitAt
                    ? `Terakhir ${day(row.lastVisitAt)} · ${row.daysSinceLastVisit} hari lalu`
                    : `Belum pernah belanja · terdaftar ${day(row.createdAt)}`) +
                  (row.phone ? ` · ${row.phone}` : "")
                }
                action={chat && <RowAction href={chat}>Hubungi</RowAction>}
              />
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function NewCustomersPanel() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  /*
    THE EXACT INSTANT THE FETCH USED, not recomputed at render — reading
    `Date.now()` in a render body trips `react-hooks/purity` (see
    `utils/date.ts`), and recomputing it for "Lihat semua" would in any case
    drift a few milliseconds from what the rows above it were actually
    filtered against.
  */
  const [cutoffIso, setCutoffIso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const cutoff = Date.now() - days * DAY_MS;

    Promise.all([
      customerService.list({ page: 1, limit: ROWS }),
      customerService.stats({ newWithinDays: days }),
    ])
      .then(([list, stats]) => {
        if (!active) return;
        /*
          THE REGISTER IS ORDERED NEWEST FIRST, so keeping the rows inside the
          window is enough — there is nothing newer further down the page. The
          COUNT is still the server's, off the stats call, so a shop with fifty
          arrivals this fortnight sees fifty even though ten are drawn.
        */
        setRows(
          list.items.filter(
            (customer) => new Date(customer.createdAt).getTime() >= cutoff,
          ),
        );
        setTotal(stats.newCustomers.count);
        setCutoffIso(new Date(cutoff).toISOString());
        setError(null);
      })
      .catch(() => {
        if (active) setError("Daftar pelanggan baru tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [days]);

  return (
    <Panel
      icon={<User className="size-4" />}
      title="Pelanggan baru dalam"
      count={loading || error ? undefined : (total ?? rows.length)}
      seeAll={
        !loading && !error && total !== null && total > 0 && cutoffIso
          ? {
              href: `/dashboard/master/customers?createdSince=${encodeURIComponent(cutoffIso)}`,
              label: "Lihat semua",
            }
          : undefined
      }
      control={
        <>
          <FilterSelect
            layout="bar"
            label="Jendela pelanggan baru"
            ariaLabel="Jendela pelanggan baru"
            value={days}
            options={NEW_DAYS}
            onChange={setDays}
            active={false}
            unsetValue={-1}
          />
          <span className="text-sm font-bold text-foreground">terakhir</span>
        </>
      }
    >
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted">
          <Spinner /> Memuat…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-3 text-sm text-muted">
          Belum ada pelanggan baru dalam {days} hari terakhir.
        </p>
      ) : (
        <>
          <ul>
            {rows.map((customer) => {
              const chat = whatsAppLink(customer.phone);

              return (
                <WorkRow
                  key={customer._id}
                  name={
                    <CustomerName id={customer._id}>
                      {customer.name}
                    </CustomerName>
                  }
                  meta={
                    `Bergabung ${day(customer.createdAt)} · ${daysSince(customer.createdAt)} hari lalu` +
                    (customer.phone ? ` · ${customer.phone}` : "")
                  }
                  action={chat && <RowAction href={chat}>Sapa</RowAction>}
                />
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function MembershipPanel() {
  return (
    <Panel
      icon={<User className="size-4" />}
      title="Membership mendekati habis"
    >
      <div className="flex flex-wrap items-center gap-3 py-2">
        <Badge variant="outline">Segera</Badge>
        <p className="text-sm text-muted">
          Membership belum ada di sistem, jadi belum ada masa berlaku yang bisa
          diingatkan. Untuk sekarang tier VIP tiap pelanggan ada di tab
          Pelanggan.
        </p>
      </div>
    </Panel>
  );
}
