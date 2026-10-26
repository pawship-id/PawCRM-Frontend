"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  Card,
  FilterSelect,
  SelectField,
  Spinner,
  TextField,
  TextareaField,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { membershipService } from "@/services/membership.service";
import type { ChartOfAccount } from "@/types/accounting";
import type {
  PetMembership,
  RecognitionSchedule,
  RefundPreview,
} from "@/types/membership";

import { membershipFailure } from "../errors";
import { KELOLA_REASON_OPTIONS, formatDate, formatRupiah } from "../labels";
import { normalizeMoney } from "../planDraft";
import {
  RECOGNITION_METHOD_COPY,
  RECOGNITION_MODE_COPY,
} from "./RecognitionModeChoice";

const STATUS_LABEL: Record<
  RecognitionSchedule["rows"][number]["status"],
  string
> = {
  posted: "Tercatat",
  planned: "Rencana",
  reversed: "Dibatalkan",
};

const STATUS_TONE: Record<
  RecognitionSchedule["rows"][number]["status"],
  string
> = {
  posted: "bg-tint-success text-success",
  planned: "bg-tint-neutral text-muted",
  reversed: "bg-tint-danger text-danger-ink",
};

/**
 * "PENGAKUAN PENDAPATAN" on a card (PLAN-Membership-Pengakuan-Pendapatan.md):
 * what this card's money has become so far, and — on a straight-line card — the
 * month ends still to come, projected from today's dates and pauses. A row
 * marked Rencana is not posted yet; the month-end job posts it the day after
 * that month ends.
 *
 * AND THE REFUND (Fase 3, BO no. 7: Owner dan Manager). On a deferred card the
 * days of this month are recognised first and what is left is paid back; on an
 * immediate card the unused share is suggested and may be lowered.
 */
