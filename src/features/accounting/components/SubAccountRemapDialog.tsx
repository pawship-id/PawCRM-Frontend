"use client";

import { useState } from "react";

import { Alert } from "@/components";
import { FilterDateRange, type DatePreset } from "@/components/filters/FilterDateRange";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { subAccountService } from "@/services/subAccount.service";
import type {
  RemapPeriod,
  RemapRule,
  RemapSummary,
  SubAccount,
} from "@/types/accounting";
import { branchModeOf } from "@/types/accounting";
import { formatMoney } from "@/utils/decimal";

import { ALLOCATION_TYPE_LABEL } from "../allocationLabels";

type Choice = "new" | "old";

/**
 * "Terapkan ke data lama" (Sub-Akun-Implementation-Plan §14, Tahap 2b).
 *
 * TWO WAYS IN, ONE DIALOG.
 *   - `mode="save"`: somebody edited the line / branch / type of an EXISTING sub
 *     akun and pressed Simpan. Nothing is saved yet: the choice is "Hanya
 *     transaksi baru" (default — save the rule, done) or "Terapkan juga ke data
 *     lama". The second needs `chartOfAccounts:remapHistory`; without it the
 *     option is disabled, "Perlu izin khusus".
 *   - `mode="standalone"`: the row action, for the sub akun's CURRENT rule.
 *     Straight to the date range.
 *
 * ORDER OF OPERATIONS, as the API plan fixes it: SHOW the preview first
 * (computed against the PROPOSED rule — nothing saved), and only on "Terapkan"
 * PATCH the rule (`onPersist`), then `apply` against the now-current rule with
 * the numbers the user saw as `expected`. A 409 means the data moved since the
 * preview: the fresh numbers replace the old ones and the user confirms again
 * (the rule is NOT saved twice). An `apply` that fails after the PATCH leaves the
 * rule saved and closes — the row action is the retry.
 */
