"use client";

import { Trash2 } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useZones } from "@/hooks/useZones";
import { zoneRangeText } from "@/features/settings/zones";
import type { Zone } from "@/types/api";

import { feeErrorKey, type DraftErrors, type GroomingSettingsDraft } from "../settings";
import { ChoiceCards } from "./GroomingSettingsControls";

type Update = (
  change: (current: GroomingSettingsDraft) => GroomingSettingsDraft,
) => void;

/**
 * Layanan › Grooming › Pengaturan › Home grooming — EVERY HOME-GROOMING SETTING
 * IN ONE PLACE (10 October 2026): how a visit's fee is counted, and what each
 * zone costs.
 *
 * ─── THE ZONES ARE NOT EDITED HERE, AND CARRY NO MONEY ─────────────────────
 *
 * A zone is a band of distance (Pengaturan › Layanan › Zona) that antar-jemput
 * shares. What a house call to one costs is a grooming decision, so the fee is a
 * row HERE, naming a zone that already exists. A zone with no row costs
 * nothing.
 *
 * A ROW WHOSE ZONE IS GONE is drawn as such, with a way to clear it — the
 * server refuses to save a fee for a zone that no longer exists, and a row the
 * person cannot see would block the whole page.
 */
export function GroomingVisitFeeSettings({
  draft,
  errors,
  update,
  disabled,
}: {
  draft: GroomingSettingsDraft;
  errors: DraftErrors;
  update: Update;
  disabled: boolean;
}) {
  const { items: zones, loading, error } = useZones();
  const live = zones.filter((zone) => zone.deletedAt === null);
  const byId = new Map(live.map((zone) => [zone._id, zone]));
  const rows = draft.homeGrooming.fees;
  const taken = new Set(rows.map((row) => row.zoneId));
  const available = live.filter((zone) => !taken.has(zone._id));

  function setFees(next: GroomingSettingsDraft["homeGrooming"]["fees"]) {
    update((current) => ({
      ...current,
      homeGrooming: { ...current.homeGrooming, fees: next },
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Biaya kunjungan dihitung"
        description="Berapa kali biaya kunjungan ditagih kalau groomer datang ke rumah pelanggan."
      >
        <ChoiceCards
          legend="Biaya kunjungan dihitung"
          value={draft.homeGrooming.feeUnit}
          onChange={(feeUnit) =>
            update((current) => ({
              ...current,
              homeGrooming: { ...current.homeGrooming, feeUnit },
            }))
          }
          options={[
            {
              value: "per_visit",
              label: "Per kunjungan",
              description:
                "Sekali untuk satu rumah, berapa pun hewannya. 2 anjing di rumah yang sama ditagih sekali.",
            },
            {
              value: "per_pet",
              label: "Per hewan",
              description:
                "Sekali untuk tiap hewan. 2 anjing di rumah yang sama ditagih dua kali.",
            },
          ]}
          disabled={disabled}
        />
        <p className="mt-4 text-xs text-muted">
          Berlaku untuk booking baru. Booking yang sudah dibuat tetap memakai
          hitungan saat dibuat.
        </p>
      </Card>

      <Card
        title="Biaya per zona"
        description="Pilih zona yang sudah dibuat, lalu isi biaya kunjungannya. Zona yang tidak ada di daftar ini tidak dikenai biaya."
      >
        {error && <Alert variant="error">{error}</Alert>}

        {loading && zones.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <Spinner /> Memuat zona…
          </div>
        ) : live.length === 0 ? (
          <Alert variant="info">
            Belum ada zona. Buat dulu di Pengaturan › Layanan › Zona — zona itulah
            yang nanti dipilih di sini.
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            {rows.length === 0 ? (
              <p className="text-sm text-muted">
                Belum ada biaya. Semua zona ditagih Rp 0 untuk kunjungan.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30%]">Zona</TableHead>
                      <TableHead className="w-[22%]">Rentang</TableHead>
                      <TableHead>Biaya kunjungan</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Hapus</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const zone: Zone | undefined = byId.get(row.zoneId);
                      const message = errors[feeErrorKey(row.zoneId)];

                      return (
                        <TableRow key={row.zoneId}>
                          <TableCell className="align-top font-semibold">
                            {zone ? (
                              zone.name
                            ) : (
                              <span className="text-danger">Zona sudah dihapus</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted">
                            {zone ? zoneRangeText(zone) : "—"}
                          </TableCell>
                          <TableCell className="align-top">
                            {zone ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted">Rp</span>
                                  <Input
                                    inputMode="numeric"
                                    aria-label={`Biaya kunjungan ${zone.name}`}
                                    aria-invalid={message ? true : undefined}
                                    value={row.fee}
                                    placeholder="mis. 40000"
                                    className="max-w-44 tabular-nums"
                                    disabled={disabled}
                                    onChange={(event) =>
                                      setFees(
                                        rows.map((one) =>
                                          one.zoneId === row.zoneId
                                            ? { ...one, fee: event.target.value }
                                            : one,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                {message && (
                                  <p role="alert" className="text-xs text-danger">
                                    {message}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted">
                                Hapus baris ini supaya pengaturan bisa disimpan.
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Hapus biaya ${zone?.name ?? "zona yang sudah dihapus"}`}
                              disabled={disabled}
                              onClick={() =>
                                setFees(rows.filter((one) => one.zoneId !== row.zoneId))
                              }
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {available.length > 0 ? (
                <>
                  <label htmlFor="home-fee-add-zone" className="sr-only">
                    Tambah zona
                  </label>
                  <select
                    id="home-fee-add-zone"
                    className="h-11 rounded-lg border border-border bg-surface px-3 text-sm"
                    disabled={disabled}
                    value=""
                    onChange={(event) => {
                      const zoneId = event.target.value;
                      if (zoneId) setFees([...rows, { zoneId, fee: "" }]);
                    }}
                  >
                    <option value="">Tambah zona…</option>
                    {available.map((zone) => (
                      <option key={zone._id} value={zone._id}>
                        {zone.name} · {zoneRangeText(zone)}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="text-xs text-muted">
                  Semua zona sudah punya biaya. Buat zona baru di Pengaturan ›
                  Layanan › Zona kalau perlu.
                </p>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
