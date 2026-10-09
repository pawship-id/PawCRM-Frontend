"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Coffee, RefreshCw, Sun } from "lucide-react";

import { Alert, Button, Spinner } from "@/components";
import { cn } from "@/lib/utils";
import type { GroomerJobs } from "@/types/groomer";
import { longDate, todayKey } from "../dates";
import { useGroomerActions } from "../hooks/useGroomerActions";
import { useGroomerJobs } from "../hooks/useGroomerJobs";
import { useNow } from "../hooks/useNow";
import { DayStrip } from "./DayStrip";
import { BookingCard } from "./BookingCard";
import { CommissionSummary } from "./CommissionSummary";

type Tab = "saya" | "open" | "selesai";

/**
 * The groomer's day — Job Saya, Open Job, Selesai.
 *
 * ─── WHAT THE MANAGER SWITCHES CHANGE ──────────────────────────────────────
 * With open-job claiming off there is no Open Job tab at all, and the server
 * returns an empty list besides: hiding it here is the courtesy, the server is
 * the rule. Per-job commission is not on this screen in any case (decision of
 * 8 Oktober 2026); the summary on Selesai appears only if the shop allows it.
 */
export function GroomerScreen() {
  const router = useRouter();
  const [date, setDate] = useState(() => todayKey());
  const [tab, setTab] = useState<Tab>("saya");

  const { data, loading, error, reload } = useGroomerJobs(date);
  const { busy, claim, move, arrive } = useGroomerActions(reload);

  const running = Boolean(
    data?.saya.some((booking) => booking.sessions.some((one) => one.mine && one.status === "in_progress")),
  );
  const now = useNow(running);

  const openTab = data?.settings.allowOpenJobClaim ? "open" : null;
  // A tab that vanished (the manager switched it off) must not strand the screen.
  const activeTab: Tab = tab === "open" && !openTab ? "saya" : tab;

  const petName = (bookingId: string) =>
    [...(data?.saya ?? []), ...(data?.open ?? []), ...(data?.selesai ?? [])].find(
      (one) => one.bookingId === bookingId,
    )?.pet.name ?? null;

  /** The card's handlers for one booking. */
  const handlers = (bookingId: string) => ({
    onArrive: () => void arrive(bookingId, petName(bookingId)),
    onStart: (sessionId: string) =>
      void move(bookingId, sessionId, "in_progress", `${petName(bookingId) ?? "Sesi"} dimulai`),
    onFinish: (sessionId: string, afterCount: number) => {
      // The server refuses too; asking first spares a round trip and says why —
      // and the photograph is taken on the detail screen, not on a list.
      if (afterCount === 0) {
        router.push(`/groomer/booking/${bookingId}?foto=after&sesi=${sessionId}`);
        return;
      }
      void move(bookingId, sessionId, "done", `${petName(bookingId) ?? "Sesi"} selesai`);
    },
    onClaim: (sessionId: string) => void claim(bookingId, sessionId, petName(bookingId)),
  });

  const list = (kind: "saya" | "open" | "selesai" | "lain", bookings: GroomerJobs["saya"]) =>
    bookings.map((booking) => (
      <BookingCard
        key={`${kind}-${booking.bookingId}`}
        booking={booking}
        kind={kind}
        now={now}
        busyKey={busy}
        {...handlers(booking.bookingId)}
      />
    ));

  return (
    <div className="mx-auto w-full max-w-xl">
      {data && <DayStrip week={data.week} selected={date} onSelect={setDate} />}

      <div className="px-4 pb-24 pt-4">
        <Header data={data} date={date} />

        <div role="tablist" aria-label="Daftar job" className="mt-4 flex gap-1.5 rounded-xl bg-tint-neutral p-1">
          <TabButton on={activeTab === "saya"} count={data?.saya.length} onClick={() => setTab("saya")}>
            Job Saya
          </TabButton>
          {openTab && (
            <TabButton on={activeTab === "open"} count={data?.open.length} onClick={() => setTab("open")}>
              Open Job
            </TabButton>
          )}
          <TabButton on={activeTab === "selesai"} count={data?.selesai.length} onClick={() => setTab("selesai")}>
            Selesai
          </TabButton>
        </div>

        <div className="mt-4" aria-live="polite">
          {loading && !data && (
            <div className="flex justify-center py-16 text-primary">
              <Spinner size={28} />
            </div>
          )}

          {error && (
            <div className="space-y-3">
              <Alert variant="error">{error}</Alert>
              <Button variant="secondary" className="min-h-11" onClick={() => void reload()}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Muat ulang
              </Button>
            </div>
          )}

          {data && activeTab === "saya" && (
            <>
              <Section title="Ditugaskan ke kamu" note={`${data.saya.length} hewan`}>
                {data.saya.length === 0 ? (
                  <Empty icon={<Coffee className="size-7" aria-hidden="true" />}>
                    Belum ada tugas di hari ini.
                  </Empty>
                ) : (
                  list("saya", data.saya)
                )}
              </Section>

              {data.lain.length > 0 && (
                <Section title="Dipegang groomer lain" note="tidak bisa diambil">
                  {list("lain", data.lain)}
                </Section>
              )}
            </>
          )}

          {data && activeTab === "open" && (
            <Section title="Ada sesi yang belum ada groomer" note="siapa cepat">
              {data.open.length === 0 ? (
                <Empty icon={<Sun className="size-7" aria-hidden="true" />}>
                  Tidak ada open job hari ini.
                </Empty>
              ) : (
                list("open", data.open)
              )}
            </Section>
          )}

          {data && activeTab === "selesai" && data.settings.showOwnCommission && <CommissionSummary />}

          {data && activeTab === "selesai" && (
            <Section title="Sudah selesai" note={`${data.selesai.length} hewan`}>
              {data.selesai.length === 0 ? (
                <Empty icon={<Sun className="size-7" aria-hidden="true" />}>
                  Belum ada yang selesai.
                </Empty>
              ) : (
                list("selesai", data.selesai)
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ data, date }: { data: GroomerJobs | null; date: string }) {
  const load = data?.load;
  const pct = load ? Math.min(100, Math.round((load.plannedMin / Math.max(1, load.capacityMin)) * 100)) : 0;
  const isToday = date === todayKey();

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{isToday ? "Hari ini" : "Jadwal"}</h1>
          <p className="text-sm text-muted">{longDate(date)}</p>
        </div>
        {load && (
          <p className="text-right text-xs text-muted tabular-nums">
            Beban hari ini
            <b className="block text-sm text-foreground">
              {load.plannedMin}/{load.capacityMin} mnt
            </b>
          </p>
        )}
      </div>

      {load && (
        <div
          role="progressbar"
          aria-label="Beban hari ini"
          aria-valuemin={0}
          aria-valuemax={load.capacityMin}
          aria-valuenow={Math.min(load.plannedMin, load.capacityMin)}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-tint-neutral"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}

      {load?.offReason && (
        <div className="mt-3">
          <Alert variant="info">
            <span className="flex items-center gap-2">
              <CalendarOff className="size-4" aria-hidden="true" />
              {load.offReason}
            </span>
          </Alert>
        </div>
      )}
    </div>
  );
}

function TabButton({
  on,
  count,
  onClick,
  children,
}: {
  on: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60",
        on ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-hover",
      )}
    >
      {children}
      {count != null && <span className="tabular-nums"> ({count})</span>}
    </button>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        <span className="text-xs text-muted">{note}</span>
      </div>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function Empty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
      {icon}
      {children}
    </li>
  );
}
