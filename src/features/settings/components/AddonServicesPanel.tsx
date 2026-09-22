"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Plus, X } from "lucide-react";

import { Alert, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DraftSaveBar } from "@/features/grooming/components/DraftSaveBar";
import { serviceEditPath } from "@/features/grooming/serviceDisplay";
import {
  durationValue,
  priceDigits,
  priceText,
} from "@/features/grooming/serviceVariantDraft";
import { Can, usePermissions } from "@/features/permissions";
// Deep, not the barrel — the same reason VariantOptionFormDialog gives.
import { ServiceFormLink } from "@/features/services/components/ServiceFormLink";
import { ADDON_FORM_ORIGIN } from "@/features/services/formOrigin";
import {
  formatDurationRange,
  serviceDurationBounds,
} from "@/features/services/format";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import { SERVICE_KIND_LABELS, SERVICE_KINDS } from "@/types/api";
import type { Service, ServiceKind, ServiceStep, UpdateServiceInput } from "@/types/api";

import type { UseAddonServiceListResult } from "../hooks/useAddonServiceList";
import { byStepOrder } from "../serviceSteps";

/** The service form for an add-on — no Jenis layanan field, saved as `addon`. */
/*
  The form's one plain address (22 September 2026 — it was `?jenis=addon`);
  that the new service is an add-on travels in the tab (`ADDON_FORM_ORIGIN`).
*/
const NEW_SERVICE_PATH = "/dashboard/master/layanan/new";

/** One row as the boxes hold it. Price and duration are the text typed. */
interface RowDraft {
  price: string;
  duration: string;
  /**
   * Its tahapan, by NAME, in order — several since 22 September 2026 (it was
   * one `addonStepId`). The add-on's `sessions`, the same list its form edits.
   */
  steps: string[];
  commissionable: boolean;
  soldSeparately: boolean;
  /** "Dipakai di layanan" — empty is every kind (22 September 2026). */
  kinds: ServiceKind[];
}

/** "Semua layanan", or the kinds ticked, in the product's order. */
function kindsText(kinds: ServiceKind[]): string {
  return kinds.length === 0
    ? "Semua layanan"
    : SERVICE_KINDS.filter((kind) => kinds.includes(kind))
        .map((kind) => SERVICE_KIND_LABELS[kind])
        .join(", ");
}

function sameKinds(a: ServiceKind[], b: ServiceKind[]): boolean {
  return a.length === b.length && a.every((kind) => b.includes(kind));
}

