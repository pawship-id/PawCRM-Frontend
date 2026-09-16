"use client";

import Link from "next/link";

import { Alert, Card } from "@/components";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { GroomerCapacityDay } from "@/types/api";

import {
  capacityRows,
  nextOverride,
  teamLoad,
  type CapacityRow,
  type DraftErrors,
  type GroomingSettingsDraft,
  type LoadTone,
} from "../settings";
import { ChoiceCards, LoadBar, UnitField } from "./GroomingSettingsControls";

type Update = (
  change: (current: GroomingSettingsDraft) => GroomingSettingsDraft,
) => void;

const TONE_BADGE: Record<LoadTone, string> = {
  normal: "bg-tint-brand text-primary",
  high: "bg-tint-warning text-warning",
  over: "bg-tint-danger text-danger",
};

/** "Minggu, 13 September" — the capacity date is a local calendar day. */
function dayWords(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const at = new Date(year, month - 1, day);

  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
}

/** Status in words beside a bar — never the bar's colour alone (§1.3). */
function LoadBadge({ row }: { row: CapacityRow }) {
  if (row.tone === "normal") return null;

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        TONE_BADGE[row.tone],
      )}
    >
      {row.tone === "over" ? `lewat ${row.overBy} mnt` : "Hampir penuh"}
    </span>
  );
}

/**
 * The Kapasitas sub-tab's main column.
 *
 * ─── THE TABLE PREVIEWS THE DRAFT ──────────────────────────────────────────
 *
 * Minutes used come from today's bookings; capacity comes from the boxes as
 * they are typed. Somebody lowering Rio to 300 sees his bar go red before
 * saving, which is the moment that number is worth seeing.
 */
