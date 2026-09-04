"use client";

import { useEffect, useState } from "react";

import { Alert, FilterPills, Spinner } from "@/components";
import { petService } from "@/services/pet.service";
import { formatMoney } from "@/utils/decimal";
import type { PetTimeline, PetTimelineQuery } from "@/types/api";

const KINDS: { value: NonNullable<PetTimelineQuery["kind"]>; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "booking", label: "Grooming" },
  { value: "pos", label: "Kasir" },
  { value: "invoice", label: "Faktur" },
];

const KIND_LABEL: Record<string, string> = {
  booking: "Grooming",
  pos: "Kasir",
  invoice: "Faktur",
};

/** A date somebody reads, in the shop's own clock. */
function moment(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "21 hari lalu" — the shape of the question somebody actually asks. */
function daysAgo(iso: string): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  return `${days} hari lalu`;
}

/**
 * "Everything this animal has ever had done" — FR-5's Riwayat tab.
 *
 * ONE LIST, NOT THREE. Grooming, till sales and invoices are three collections
 * and one history: what somebody wants to know is what happened to the dog, not
 * which system recorded it. The pills narrow it; they do not split it.
 *
 * THE THREE FIGURES ABOVE IGNORE THE PILLS, and that is deliberate. "Terakhir
 * dilayani" has one answer, and a version that moved when somebody filtered to
 * Kasir would be answering a different question from the one its label asks.
 */
export function PetTimelineTab({ petId }: { petId: string }) {
  const [kind, setKind] = useState<NonNullable<PetTimelineQuery["kind"]>>("all");
  const [data, setData] = useState<PetTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    petService
      .timeline(petId, { kind })
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError("Riwayat tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [petId, kind]);

  return (
    <div className="flex flex-col gap-4">
      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure
            label="Terakhir dilayani"
            value={
              data.summary.lastServedAt
                ? daysAgo(data.summary.lastServedAt)
                : "Belum pernah"
            }
            hint={
              data.summary.lastServedAt
                ? moment(data.summary.lastServedAt)
                : undefined
            }
          />
          <Figure
            label="Jumlah kunjungan"
            value={String(data.summary.visitCount)}
            /* VISITS, NOT ROWS. A bath and a nail trim on one booking is one
               visit; counting rows would tell an owner their dog has been in
               fourteen times when it has been in nine. */
            hint="satu kedatangan dihitung sekali"
          />
          <Figure
            label="Groomer paling sering"
            value={data.summary.topGroomerName ?? "—"}
          />
        </div>
      )}

      <FilterPills
        value={kind}
        options={KINDS}
        onChange={setKind}
        ariaLabel="Filter jenis riwayat"
      />

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted">
          <Spinner /> Memuat riwayat…
        </div>
      ) : (data?.entries.length ?? 0) === 0 ? (
        /*
          A NEW ANIMAL HAS NO HISTORY, and that is not an error. An invitation
          reads better than an empty box, and better than "tidak ada data" —
          which sounds like something failed.
        */
        <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          Belum ada riwayat. Setelah kunjungan pertama, semuanya muncul di sini.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {data?.entries.map((entry, index) => (
            <li
              key={`${entry.kind}-${entry.reference ?? index}-${entry.at}`}
              className="rounded-lg border border-border px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {entry.title}
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {entry.amount ? formatMoney(entry.amount) : "—"}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                <span>{moment(entry.at)}</span>
                <span>{KIND_LABEL[entry.kind] ?? entry.kind}</span>
                {entry.reference && <span>{entry.reference}</span>}
                {entry.groomerName && <span>{entry.groomerName}</span>}
                {/*
                  A CANCELLED BOOKING STAYS ON THE LIST, and says so. "We booked
                  her in three times and she never came" is exactly the kind of
                  thing a history is consulted for.
                */}
                {entry.status === "cancelled" && (
                  <span className="font-semibold text-danger">Dibatalkan</span>
                )}
              </div>
              {entry.notes && (
                <p className="mt-1 text-xs text-muted">{entry.notes}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <span className="block text-xs text-muted">{label}</span>
      <span className="block text-base font-semibold text-foreground">
        {value}
      </span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </div>
  );
}