/** Tahapan are an ORDERED list — the same names in another order is a change. */
function sameSteps(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

const stepKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

function seedRow(addon: Service): RowDraft {
  return {
    price: addon.hasVariants ? "" : priceText(addon.price),
    duration:
      addon.hasVariants || addon.durationMin === null
        ? ""
        : String(addon.durationMin),
    steps: addon.sessions ?? [],
    commissionable: addon.commissionable,
    soldSeparately: addon.soldSeparately,
    kinds: addon.serviceKinds ?? [],
  };
}

/** The PATCH a row's draft makes — only what differs from what is stored. */
function rowPatch(addon: Service, row: RowDraft): UpdateServiceInput {
  const seed = seedRow(addon);
  const patch: UpdateServiceInput = {};

  if (!addon.hasVariants) {
    if (row.price !== seed.price) patch.price = priceDigits(row.price) ?? "";
    if (row.duration !== seed.duration) {
      patch.durationMin = durationValue(row.duration) ?? undefined;
    }
  }
  if (!sameSteps(row.steps, seed.steps)) {
    patch.sessions = row.steps;
    /* Bobot are by position — a changed list no longer lines up with them. */
    if ((addon.sessionWeights ?? []).length > 0) patch.sessionWeights = [];
  }
  if (row.commissionable !== seed.commissionable) {
    patch.commissionable = row.commissionable;
  }
  if (row.soldSeparately !== seed.soldSeparately) {
    patch.soldSeparately = row.soldSeparately;
  }
  if (!sameKinds(row.kinds, seed.kinds)) {
    patch.serviceKinds = row.kinds;
  }

  return patch;
}

/**
 * Add-on — one section of Pengaturan › Layanan, from the mockup's table: price,
 * length, tahapan, komisi and "dijual terpisah" edited in place, one ✕ per row.
 *
 * AN ADD-ON IS A SERVICE (`serviceType: "addon"`), in the same collection as
 * the main ones. Every save here is a PATCH /services/:id carrying only what
 * changed on that row. Its tahapan are its `sessions` (several, since
 * 22 September 2026); `commissionable`, `soldSeparately` and `serviceKinds`
 * are settings the server resets on a main service — nothing on this table
 * can reach one.
 *
 * DRAFT + SIMPAN, like Varian & Harga on a service's page: a price typed
 * half-way must not be sent on every keystroke, and several rows are often
 * changed in one sitting. Saved row by row; a row the server refuses keeps its
 * draft and says so, the rows that went through are re-read.
 *
 * TAHAPAN IS AN ID from the add-on's own business line (`servicesteps`). A
 * retired step stays in the list only for the add-on that already holds it — it
 * may be kept, not picked, which is the server's rule too.
 *
 * A VARIANT-PRICED ADD-ON prices and times each variant, so its row shows "per
 * varian" and the range instead of boxes; those are edited on the service.
 */
export function AddonServicesPanel({
  list,
  steps,
  intro,
}: {
  list: UseAddonServiceListResult;
  /** Every line's tahapan, retired and deleted ones included — the hub's load. */
  steps: ServiceStep[];
  intro?: ReactNode;
}) {
  const { addons, attachedCount, loading, error, refetch } = list;
  const { can } = usePermissions();
  const mayUpdate = can("services", "update");

  const [edits, setEdits] = useState<Record<string, RowDraft>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const firstLoad = loading && addons.length === 0;

  const rowOf = (addon: Service) => edits[addon._id] ?? seedRow(addon);

  function change(addon: Service, next: Partial<RowDraft>) {
    setEdits((current) => ({
      ...current,
      [addon._id]: { ...(current[addon._id] ?? seedRow(addon)), ...next },
    }));
  }

  const dirty = addons.filter(
    (addon) =>
      edits[addon._id] !== undefined &&
      Object.keys(rowPatch(addon, edits[addon._id])).length > 0,
  );

  /* The first box that cannot be sent, named — the bar's reason. */
  const problem = (() => {
    for (const addon of dirty) {
      if (addon.hasVariants) continue;
      const row = edits[addon._id];
      if (priceDigits(row.price) === null) {
        return `Harga ${addon.name} belum benar.`;
      }
      if (durationValue(row.duration) === null) {
        return `Durasi ${addon.name} diisi menit antara 1 dan 1440.`;
      }
    }
    return null;
  })();

  async function save() {
    setSaving(true);
    setSaveError(null);

    const failed: string[] = [];
    const kept: Record<string, RowDraft> = {};

    for (const addon of dirty) {
      try {
        await serviceService.update(addon._id, rowPatch(addon, edits[addon._id]));
      } catch (err) {
        kept[addon._id] = edits[addon._id];
        failed.push(
          `${addon.name}: ${err instanceof ApiError ? err.fullMessage : "gagal disimpan"}`,
        );
      }
    }

    setEdits(kept);
    setSaving(false);
    refetch();

    if (failed.length > 0) {
      setSaveError(failed.join(" · "));
    } else {
      swalToast("Add-on tersimpan.");
    }
  }

  function discard() {
    setEdits({});
    setSaveError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await serviceService.remove(pendingDelete._id);
      const removedId = pendingDelete._id;
      setEdits((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== removedId),
        ),
      );
      setPendingDelete(null);
      refetch();
      swalToast("Add-on dihapus.");
    } catch (err) {
      // `fullMessage`: the 409's reason says how many services still carry it.
      setDeleteError(
        err instanceof ApiError ? err.fullMessage : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setDeleting(false);
    }
  }

  /**
   * The tahapan an add-on can tick: every ACTIVE step of the list, then what
   * it already holds that is retired or not on the list — shown ticked, so it
   * can be unticked, and never offered to anybody else.
   */
  function stepChoices(held: string[]) {
    const active = steps
      .filter((step) => step.deletedAt === null && step.isActive)
      .sort(byStepOrder)
      .map((step) => ({ name: step.name, note: null as string | null }));
    const offered = new Set(active.map((choice) => stepKey(choice.name)));
    const kept = held
      .filter((name) => !offered.has(stepKey(name)))
      .map((name) => {
        const step = steps.find(
          (one) => one.deletedAt === null && one.nameKey === stepKey(name),
        );
        return { name, note: step ? "nonaktif" : "belum di daftar" };
      });

    return [...active, ...kept];
  }

  const disabled = !mayUpdate || saving;

  return (
    <div className="flex flex-col gap-5">
      {intro}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Ditempel ke layanan utama dari form layanan itu.
        </p>
        <Can feature="services" action="create">
          <Button asChild>
            <ServiceFormLink href={NEW_SERVICE_PATH} origin={ADDON_FORM_ORIGIN}>
              <Plus className="size-4" aria-hidden />
              Tambah add-on
            </ServiceFormLink>
          </Button>
        </Can>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {saveError && <Alert variant="error">{saveError}</Alert>}

      {dirty.length > 0 && (
        <DraftSaveBar
          problem={problem}
          saving={saving}
          saveLabel="Simpan add-on"
          onDiscard={discard}
          onSave={() => void save()}
        />
      )}

      {firstLoad ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat add-on…
        </div>
      ) : error && addons.length === 0 ? null : addons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-semibold text-foreground">Belum ada add-on.</p>
          <p className="mt-1 text-sm text-muted">
            Buat layanan baru dan pilih jenis Add-on.
          </p>
          <Can feature="services" action="create">
            <Button asChild variant="ghost" className="mt-2">
              <ServiceFormLink href={NEW_SERVICE_PATH} origin={ADDON_FORM_ORIGIN}>
                Tambah yang pertama →
              </ServiceFormLink>
            </Button>
          </Can>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <Table className={loading ? "min-w-215 opacity-60" : "min-w-215"}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20%]">Nama</TableHead>
                <TableHead className="w-[12%]">Harga</TableHead>
                <TableHead className="w-[9%]">Durasi Menit</TableHead>
                <TableHead className="w-[18%]">Tahapan</TableHead>
                <TableHead className="w-[15%]">Dipakai di layanan</TableHead>
                <TableHead className="w-[8%]">Komisi</TableHead>
                <TableHead className="w-[12%]">Dijual terpisah</TableHead>
                <TableHead className="w-[6%]">
                  <span className="sr-only">Hapus</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {addons.map((addon) => {
                const row = rowOf(addon);
                const attached = attachedCount[addon._id] ?? 0;
                const choices = stepChoices(row.steps);
                const stepsText =
                  row.steps.length === 0 ? "— tidak ada —" : row.steps.join(", ");
                const priceBad =
                  !addon.hasVariants && priceDigits(row.price) === null;
                const durationBad =
                  !addon.hasVariants && durationValue(row.duration) === null;

                return (
                  <TableRow key={addon._id}>
                    <TableCell>
                      <Link
                        href={serviceEditPath(addon._id)}
                        className="rounded-sm font-bold text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {addon.name}
                      </Link>
                      <p className="text-xs text-muted">
                        dipakai {attached} layanan
                        {addon.hasVariants && " · per varian"}
                        {!addon.isActive && " · nonaktif"}
                      </p>
                    </TableCell>

                    <TableCell>
                      {addon.hasVariants ? (
                        <span className="rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-warning">
                          per varian
                        </span>
                      ) : (
                        <Input
                          inputMode="numeric"
                          aria-label={`Harga ${addon.name}`}
                          aria-invalid={priceBad || undefined}
                          value={row.price}
                          disabled={disabled}
                          onChange={(event) =>
                            change(addon, { price: event.target.value })
                          }
                          onBlur={() => {
                            const digits = priceDigits(row.price);
                            if (digits !== null && edits[addon._id]) {
                              change(addon, { price: priceText(digits) });
                            }
                          }}
                          className="h-9 w-28 tabular-nums"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {addon.hasVariants ? (
                        <span className="text-sm tabular-nums text-muted">
                          {formatDurationRange(serviceDurationBounds(addon))}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          aria-label={`Durasi ${addon.name} dalam menit`}
                          aria-invalid={durationBad || undefined}
                          value={row.duration}
                          disabled={disabled}
                          onChange={(event) =>
                            change(addon, { duration: event.target.value })
                          }
                          className="h-9 w-20 tabular-nums"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {/*
                        SEVERAL TAHAPAN (22 September 2026) — its commission is
                        split between those turns of a booking, evenly or by the
                        bobot set on the add-on's form. The same menu as
                        "Dipakai di layanan" beside it.
                      */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                            aria-label={`Tahapan ${addon.name}: ${stepsText}`}
                            className="max-w-52 justify-between"
                          >
                            <span className="truncate">{stepsText}</span>
                            <ChevronDown className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-72 min-w-52 overflow-y-auto">
                          <DropdownMenuLabel>Tahapan</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {choices.length === 0 ? (
                            <p className="px-2 py-1.5 text-sm text-muted">
                              Belum ada tahapan di daftar.
                            </p>
                          ) : (
                            choices.map((choice) => {
                              const on = row.steps.some(
                                (name) => stepKey(name) === stepKey(choice.name),
                              );
                              return (
                                <DropdownMenuCheckboxItem
                                  key={choice.name}
                                  checked={on}
                                  // A retired or unlisted one can only be taken off.
                                  disabled={choice.note !== null && !on}
                                  // Stays open, so several can be ticked in one visit.
                                  onSelect={(event) => event.preventDefault()}
                                  onCheckedChange={(next) =>
                                    change(addon, {
                                      steps: next
                                        ? [...row.steps, choice.name]
                                        : row.steps.filter(
                                            (name) => stepKey(name) !== stepKey(choice.name),
                                          ),
                                    })
                                  }
                                >
                                  {choice.name}
                                  {choice.note && ` (${choice.note})`}
                                </DropdownMenuCheckboxItem>
                              );
                            })
                          )}
                          <p className="px-2 py-1.5 text-xs text-muted">
                            Komisinya dibagi ke tahapan yang dicentang — rata,
                            atau menurut bobot di form add-on.
                          </p>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    <TableCell>
                      {/*
                        WHICH MAIN SERVICES OFFER IT (22 September 2026) — only
                        the kinds ticked see it in their Add-on list; none is
                        every kind. A menu, not three switches: the row is dense.
                      */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                            aria-label={`Dipakai di layanan ${addon.name}: ${kindsText(row.kinds)}`}
                            className="max-w-44 justify-between"
                          >
                            <span className="truncate">{kindsText(row.kinds)}</span>
                            <ChevronDown className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-52">
                          <DropdownMenuLabel>Dipakai di layanan</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {SERVICE_KINDS.map((kind) => (
                            <DropdownMenuCheckboxItem
                              key={kind}
                              checked={row.kinds.includes(kind)}
                              // Stays open, so two kinds can be ticked in one visit.
                              onSelect={(event) => event.preventDefault()}
                              onCheckedChange={(on) =>
                                change(addon, {
                                  kinds: on
                                    ? [...row.kinds, kind]
                                    : row.kinds.filter((one) => one !== kind),
                                })
                              }
                            >
                              {SERVICE_KIND_LABELS[kind]}
                            </DropdownMenuCheckboxItem>
                          ))}
                          <p className="px-2 py-1.5 text-xs text-muted">
                            Kosongkan untuk semua layanan.
                          </p>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    <TableCell>
                      <Switch
                        aria-label={`Komisi ${addon.name}`}
                        checked={row.commissionable}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          change(addon, { commissionable: checked })
                        }
                      />
                    </TableCell>

                    <TableCell>
                      <Switch
                        aria-label={`Dijual terpisah ${addon.name}`}
                        checked={row.soldSeparately}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          change(addon, { soldSeparately: checked })
                        }
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      <Can feature="services" action="delete">
                        <Button
                          variant="ghost"
                          className="size-9 text-muted hover:bg-tint-danger hover:text-danger-ink"
                          aria-label={`Hapus ${addon.name}`}
                          disabled={saving}
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(addon);
                          }}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </Can>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Hapus ${pendingDelete.name}?`}
          confirmLabel="Hapus add-on"
          destructive
          busy={deleting}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        >
          {(attachedCount[pendingDelete._id] ?? 0) > 0
            ? `Masih dipakai ${attachedCount[pendingDelete._id]} layanan — lepas dulu dari layanan itu.`
            : "Add-on ini tidak muncul lagi di pilihan. Bisa dipulihkan dari daftar layanan."}
        </ConfirmDialog>
      )}
    </div>
  );
}