export function RecognitionPanel({
  card,
  onChanged,
}: {
  card: PetMembership;
  onChanged: () => void;
}) {
  const [schedule, setSchedule] = useState<RecognitionSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    membershipService
      .recognition(card.id)
      .then((result) => {
        if (active) {
          setSchedule(result);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [card.id, version, card.updatedAt]);

  const canRefund = !card.cancelledAt && !card.awaitingPayment;

  return (
    <Card
      title="Pengakuan pendapatan"
      description="Kapan uang kartu ini dicatat sebagai pendapatan."
    >
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : failed || !schedule ? (
          <p className="text-sm text-muted">
            Jadwal pengakuan tidak bisa dimuat.
          </p>
        ) : schedule.mode === "legacy" ? (
          <p className="text-sm text-muted">
            Kartu ini terjual sebelum pengakuan bertahap ada, atau diterbitkan
            manual. Pendapatannya sudah diakui dengan cara lama.
          </p>
        ) : (
          <ScheduleBody schedule={schedule} />
        )}

        {canRefund ? (
          <Can feature="petMemberships" action="refund">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="max-w-prose text-sm text-muted">
                Pelanggan batal dan minta uang kembali? Refund menutup kartu dan
                mencatat uang keluar dari akun kas atau bank.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRefunding(true)}
              >
                Refund kartu
              </Button>
            </div>
          </Can>
        ) : null}
      </div>

      {/* Mounted only while open, so every opening starts from a fresh preview. */}
      {refunding ? (
        <RefundDialog
          card={card}
          open={refunding}
          onClose={() => setRefunding(false)}
          onDone={() => {
            setRefunding(false);
            setVersion((value) => value + 1);
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ScheduleBody({ schedule }: { schedule: RecognitionSchedule }) {
  const deferred = schedule.mode === "deferred";

  return (
    <>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-tint-brand px-2.5 py-0.5 text-xs font-medium text-primary">
          {
            RECOGNITION_MODE_COPY[schedule.mode as "immediate" | "deferred"]
              .label
          }
        </span>
        {deferred && schedule.method ? (
          <span className="rounded-full bg-tint-neutral px-2.5 py-0.5 text-xs font-medium text-foreground">
            {RECOGNITION_METHOD_COPY[schedule.method].label}
          </span>
        ) : null}
        {schedule.refundedAmount ? (
          <span className="rounded-full bg-tint-warning px-2.5 py-0.5 text-xs font-medium text-warning">
            Direfund {formatRupiah(schedule.refundedAmount)}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Figure
          label="Nilai kartu (DPP)"
          value={formatRupiah(schedule.amount)}
        />
        <Figure
          label="Sudah diakui"
          value={formatRupiah(schedule.recognized)}
        />
        <Figure label="Belum diakui" value={formatRupiah(schedule.remaining)} />
      </dl>

      {deferred && schedule.method === "straight_line" && schedule.perDay ? (
        <p className="text-sm text-muted tabular-nums">
          {schedule.totalDays} hari aktif, sekitar{" "}
          {formatRupiah(schedule.perDay)} per hari. Dicatat tiap akhir bulan
          sesuai jumlah hari yang sudah lewat.
        </p>
      ) : null}

      {deferred && schedule.method === "per_use" && schedule.units?.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {schedule.units.map((unit) => (
            <li
              key={unit.benefitId}
              className="flex justify-between gap-4 tabular-nums"
            >
              <span className="min-w-0 truncate">{unit.label ?? "Jatah"}</span>
              <span className="text-muted">
                {unit.used} dari {unit.qty} dipakai ·{" "}
                {formatRupiah(unit.perUse)} per pemakaian
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {schedule.rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periode</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.rows.map((row, index) => (
                <TableRow
                  key={row.id ?? `${row.key}-${index}`}
                  className={cn(
                    row.status === "reversed" && "text-muted line-through",
                  )}
                >
                  <TableCell>
                    {row.journalEntryId ? (
                      <Link
                        href={`/dashboard/keuangan/journal-entries/${row.journalEntryId}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {row.label ?? row.key}
                      </Link>
                    ) : (
                      (row.label ?? row.key)
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(row.date)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupiah(row.amount)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium no-underline",
                        STATUS_TONE[row.status],
                      )}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted">Belum ada pengakuan yang tercatat.</p>
      )}

      {schedule.revenueAccount || schedule.unearnedAccount ? (
        <p className="text-xs text-muted">
          {deferred && schedule.unearnedAccount
            ? `Dari ${schedule.unearnedAccount} ke `
            : "Ke "}
          {schedule.revenueAccount ?? "Pendapatan Membership"}.
        </p>
      ) : null}
    </>
  );
}

/* ───────────────────────────────────────────────────────── refund */

function RefundDialog({
  card,
  open,
  onClose,
  onDone,
}: {
  card: PetMembership;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      membershipService.refundPreview(card.id),
      chartOfAccountsService.list({
        accountCategory: "cash_bank",
        isActive: true,
      }),
    ])
      .then(([nextPreview, cashAccounts]) => {
        if (!active) return;
        setPreview(nextPreview);
        setAmount(normalizeMoney(nextPreview.suggested));
        setAccounts(cashAccounts.items);
      })
      .catch((err) => {
        if (active)
          swalToast(
            membershipFailure(err, "Data refund tidak bisa dimuat.").toast,
            "error",
            6000,
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, card.id]);

  const amountValue = normalizeMoney(amount);
  const overMax =
    preview &&
    amountValue !== "" &&
    Number(amountValue) > Number(normalizeMoney(preview.max));
  const blocked = !accountId
    ? "Pilih akun kas atau bank"
    : amountValue === "" || Number(amountValue) <= 0
      ? "Isi nominal refund"
      : overMax
        ? `Maksimal ${formatRupiah(preview?.max)}`
        : !reason
          ? "Pilih alasan"
          : null;

  async function save() {
    if (blocked) return;
    setSaving(true);
    try {
      const result = await membershipService.refund(card.id, {
        accountId,
        amount: amountValue,
        reason,
        note: note.trim() || null,
      });
      swalToast(
        `Refund tercatat (${result.transaction.number}). Kartu ${card.number} ditutup.`,
        "success",
      );
      onDone();
    } catch (err) {
      const failure = membershipFailure(err, "Refund gagal. Coba lagi.");
      swalToast(failure.toast, "error", 6000);
      setFieldErrors(failure.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  const deferred = preview?.mode === "deferred";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Refund kartu {card.number}</DialogTitle>
          <DialogDescription>
            Kartu ditutup dan uangnya dicatat keluar dari akun yang dipilih.
          </DialogDescription>
        </DialogHeader>

        {loading || !preview ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-hover p-4 text-sm tabular-nums">
              <dt className="text-muted">Nilai kartu</dt>
              <dd className="text-right">{formatRupiah(preview.paid)}</dd>
              {deferred ? (
                <>
                  <dt className="text-muted">Sudah diakui</dt>
                  <dd className="text-right">
                    {formatRupiah(preview.recognized)}
                  </dd>
                  <dt className="text-muted">Diakui s/d hari ini</dt>
                  <dd className="text-right">
                    {formatRupiah(preview.earnedNow)}
                  </dd>
                </>
              ) : null}
              <dt className="font-semibold">Sisa yang bisa direfund</dt>
              <dd className="text-right font-semibold">
                {formatRupiah(deferred ? preview.max : preview.suggested)}
              </dd>
            </dl>

            <p className="text-sm text-muted">
              {deferred
                ? "Hari yang sudah lewat bulan ini diakui dulu sebagai pendapatan. Sisanya diambil dari Pendapatan Diterima di Muka, lalu jadwal pengakuan berhenti."
                : "Pendapatan kartu ini sudah diakui penuh saat terjual. Refund mengurangi Pendapatan Membership di bulan ini. Nominal disarankan dari sisa masa aktif atau sisa jatah, dan boleh diturunkan."}
            </p>

            <FilterSelect
              layout="form"
              label="Akun kas / bank"
              ariaLabel="Pilih akun kas atau bank"
              value={accountId}
              options={accounts.map((account) => ({
                value: account._id,
                label: `${account.code} — ${account.name}`,
              }))}
              active={false}
              placeholder="Pilih akun"
              searchable
              disabled={saving}
              onChange={setAccountId}
              error={fieldErrors.accountId}
            />

            <TextField
              label="Nominal refund"
              name="refundAmount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              hint={`Maksimal ${formatRupiah(preview.max)}`}
              error={
                fieldErrors.amount ??
                (overMax ? `Maksimal ${formatRupiah(preview.max)}` : undefined)
              }
              disabled={saving}
            />

            <SelectField
              label="Alasan"
              required
              value={reason}
              onChange={setReason}
              options={KELOLA_REASON_OPTIONS}
              placeholder="Pilih alasan"
              error={fieldErrors.reason}
            />

            <TextareaField
              label="Catatan"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Opsional"
            />
          </div>
        )}

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {blocked ?? "Boleh dilakukan: Owner, Manager"}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={save}
              disabled={saving || loading || blocked !== null}
            >
              {saving ? "Menyimpan…" : "Refund dan tutup kartu"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
