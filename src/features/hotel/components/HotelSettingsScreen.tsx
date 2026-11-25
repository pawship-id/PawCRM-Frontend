"use client";

import Link from "next/link";

import { Alert, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GroomingModuleHeader } from "@/features/grooming/components/GroomingModuleHeader";
import {
  ChoiceCards,
  SwitchRow,
  UnitField,
} from "@/features/grooming/components/GroomingSettingsControls";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { usePermissions } from "@/features/permissions";
import { roomTypeHolds } from "@/features/services/components/HotelRoomTypesField";
import { useHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
import { cn } from "@/lib/utils";

import { useHotelSettings } from "../hooks/useHotelSettings";
import { HotelDailyStepsCard } from "./HotelDailyStepsCard";
import { HOTEL_LINE } from "../line";
import { HOTEL_CATALOG_PATH, HOTEL_ROOM_TYPES_PATH } from "../paths";
import type { CommissionSize } from "@/features/grooming/settings";

/**
 * Layanan › Hotel › Pengaturan (21 November 2026, PLAN-Hotel-V1.md §4.1).
 *
 * Room types, then one Komisi card (as in the mockup): how much (none, a nominal, a
 * nominal by size, a percentage of the night's price), who gets it (BO, 21
 * November 2026: the whole night to the day's PIC, or split by tahapan), and the
 * add-on rule. Kegiatan harian (BO, 21 November 2026) are the DEFAULT tahapan,
 * times and porsi a new hotel service starts with; each service may change its
 * own after — see HotelDailyStepsCard.
 *
 * Reading is `serviceSettings:read`; saving `serviceSettings:update` or
 * `tenants:update`, as on Grooming's.
 */
export function HotelSettingsScreen() {
  const { can } = usePermissions();
  const mayUpdate =
    can("serviceSettings", "update") || can("tenants", "update");
  const mayOpenCatalog = can("services", "read");
  const state = useHotelSettings();
  const { draft, settings } = state;
  const invalid = Object.keys(state.errors).length > 0;

  const header = (
    <GroomingModuleHeader
      line={HOTEL_LINE}
      action={
        draft && mayUpdate ? (
          <>
            {state.dirty && invalid && (
              <p className="max-w-xs self-center text-xs text-muted">
                Belum bisa disimpan:{" "}
                <b className="font-semibold">isiannya belum benar</b>
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!state.dirty || state.saving}
              onClick={state.discard}
            >
              Batalkan perubahan
            </Button>
            <Button
              type="button"
              disabled={!state.dirty || invalid || state.saving}
              onClick={() => void state.save()}
            >
              {state.saving && <Spinner size={16} />}
              {state.saving ? "Menyimpan…" : "Simpan pengaturan"}
            </Button>
          </>
        ) : undefined
      }
    />
  );

  if (state.loadError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert variant="error">{state.loadError}</Alert>
        <div>
          <Button type="button" variant="secondary" onClick={state.retry}>
            Muat ulang
          </Button>
        </div>
      </div>
    );
  }

  if (!draft || !settings) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat pengaturan hotel…
        </div>
      </div>
    );
  }

  const disabled = !mayUpdate || state.saving;
  const nominal =
    draft.serviceMode === "fixed" || draft.serviceMode === "size_nominal";

  return (
    <div className="flex flex-col gap-6">
      {header}

      {!mayUpdate && (
        <Alert variant="info">
          Role Anda hanya bisa melihat pengaturan ini. Mengubahnya perlu izin
          ubah pengaturan layanan.
        </Alert>
      )}
      {state.saveError && <Alert variant="error">{state.saveError}</Alert>}

      <RoomTypesCard mayOpen={can("services", "read")} />

      <HotelDailyStepsCard
        steps={draft.steps}
        onChange={state.updateSteps}
        showWeights={draft.serviceMode !== "none" && draft.split === "by_step"}
        problem={state.errors.steps}
        saveStatus={state.stepsStatus}
        mayUpdate={mayUpdate}
        mayAddToList={can("services", "update")}
        disabled={disabled}
      />

      <div className="flex flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <Card
            title="Komisi"
            description="Berlaku untuk semua layanan hotel. Dihitung per malam dan bertanggal malam itu, jadi adil kalau petugasnya ganti di tengah masa menginap."
          >
            <div className="flex flex-col gap-5">
              <ChoiceCards
                legend="Besar komisi"
                columns={3}
                value={
                  draft.serviceMode === "size_nominal"
                    ? "fixed"
                    : draft.serviceMode
                }
                onChange={(mode) => {
                  // "Nominal per malam" covers both stored modes; the switch below picks one.
                  if (mode === "fixed" && nominal) return;
                  state.update({ serviceMode: mode });
                }}
                options={[
                  {
                    value: "fixed",
                    label: "Nominal per malam",
                    description: "Contoh: Rp 15.000 untuk setiap malam.",
                  },
                  {
                    value: "percentage",
                    label: "Persen dari harga per malam",
                    description: "Contoh: 10% dari harga satu malam.",
                  },
                  {
                    value: "none",
                    label: "Tidak ada komisi",
                    description: "Hotel tidak menghasilkan komisi.",
                  },
                ]}
                disabled={disabled}
              />

              {nominal && (
                <SwitchRow
                  label="Sama untuk semua ukuran hewan"
                  checked={draft.serviceMode === "fixed"}
                  onCheckedChange={(same) =>
                    state.update({
                      serviceMode: same ? "fixed" : "size_nominal",
                    })
                  }
                  disabled={disabled}
                />
              )}

              {draft.serviceMode === "fixed" && (
                <UnitField
                  label="Komisi per malam"
                  value={draft.fixed}
                  onChange={(fixed) => state.update({ fixed })}
                  prefix="Rp"
                  error={state.errors.fixed}
                  disabled={disabled}
                />
              )}
              {draft.serviceMode === "percentage" && (
                <UnitField
                  label="Persen komisi"
                  value={draft.percent}
                  onChange={(percent) => state.update({ percent })}
                  inputMode="decimal"
                  suffix="% dari harga per malam"
                  error={state.errors.percent}
                  disabled={disabled}
                />
              )}
              {draft.serviceMode === "size_nominal" &&
                (state.sizes.length > 0 ? (
                  <SizeNominalTable
                    sizes={state.sizes}
                    ranges={state.sizeRanges}
                    values={draft.sizeNominal}
                    errors={state.errors}
                    onChange={(id, value) =>
                      state.update({
                        sizeNominal: { ...draft.sizeNominal, [id]: value },
                      })
                    }
                    disabled={disabled}
                  />
                ) : (
                  <p className="rounded-lg bg-tint-neutral px-4 py-3 text-sm text-muted">
                    {state.sizesError
                      ? `Daftar ukuran hewan tidak bisa dimuat. ${state.sizesError}`
                      : "Belum ada ukuran hewan yang aktif, jadi belum ada yang bisa diberi nominal."}
                  </p>
                ))}

              {draft.serviceMode !== "none" && (
                <div className="flex flex-col gap-4">
                  <ChoiceCards
                    legend="Siapa yang dapat"
                    value={draft.split}
                    onChange={(split) => state.update({ split })}
                    options={[
                      {
                        value: "night_pic",
                        label: "Satu malam untuk satu orang",
                        description:
                          "Seluruh komisi malam itu untuk PIC hari itu.",
                      },
                      {
                        value: "by_step",
                        label: "Dibagi per kegiatan",
                        description:
                          "Dibagi ke orang yang mencentang tiap tahapan, sesuai bobotnya.",
                      },
                    ]}
                    disabled={disabled}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-tint-neutral px-4 py-3 text-sm text-muted">
                    <span>
                      Porsi bawaan diisi di Kegiatan harian di atas. Tiap
                      layanan hotel bisa mengubah kegiatan dan porsinya sendiri.
                    </span>
                    {mayOpenCatalog && (
                      <Link
                        href={HOTEL_CATALOG_PATH}
                        className="rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        Buka Layanan &amp; Harga →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4 border-t border-border pt-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Komisi add-on
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Hanya add-on yang ditandai menghasilkan komisi, untuk staf
                    yang mencentangnya selesai di checklist.
                  </p>
                </div>
                <ChoiceCards
                  legend="Cara menghitung"
                  columns={3}
                  value={draft.addonMode}
                  onChange={(addonMode) => state.update({ addonMode })}
                  options={[
                    { value: "percentage", label: "Persen dari harga add-on" },
                    { value: "fixed", label: "Nominal per add-on" },
                    { value: "none", label: "Tidak ada komisi add-on" },
                  ]}
                  disabled={disabled}
                />
                {draft.addonMode === "percentage" && (
                  <UnitField
                    label="Persen komisi add-on"
                    value={draft.addonPercent}
                    onChange={(addonPercent) => state.update({ addonPercent })}
                    inputMode="decimal"
                    suffix="% dari harga add-on"
                    error={state.errors.addonPercent}
                    disabled={disabled}
                  />
                )}
                {draft.addonMode === "fixed" && (
                  <UnitField
                    label="Komisi per add-on"
                    value={draft.addonFixed}
                    onChange={(addonFixed) => state.update({ addonFixed })}
                    prefix="Rp"
                    error={state.errors.addonFixed}
                    disabled={disabled}
                  />
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The room types, short — kept on their own page under Pengaturan. */
function RoomTypesCard({ mayOpen }: { mayOpen: boolean }) {
  const { items, loading, error, reload } = useHotelRoomTypes();
  const { branches } = useBranchOptions();
  const total = items.reduce(
    (sum, roomType) => sum + roomType.usableCapacity,
    0,
  );
  const branchName = (id: string) =>
    branches.find((branch) => branch._id === id)?.name ?? "—";

  return (
    <Card
      title="Tipe kamar & kamar"
      description="Tempat hewan tidur: kamar atau kandang bernomor, atau zona dengan batas jumlah hewan. Satu cabang boleh punya keduanya."
      action={
        mayOpen ? (
          <Button asChild size="sm">
            <Link href={HOTEL_ROOM_TYPES_PATH}>Kelola tipe kamar</Link>
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <Alert variant="error">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={reload}
            >
              Muat ulang
            </Button>
          </span>
        </Alert>
      ) : loading && items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner size={16} /> Memuat tipe kamar…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">
          Belum ada tipe kamar.{" "}
          {mayOpen && "Tambah yang pertama lewat Kelola tipe kamar →"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipe kamar</TableHead>
                <TableHead>Cabang</TableHead>
                <TableHead>Kapasitas</TableHead>
                <TableHead className="text-right">Bisa dipakai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((roomType) => (
                <TableRow key={roomType._id}>
                  <TableCell className="font-semibold text-foreground">
                    {roomType.name}
                    {!roomType.isActive && (
                      <span className="ml-1.5 text-xs font-normal text-muted">
                        · nonaktif
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">
                    {branchName(roomType.branchId)}
                  </TableCell>
                  <TableCell className="text-muted">
                    {roomTypeHolds(roomType)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {roomType.usableCapacity} hewan
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">
                  Total bisa dipakai
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {total} hewan
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </Card>
  );
}

/**
 * Nominal per malam with "Sama untuk semua ukuran hewan" off: one row per size,
 * its weight range under the name, as in the mockup.
 */
function SizeNominalTable({
  sizes,
  ranges,
  values,
  errors,
  onChange,
  disabled,
}: {
  sizes: CommissionSize[];
  ranges: Record<string, string>;
  values: Record<string, string>;
  errors: Record<string, string | undefined>;
  onChange: (id: string, value: string) => void;
  disabled: boolean;
}) {
  const invalid = sizes.some((size) => errors[`size.${size.id}`]);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2/5">Ukuran hewan</TableHead>
              <TableHead>Komisi per malam</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sizes.map((size) => {
              const range = ranges[size.id];
              const error = errors[`size.${size.id}`];
              return (
                <TableRow key={size.id}>
                  <TableCell>
                    <span className="block font-semibold text-foreground">
                      {size.label}
                      {size.retired && (
                        <span className="font-normal text-muted">
                          {" "}
                          (nonaktif)
                        </span>
                      )}
                    </span>
                    {range && range !== "—" && (
                      <span className="block text-xs text-muted tabular-nums">
                        {range}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">
                        Rp
                      </span>
                      <Input
                        aria-label={`Komisi per malam, ${size.label}`}
                        value={values[size.id] ?? "0"}
                        onChange={(event) =>
                          onChange(size.id, event.target.value)
                        }
                        inputMode="numeric"
                        disabled={disabled}
                        className={cn(
                          "h-11 pl-10 text-right tabular-nums",
                          error && "border-danger focus-visible:ring-danger/40",
                        )}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {invalid && (
        <p className="text-xs text-danger">
          Isi nominal rupiah yang benar untuk tiap ukuran.
        </p>
      )}
    </div>
  );
}
