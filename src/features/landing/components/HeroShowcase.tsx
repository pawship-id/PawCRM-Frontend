"use client";

import { useRef, useState } from "react";

import {
  HERO_ANALYTICS_INSIGHT,
  HERO_CALENDAR_INSIGHT,
  HERO_KPIS,
  HERO_PROFIT_INSIGHT,
  HERO_PROFIT_LINES,
  HERO_TABS,
  HERO_WEEK,
  type CalendarSlot,
  type HeroInsight,
  type HeroTabId,
} from "../content";

/**
 * The note under every panel.
 *
 * ORANGE, AND IT IS THE ONLY ORANGE INSIDE THE PANEL — ui-rules §4. It is also
 * the panel's whole argument: the figures above it are what a report shows, and
 * this line is the thing a person is supposed to do about them. Navy ink on the
 * orange fill, per §4.
 */
function Insight({ insight }: { insight: HeroInsight }) {
  return (
    <div className="mt-4 rounded-xl bg-tint-warning px-4 py-3.5">
      <p className="text-sm font-bold">{insight.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground/85">
        {insight.body}
      </p>
    </div>
  );
}

/** Every panel opens the same way: what this is, and whose it is. */
function PanelHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-border pb-3.5">
      <p className="font-display text-base font-extrabold">{title}</p>
      <span className="text-xs whitespace-nowrap text-muted">{meta}</span>
    </div>
  );
}

const KPI_TONE = {
  up: "text-success",
  down: "text-danger",
  warn: "text-warning",
} as const;

function AnalyticsPanel() {
  return (
    <>
      <PanelHead title="Hari ini" meta="Semua cabang" />
      <ul className="grid gap-3 sm:grid-cols-3">
        {HERO_KPIS.map((kpi) => (
          <li key={kpi.label} className="rounded-xl bg-background px-4 py-3">
            <p className="text-xs leading-snug text-muted">{kpi.label}</p>
            <p className="mt-1 font-display text-[21px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
              {kpi.value}
            </p>
            <p className={`mt-1.5 text-xs font-semibold ${KPI_TONE[kpi.tone]}`}>
              {kpi.delta}
            </p>
          </li>
        ))}
      </ul>
      <Insight insight={HERO_ANALYTICS_INSIGHT} />
    </>
  );
}

/*
  A FREE RUN IS DRAWN, NOT LEFT BLANK. An empty column reads as "the calendar has
  not loaded"; a hatched block that says how many slots are open is the thing the
  panel is actually selling, and it is what the insight underneath points at.
*/
const SLOT_TONE = {
  booked: "bg-tint-brand text-primary",
  stay: "bg-tint-success text-success",
  due: "bg-tint-warning text-warning",
  free: "border border-dashed border-border bg-background text-center text-muted",
} as const;

function Slot({ slot }: { slot: CalendarSlot }) {
  return (
    <li
      className={`rounded-lg px-2 py-1.5 text-xs leading-snug font-semibold ${SLOT_TONE[slot.tone]}`}
    >
      {slot.time ? `${slot.time} ${slot.title}` : slot.title}
      {slot.detail && (
        <span className="block font-medium opacity-80">{slot.detail}</span>
      )}
    </li>
  );
}

function CalendarPanel() {
  return (
    <>
      <PanelHead title="Booking minggu ini" meta="2 groomer" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {HERO_WEEK.map((day) => (
          <div key={day.day}>
            <p className="pb-1.5 text-center text-xs font-bold text-muted">
              {day.day}
            </p>
            <ul className="flex flex-col gap-1.5">
              {day.slots.map((slot) => (
                <Slot key={`${slot.title}-${slot.time ?? ""}`} slot={slot} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Insight insight={HERO_CALENDAR_INSIGHT} />
    </>
  );
}

const MARGIN_TONE = {
  high: "text-success",
  low: "text-danger",
  plain: "",
} as const;

function ProfitPanel() {
  return (
    <>
      <PanelHead title="Untung per lini" meta="September" />
      <ul className="flex flex-col gap-3">
        <li
          aria-hidden
          className="grid grid-cols-[1fr_66px] items-center gap-x-3 text-xs font-bold text-muted sm:grid-cols-[1.2fr_1fr_78px]"
        >
          <span>Lini bisnis</span>
          <span className="max-sm:hidden">Omzet</span>
          <span className="text-right">Margin</span>
        </li>
        {HERO_PROFIT_LINES.map((line) => (
          <li
            key={line.name}
            className="grid grid-cols-[1fr_66px] items-center gap-x-3 sm:grid-cols-[1.2fr_1fr_78px]"
          >
            <span>
              <span className="block text-[15px] leading-snug font-semibold">
                {line.name}
              </span>
              <span className="block text-xs text-muted">{line.detail}</span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-background max-sm:hidden">
              <span
                className={`block h-full rounded-full ${line.accent ? "bg-secondary" : "bg-info"}`}
                style={{ width: `${line.share}%` }}
              />
            </span>
            <span
              className={`text-right text-sm font-semibold tabular-nums ${MARGIN_TONE[line.tone]}`}
            >
              {line.margin}
            </span>
          </li>
        ))}
      </ul>
      <Insight insight={HERO_PROFIT_INSIGHT} />
    </>
  );
}

const PANELS: Record<HeroTabId, () => React.JSX.Element> = {
  analitik: AnalyticsPanel,
  kalender: CalendarPanel,
  keuangan: ProfitPanel,
};

/**
 * The hero's three example screens, behind three tabs.
 *
 * WHITE PANELS ON THE NAVY HERO. The product runs on a white surface and this is
 * the first look anybody gets at it; tinting the panel to match the hero would
 * sell a screen that does not exist.
 *
 * THE FIGURES ARE AN EXAMPLE. What they are not is invented behaviour — every
 * badge, column and label below is one the product really draws.
 *
 * A CLIENT COMPONENT, and one of only two on the page. Three panels are three
 * screenfuls of proof in the space of one, and there is no CSS-only tab that
 * also moves focus with the arrow keys.
 */
export function HeroShowcase() {
  const [active, setActive] = useState<HeroTabId>("analitik");
  const tabRefs = useRef<Partial<Record<HeroTabId, HTMLButtonElement | null>>>(
    {},
  );

  /* Left/Right wrap around and take focus with them — the tablist pattern. */
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;

    event.preventDefault();
    const next =
      HERO_TABS[(index + step + HERO_TABS.length) % HERO_TABS.length].id;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Tampilan Buloo"
        className="mb-3.5 flex flex-wrap gap-1.5"
      >
        {HERO_TABS.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`h-11 rounded-full border px-4 text-sm font-semibold transition focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
                selected
                  ? "border-surface bg-surface text-foreground"
                  : "border-white/20 bg-white/10 text-primary-foreground/80 hover:bg-white/20"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {HERO_TABS.map((tab) => {
        const Panel = PANELS[tab.id];
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={tab.id !== active}
            className="rounded-2xl bg-surface p-5 text-foreground shadow-lg sm:p-6"
          >
            <Panel />
          </div>
        );
      })}
    </div>
  );
}