export function GroomingCapacitySettings({
  draft,
  errors,
  update,
  disabled,
  mayEditOverrides,
  capacity,
  capacityError,
  mayReadBookings,
}: {
  draft: GroomingSettingsDraft;
  errors: DraftErrors;
  update: Update;
  /** No `tenants:update` — nothing on the screen is editable. */
  disabled: boolean;
  /** `users:update` — the overrides live on each user. */
  mayEditOverrides: boolean;
  capacity: GroomerCapacityDay | null;
  capacityError: string | null;
  mayReadBookings: boolean;
}) {
  const rows = capacity ? capacityRows(capacity, draft) : [];
  const team = teamLoad(rows);
  const overridesLocked = disabled || !mayEditOverrides;

  function setOverride(id: string, value: string | null) {
    update((current) => ({
      ...current,
      overrides: { ...current.overrides, [id]: value },
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Kapasitas harian"
        description="Menit kerja satu groomer dalam sehari — dasar beban harian dan pemeriksaan booking yang melewati batas."
      >
        <UnitField
          label="Bawaan per groomer"
          value={draft.capacity.defaultMinutes}
          onChange={(defaultMinutes) =>
            update((current) => ({
              ...current,
              capacity: { ...current.capacity, defaultMinutes },
            }))
          }
          suffix="menit per hari"
          hint="Berlaku untuk semua groomer yang tidak ditimpa di bawah. 420 menit = 7 jam."
          error={errors["capacity.defaultMinutes"]}
          disabled={disabled}
        />
      </Card>

      <Card
        title="Timpa per groomer"
        description="Untuk groomer yang jam kerjanya beda dari bawaan — paruh waktu, atau yang pegang meja lebih lama."
        action={
          capacity && rows.length > 0 ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap",
                TONE_BADGE[team.tone],
              )}
            >
              {team.used} / {team.capacity} menit terpakai hari ini
            </span>
          ) : undefined
        }
      >
        {!mayReadBookings ? (
          <Alert variant="info">
            Daftar groomer dan beban hari ini dibaca dari booking, dan role Anda
            tidak bisa melihat booking.
          </Alert>
        ) : capacityError ? (
          <Alert variant="error">{capacityError}</Alert>
        ) : !capacity ? null : rows.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada groomer.{" "}
            <Link
              href="/dashboard/master/users"
              className="rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Tandai stafnya sebagai groomer di Master Data › User →
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {!disabled && !mayEditOverrides && (
              <Alert variant="info">
                Mengubah kapasitas per groomer perlu izin ubah pengguna. Role Anda
                hanya bisa melihatnya.
              </Alert>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Groomer</TableHead>
                    <TableHead>Kapasitas</TableHead>
                    <TableHead>Terpakai hari ini</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const raw = draft.overrides[row.id] ?? null;
                    const error = errors[`override.${row.id}`];

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-normal align-top">
                          <span className="block text-sm font-semibold text-foreground">
                            {row.name}
                          </span>
                          {row.offReason && (
                            <span className="block text-xs text-muted">
                              {row.offReason}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            {/*
                              h-9, not 44: a control inside a row table sits
                              among its row, per §16's first exception.
                            */}
                            <Input
                              aria-label={`Kapasitas ${row.name} (menit)`}
                              aria-invalid={error ? true : undefined}
                              inputMode="numeric"
                              value={raw ?? draft.capacity.defaultMinutes}
                              onChange={(event) =>
                                setOverride(
                                  row.id,
                                  nextOverride(
                                    event.target.value,
                                    draft.capacity.defaultMinutes,
                                  ),
                                )
                              }
                              disabled={overridesLocked}
                              className={cn(
                                "h-9 w-24 text-right tabular-nums",
                                error && "border-danger focus-visible:ring-danger/40",
                              )}
                            />
                            <span className="text-sm text-muted">mnt</span>
                          </div>
                          {error ? (
                            <p role="alert" className="mt-1 text-xs font-semibold text-danger">
                              {error}
                            </p>
                          ) : row.overridden ? (
                            <button
                              type="button"
                              aria-label={`Kembalikan kapasitas ${row.name} ke bawaan`}
                              disabled={overridesLocked}
                              onClick={() => setOverride(row.id, null)}
                              className="mt-1 rounded text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              kembalikan ke bawaan
                            </button>
                          ) : (
                            <p className="mt-1 text-xs text-muted">ikut bawaan</p>
                          )}
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="flex min-w-48 flex-col gap-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm tabular-nums">
                              <span>
                                {row.used} / {row.capacity} mnt
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="text-muted">{row.percent}%</span>
                                <LoadBadge row={row} />
                              </span>
                            </div>
                            <LoadBar percent={row.percent} tone={row.tone} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Kalau kapasitas terlampaui"
        description="Yang terjadi saat booking baru membuat seorang groomer melewati kapasitasnya."
      >
        <div className="flex flex-col gap-4">
          <ChoiceCards
            legend="Yang dilakukan sistem"
            value={draft.capacity.overLimit}
            onChange={(overLimit) =>
              update((current) => ({
                ...current,
                capacity: { ...current.capacity, overLimit },
              }))
            }
            options={[
              {
                value: "warn",
                label: "Peringatkan saja",
                description:
                  "Booking tetap bisa disimpan setelah yang menyimpannya mengiyakan peringatan.",
              },
              {
                value: "block",
                label: "Tolak booking",
                description:
                  "Booking yang membuat groomer lewat kapasitas tidak bisa disimpan.",
              },
            ]}
            disabled={disabled}
          />

          {draft.capacity.overLimit === "block" && (
            <Alert variant="warning">
              <span className="block font-semibold">
                Pikirkan lagi sebelum memakai ini
              </span>
              <span className="mt-1 block">
                Salon menerima pelanggan lewat batas sepanjang waktu. Sistem yang
                menolak biasanya diakali dengan mencatat di kertas — dan pada saat
                itu datanya sudah hilang sama sekali.
              </span>
            </Alert>
          )}
        </div>
      </Card>
    </div>
  );
}

/** The right-hand panel on Kapasitas: the team's day at a glance. */
export function GroomingTeamLoadPanel({
  draft,
  capacity,
  capacityError,
  mayReadBookings,
}: {
  draft: GroomingSettingsDraft;
  capacity: GroomerCapacityDay | null;
  capacityError: string | null;
  mayReadBookings: boolean;
}) {
  const rows = capacity ? capacityRows(capacity, draft) : [];
  const team = teamLoad(rows);

  return (
    <section
      aria-labelledby="grooming-team-load"
      className="rounded-xl bg-primary p-6 text-primary-foreground shadow-md"
    >
      <h2 id="grooming-team-load" className="text-base font-bold">
        Beban tim hari ini
      </h2>

      {!capacity ? (
        <p className="mt-2 text-sm text-primary-foreground/80">
          {!mayReadBookings
            ? "Perlu izin melihat booking."
            : capacityError
              ? "Belum bisa dimuat."
              : "—"}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-primary-foreground/80">
            {dayWords(capacity.date)}
          </p>

          <p className="mt-4 text-4xl font-extrabold tabular-nums">
            {team.percent === null ? "—" : `${team.percent}%`}
          </p>
          <p className="mt-1 text-sm tabular-nums text-primary-foreground/80">
            {team.used} dari {team.capacity} menit
          </p>
          {team.tone !== "normal" && (
            <span
              className={cn(
                "mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                team.tone === "over"
                  ? "bg-tint-danger text-danger-ink"
                  : "bg-tint-warning text-secondary-foreground",
              )}
            >
              {team.tone === "over" ? "Lewat kapasitas" : "Hampir penuh"}
            </span>
          )}

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-primary-foreground/80">
              Belum ada groomer.
            </p>
          ) : (
            <ul className="mt-5 flex flex-col gap-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{row.name}</span>
                    <span className="flex-none tabular-nums text-primary-foreground/80">
                      {row.percent}%{row.overBy > 0 && ` · lewat ${row.overBy} mnt`}
                    </span>
                  </div>
                  {row.offReason && (
                    <p className="text-xs text-primary-foreground/80">
                      {row.offReason}
                    </p>
                  )}
                  <div className="mt-1">
                    <LoadBar percent={row.percent} tone={row.tone} onDark />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
