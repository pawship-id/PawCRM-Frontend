import {
  FINANCE_FIGURES,
  FINANCE_FILTERS,
  SALES_BY_BRANCH,
  SALES_BY_LINE,
  type Bar,
} from "../content";

/** One bar group. The label, the track and the figure share a single scale. */
function BarGroup({ heading, bars }: { heading: string; bars: Bar[] }) {
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h4 className="mb-3 text-xs font-bold text-muted">{heading}</h4>
      <ul className="flex flex-col gap-1.5">
        {bars.map((bar) => (
          <li
            key={bar.label}
            className="grid grid-cols-[76px_1fr_84px] items-center gap-3 sm:grid-cols-[96px_1fr_92px]"
          >
            <span className="text-sm font-medium">{bar.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-background">
              <span
                className={`block h-full rounded-full ${
                  bar.accent ? "bg-secondary" : "bg-info"
                }`}
                style={{ width: `${bar.share}%` }}
              />
            </span>
            <span className="text-right text-sm tabular-nums text-muted">
              {bar.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Keuangan half of the analytics section, as an example panel.
 *
 * THE THREE FIGURES AND THEIR HINTS CARRY THE SCREEN'S OWN WORDS. Somebody who
 * signs up after reading this opens `/dashboard/keuangan` and finds the same
 * four labels, the same hints under them, and the same margin band word — which
 * is the whole point of showing a panel rather than a stock chart.
 *
 * THE BARS ARE NOT A SCREENSHOT of one report. They are what the Cabang and
 * Lini bisnis filters make readable, and both groups total the Total Revenue
 * above them, so the panel does not contradict itself.
 */
export function FinancePanel() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-md sm:p-6">
      <ul className="mb-4 flex flex-wrap gap-2">
        {FINANCE_FILTERS.map((filter) => (
          <li
            key={filter}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-primary"
          >
            {filter}
          </li>
        ))}
      </ul>

      <ul className="grid gap-3.5 sm:grid-cols-3">
        {FINANCE_FIGURES.map((figure) => (
          <li key={figure.label} className="rounded-xl bg-background px-4 py-3.5">
            <p className="text-xs leading-snug font-medium text-muted">
              {figure.label}
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">
              {figure.value}
            </p>
            <p
              className={`mt-0.5 text-xs ${
                figure.good ? "font-semibold text-success" : "text-muted"
              }`}
            >
              {figure.hint}
            </p>
          </li>
        ))}
      </ul>

      {/*
        THE ONE ORANGE PANEL ON THE PAGE'S LIGHT HALF, and it is the one place
        that means "somebody has to do something" — ui-rules §4. The three counts
        in it are the three alert lists the Inventory hub really opens with.
      */}
      <div className="mt-4 rounded-xl bg-tint-warning px-4 py-4">
        <p className="mb-1 text-[15px] font-bold">Yang perlu ditindak hari ini</p>
        <p className="text-sm leading-relaxed text-foreground/85">
          6 item di bawah stok minimum, 2 di antaranya habis total. Empat lot
          kedaluwarsa dalam 30 hari, dan satu gudang punya saldo minus yang belum
          dijelaskan.
        </p>
      </div>

      <BarGroup heading="Penjualan bulan ini per cabang" bars={SALES_BY_BRANCH} />
      <BarGroup heading="Per lini bisnis" bars={SALES_BY_LINE} />
    </div>
  );
}