export function SubAccountRemapDialog({
  accountId,
  sub,
  mode,
  proposedRule,
  canRemap,
  onPersist,
  onDone,
  onCancel,
}: {
  accountId: string;
  /** The sub akun as saved. */
  sub: SubAccount;
  mode: "save" | "standalone";
  /** `save` only: the rule the edit would give it. */
  proposedRule?: NonNullable<RemapPeriod["rule"]>;
  canRemap: boolean;
  /** `save` only: saves the edit (PATCH + its own toast). Throws on failure. */
  onPersist?: () => Promise<void>;
  /** The flow ended (saved or applied) — the panel refreshes and closes. */
  onDone: () => void;
  /** Closed with nothing changed. */
  onCancel: () => void;
}) {
  const standalone = mode === "standalone";
  const [choice, setChoice] = useState<Choice>(standalone ? "old" : "new");
  const [range, setRange] = useState({ from: "", to: "" });
  const [summary, setSummary] = useState<RemapSummary | null>(null);
  const [stale, setStale] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rule = standalone ? undefined : proposedRule;
  const wantsOld = choice === "old";
  const rangeReady = range.from !== "" && range.to !== "";

  function changeRange(next: { from: string; to: string }) {
    setRange(next);
    setSummary(null);
    setStale(false);
    setError(null);
  }

  function close() {
    // The rule may already be saved (a 409 left the dialog open): then closing
    // is the end of the flow, not a cancel.
    if (persisted) onDone();
    else onCancel();
  }

  async function saveOnly() {
    if (!onPersist) return;
    setWorking(true);
    try {
      await onPersist();
      onDone();
    } catch (caught) {
      toastError(caught, "Gagal menyimpan sub akun. Coba lagi.");
    } finally {
      setWorking(false);
    }
  }

  async function showPreview() {
    if (!rangeReady) return;
    setWorking(true);
    setError(null);
    try {
      setSummary(
        await subAccountService.remapPreview(accountId, sub._id, {
          dateFrom: range.from,
          dateTo: range.to,
          ...(rule ? { rule } : {}),
        }),
      );
      setStale(false);
    } catch (caught) {
      toastError(caught, "Gagal menghitung pratinjau. Coba lagi.");
    } finally {
      setWorking(false);
    }
  }

  async function confirm() {
    if (!summary) return;
    setWorking(true);
    setError(null);

    try {
      // 1. the rule (once), 2. apply it to the old data.
      if (!standalone && !persisted && onPersist) {
        await onPersist();
        setPersisted(true);
      }
    } catch (caught) {
      toastError(caught, "Gagal menyimpan sub akun. Coba lagi.");
      setWorking(false);
      return;
    }

    try {
      const result = await subAccountService.remapApply(accountId, sub._id, {
        dateFrom: range.from,
        dateTo: range.to,
        expected: { lines: summary.lines, amount: summary.amount },
      });
      swalToast(
        result.lines > 0
          ? `${result.lines} baris jurnal (${result.entries} transaksi) dipindahkan ke aturan baru.`
          : "Tidak ada baris yang perlu dipindahkan.",
      );
      onDone();
    } catch (caught) {
      const fresh = freshNumbers(caught);
      if (fresh) {
        // The data moved since the preview: show the new numbers, ask again.
        setSummary(fresh);
        setStale(true);
      } else {
        toastError(
          caught,
          "Aturan sudah tersimpan, tetapi data lama belum dipindahkan. Ulangi lewat “Terapkan ke data lama…” di baris sub akun.",
        );
        onDone();
      }
    } finally {
      setWorking(false);
    }
  }

  const showOldSection = standalone || wantsOld;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) close();
      }}
    >
      <DialogContent className="sm:max-w-2xl" showCloseButton={!working}>
        <DialogHeader>
          <DialogTitle>
            {standalone
              ? `Terapkan ke data lama — ${sub.code}`
              : `Simpan perubahan ${sub.code}`}
          </DialogTitle>
          <DialogDescription>
            {standalone
              ? `Pindahkan transaksi lama ${sub.name} ke aturan yang berlaku sekarang.`
              : "Pilih apakah perubahan pemetaan ini juga berlaku untuk transaksi yang sudah tercatat."}
          </DialogDescription>
        </DialogHeader>

        {!standalone && (
          <RadioGroup
            value={choice}
            onValueChange={(value) => {
              setChoice(value as Choice);
              setError(null);
            }}
            disabled={working}
            aria-label="Cakupan perubahan"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="new" id="remap-new" className="mt-0.5" />
              <Label htmlFor="remap-new" className="flex flex-col items-start gap-0.5">
                <span>Hanya transaksi baru (default)</span>
                <span className="text-xs font-normal text-muted">
                  Transaksi lama tetap memakai aturan saat dicatat.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem
                value="old"
                id="remap-old"
                className="mt-0.5"
                disabled={!canRemap}
              />
              <Label
                htmlFor="remap-old"
                className="flex flex-col items-start gap-0.5"
              >
                <span>Terapkan juga ke data lama</span>
                <span className="text-xs font-normal text-muted">
                  {canRemap
                    ? "Pilih rentang tanggal; angkanya ditampilkan dulu sebelum dipindahkan."
                    : "Perlu izin khusus"}
                </span>
              </Label>
            </div>
          </RadioGroup>
        )}

        {showOldSection && (
          <div className="flex flex-col gap-3">
            <FilterDateRange
              layout="field"
              label="Rentang tanggal"
              ariaLabel="Rentang tanggal"
              from={range.from}
              to={range.to}
              presets={remapPresets()}
              disabled={working}
              onApply={changeRange}
              className="sm:col-span-1"
            />

            {!summary && (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={working || !rangeReady}
                  onClick={showPreview}
                >
                  Lihat pratinjau
                </Button>
              </div>
            )}

            {error && <Alert variant="error">{error}</Alert>}

            {summary && <Preview summary={summary} stale={stale} />}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={working} onClick={close}>
            {persisted ? "Tutup" : "Batal"}
          </Button>
          {showOldSection ? (
            <Button
              disabled={working || !summary || summary.lines === 0}
              onClick={confirm}
            >
              Terapkan
            </Button>
          ) : (
            <Button disabled={working} onClick={saveOnly}>
              Simpan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function toastError(caught: unknown, fallback: string) {
    void swalToast(
      caught instanceof ApiError ? caught.fullMessage : fallback,
      "error",
      6000,
    );
  }
}

function Preview({ summary, stale }: { summary: RemapSummary; stale: boolean }) {
  return (
    <div className="flex flex-col gap-3" data-testid="remap-preview">
      {stale && (
        <Alert variant="warning">
          Data berubah sejak pratinjau tadi. Periksa angka terbaru di bawah, lalu
          tekan Terapkan lagi.
        </Alert>
      )}

      {summary.lines === 0 ? (
        <p className="text-sm text-muted">
          Tidak ada baris jurnal yang perlu dipindahkan pada rentang ini.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium">
            {summary.lines} baris jurnal ({summary.entries} transaksi), total{" "}
            {formatMoney(summary.amount)} akan pindah
          </p>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dari</TableHead>
                  <TableHead>Ke</TableHead>
                  <TableHead className="text-right">Baris</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.changes.map((change, index) => (
                  <TableRow key={index}>
                    <TableCell className="px-4 py-2 text-sm">
                      {ruleLabel(change.from)}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-sm">
                      {ruleLabel(change.to)}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right text-sm tabular-nums">
                      {change.lines}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right text-sm tabular-nums">
                      {formatMoney(change.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {summary.includesReversalPairs > 0 && (
            <p className="text-xs text-muted">
              Termasuk {summary.includesReversalPairs} transaksi pasangan
              pembalikan di luar rentang tanggal; keduanya dipindahkan bersama
              supaya tetap saling meniadakan.
            </p>
          )}

          <Alert variant="warning">Laporan periode ini akan ikut berubah.</Alert>
        </>
      )}
    </div>
  );
}

/** "Grooming · Pusat", "Grooming · Cabang transaksi", "Grooming · Semua cabang", "Shared-Overall". */
function ruleLabel(rule: RemapRule): string {
  if (rule.allocationType !== "direct") {
    return ALLOCATION_TYPE_LABEL[rule.allocationType];
  }

  const mode = branchModeOf(rule);
  const where =
    mode === "pinned"
      ? (rule.branchName ?? "—")
      : mode === "transaction"
        ? "Cabang transaksi"
        : "Semua cabang";

  return `${rule.businessLineName ?? "—"} · ${where}`;
}

function freshNumbers(caught: unknown): RemapSummary | null {
  if (!(caught instanceof ApiError) || caught.status !== 409) return null;
  const current = (caught.data as { current?: RemapSummary } | undefined)?.current;
  return current && typeof current.lines === "number" ? current : null;
}

function iso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Bulan lalu / 3 bulan terakhir / Tahun ini — the manual inputs do the rest. */
function remapPresets(): DatePreset[] {
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return [
    {
      label: "Bulan lalu",
      from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
    },
    { label: "3 bulan terakhir", from: iso(threeMonthsAgo), to: iso(today) },
    {
      label: "Tahun ini",
      from: iso(new Date(today.getFullYear(), 0, 1)),
      to: iso(today),
    },
  ];
}
