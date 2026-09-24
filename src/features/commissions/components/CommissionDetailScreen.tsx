"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";

import {
  Alert,
  Breadcrumb,
  Card,
  JournalLink,
  SelectField,
  Spinner,
  TextareaField,
  TextField,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACCOUNTING_CRUMBS } from "@/features/accounting";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { reportService } from "@/services/report.service";
import type {
  CommissionDetail,
  CommissionPayment,
  CommissionRowKey,
  CommissionStatus,
} from "@/types/api";
import { formatMoney, toDecimalString, toMinor } from "@/utils/decimal";

import {
  COMMISSIONS_HREF,
  COMMISSION_STATUS_LABEL,
  formatDay,
  nextStatuses,
} from "../labels";
import { CommissionStatusBadge } from "./CommissionStatusBadge";
import { PayCommissionDialog } from "./PayCommissionDialog";

/**
 * ONE COMMISSION — a booking × groomer — from the mockup's detail page:
 * Ringkasan, Rincian per Tahapan, Nilai Komisi Final and Pembayaran.
 *
 * THE TAHAPAN ARE THE BOOKING'S TURNS, AND THE TWO TABLES ARE THE ARITHMETIC.
 * The first builds the pool — the service (price × rule), then each add-on —
 * and the second divides it: pool × the turn's bobot, × this groomer's bagian.
 * The mockup's "Nilai Tahapan" (price × bobot) and "Rate" columns were dropped
 * on request, 21 September 2026: neither is a step of the sum, so neither
 * explained the figure beside it. The rule is a snapshot on the record, so a
 * rule changed since does not rewrite what is shown here.
 *
 * STATUS MOVES HERE AS IN THE LIST: approve, take the approval back, pay an
 * approved commission. Paying opens the same dialog, and writes one cash
 * transaction and one journal entry.
 */
export function CommissionDetailScreen({ bookingId, groomerUserId }: CommissionRowKey) {
  const { can } = usePermissions();
  const manages = can("journalEntries", "create");

  const [detail, setDetail] = useState<CommissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    reportService
      .commissionDetail({ bookingId, groomerUserId })
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Komisi ini tidak ditemukan."
            : err instanceof ApiError
              ? err.fullMessage
              : "Komisi tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookingId, groomerUserId, nonce]);

  if (loading && !detail) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat komisi…
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">{error ?? "Komisi tidak bisa dimuat."}</Alert>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reload}>
            <RotateCcw className="size-4" />
            Coba lagi
          </Button>
          <Button variant="secondary" asChild>
            <Link href={COMMISSIONS_HREF}>Kembali ke Komisi</Link>
          </Button>
        </div>
      </div>
    );
  }

  const bookingLabel = detail.bookingNumber ?? "Tanpa nomor";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb
            items={[
              ACCOUNTING_CRUMBS.hub,
              { label: "Komisi", href: COMMISSIONS_HREF },
              { label: bookingLabel },
            ]}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-extrabold text-foreground">
              Komisi — {detail.groomerName ?? "Groomer"} · {bookingLabel}
            </h1>
            <CommissionStatusBadge status={detail.status} />
          </div>
        </div>
        <Button variant="secondary" asChild>
          <Link href={COMMISSIONS_HREF}>
            <ArrowLeft className="size-4" />
            Kembali ke Komisi
          </Link>
        </Button>
      </div>

      {detail.reversal && (
        <Alert variant="info">
          Komisi ini dibatalkan
          {detail.reversal.at ? ` pada ${formatDay(detail.reversal.at)}` : ""}
          {detail.reversal.reason ? ` — ${detail.reversal.reason}` : ""}. Nilainya
          tidak dihitung dan tidak bisa dibayar.
        </Alert>
      )}

      <Card title="Ringkasan">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="Staf">{detail.groomerName ?? "—"}</Field>
          <Field label="Cabang">{detail.branchName ?? "—"}</Field>
          <Field label="No. booking">
            <Link
              href={`/dashboard/booking/${detail.bookingId}`}
              className="rounded-md font-semibold tabular-nums text-primary-hover underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {bookingLabel}
            </Link>
            {detail.petName && (
              <span className="text-muted">
                {" "}
                · {detail.petName}
                {detail.serviceName ? ` · ${detail.serviceName}` : ""}
              </span>
            )}
          </Field>
          <Field label="Tanggal booking">
            <span className="tabular-nums">{formatDay(detail.bookingDate)}</span>
          </Field>
          <Field label="Nilai layanan">
            <span className="tabular-nums">{formatMoney(detail.basisAmount)}</span>
          </Field>
          {/*
            THE INVOICE THAT BILLED IT — the other half of what made this
            commission. Absent on commission earned before 21 September 2026,
            which came from a completed booking and has no invoice to name.
          */}
          <Field label="Faktur">
            {detail.invoiceId ? (
              <Link
                href={`/dashboard/sales/${detail.invoiceId}`}
                className="rounded-md tabular-nums text-primary-hover underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {detail.invoiceNumber ?? "Lihat faktur"}
              </Link>
            ) : (
              <span className="text-muted">—</span>
            )}
          </Field>
        </dl>
      </Card>

      <Card title="Rincian per tahapan">
        {/*
          THE POOL FIRST, then how it splits — the order the shop reasons in
          (21 September 2026): the rule takes its share of the service, the
          add-ons add theirs, the tahapan divide that by bobot, and each tahapan
          divides its part among whoever worked it. Every figure below is one
          step of that, so the row can be checked by hand.
        */}
        {detail.pool && <PoolTable pool={detail.pool} basisAmount={detail.basisAmount} />}

        <h3 className="text-base font-bold">Dibagi per tahapan</h3>
        {/*
          THE TWO STEPS, SAID ONCE — and each figure below carries its own
          formula underneath, so "7.800 ini dari mana" is answered on the row.
        */}
        <p className="mb-3 text-sm text-muted">
          {detail.pool
            ? `Total komisi ${formatMoney(detail.pool.total)} dibagi ke tiap tahapan menurut bobotnya, lalu bagian tahapan itu dibagi ke groomer yang mengerjakannya.`
            : "Komisi dibagi ke tiap tahapan menurut bobotnya, lalu ke groomer yang mengerjakannya."}
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tahapan</TableHead>
                <TableHead className="text-right">Bobot</TableHead>
                <TableHead className="text-right">Komisi tahapan</TableHead>
                <TableHead className="text-right">Bagian</TableHead>
                <TableHead className="text-right">Komisi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.stages.map((stage) => (
                <TableRow key={stage.recordId}>
                  <TableCell className="px-4 py-2.5 text-sm">
                    {stage.sessionName ?? "—"}
                    {stage.crewSize !== null && stage.crewSize > 1 && (
                      <p className="text-xs text-muted">Dikerjakan {stage.crewSize} orang</p>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
                    {stage.sharePercent !== null ? formatPercent(stage.sharePercent) : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
                    {stage.stagePool !== null ? formatMoney(stage.stagePool) : "—"}
                    {stage.stagePool !== null &&
                      detail.pool &&
                      stage.sharePercent !== null && (
                        <p className="text-xs text-muted">
                          {/* Its bobot share of what the tahapan share, plus any
                              add-on paid to it whole (22 Sep 2026). */}
                          {formatMoney(detail.pool.shared ?? detail.pool.total)} ×{" "}
                          {formatPercent(stage.sharePercent)}
                          {stage.directAddon && !isZeroMoney(stage.directAddon) &&
                            ` + ${formatMoney(stage.directAddon)} add-on`}
                        </p>
                      )}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
                    {stage.crewSharePercent !== null
                      ? formatPercent(stage.crewSharePercent)
                      : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                    {formatMoney(stage.amount)}
                    {stage.stagePool !== null && stage.crewSharePercent !== null && (
                      <p className="text-xs font-normal text-muted">
                        {formatMoney(stage.stagePool)} × {formatPercent(stage.crewSharePercent)}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {/*
              A PLAIN RULE ABOVE THE TOTAL, not the vendored footer's grey fill —
              that shaded the whole row and read as a disabled band.
            */}
            <TableFooter className="bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={4}
                  className="px-4 py-2.5 text-right text-xs font-semibold tracking-widest text-muted uppercase"
                >
                  Total terhitung
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right text-sm font-bold tabular-nums">
                  {formatMoney(detail.computedAmount)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <FinalAmount detail={detail} manages={manages} onSaved={setDetail} />
      </Card>

      <PaymentCard detail={detail} manages={manages} onChanged={reload} />
    </div>
  );
}

/**
 * NILAI KOMISI FINAL — empty means "what the rule computed"; anything else
 * needs a reason, so a payslip that disagrees with the rule can say why.
 */
function FinalAmount({
  detail,
  manages,
  onSaved,
}: {
  detail: CommissionDetail;
  manages: boolean;
  onSaved: (next: CommissionDetail) => void;
}) {
  const editable =
    manages && (detail.status === "pending" || detail.status === "approved");

  const [amount, setAmount] = useState(
    detail.overridden ? plainAmount(detail.amount) : "",
  );
  const [reason, setReason] = useState(detail.override?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computed = plainAmount(detail.computedAmount);
  const typed = amount.trim();
  const differs = typed !== "" && toMinor(typed) !== toMinor(computed);
  const invalid = typed !== "" && (toMinor(typed) === null || typed.startsWith("-"));

  async function save() {
    if (busy) return;

    if (invalid) {
      setError("Isi angka 0 atau lebih, tanpa titik ribuan.");
      return;
    }

    if (differs && !reason.trim()) {
      setError("Tulis alasan penyesuaiannya dulu.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const next = await reportService.overrideCommission({
        bookingId: detail.bookingId,
        groomerUserId: detail.groomerUserId,
        amount: typed === "" ? null : typed,
        reason: reason.trim() || null,
      });
      onSaved(next);
      setAmount(next.overridden ? plainAmount(next.amount) : "");
      setReason(next.override?.reason ?? "");
      try {
        swalToast(
          next.overridden
            ? "Nilai komisi disesuaikan."
            : "Kembali ke nilai hasil perhitungan.",
        );
      } catch {
        /* The figure above already changed. */
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.fullMessage : "Nilai tidak bisa disimpan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">Nilai komisi final</h3>
        <p className="text-base font-bold tabular-nums">
          {formatMoney(detail.amount)}
          {detail.overridden && (
            <span className="ml-2 text-xs font-normal text-muted">disesuaikan</span>
          )}
        </p>
      </div>

      {detail.overridden && detail.override?.reason && !editable && (
        <p className="text-sm text-muted">Alasan: {detail.override.reason}</p>
      )}

      {editable && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nilai komisi"
              name="commission-override"
              inputMode="decimal"
              value={amount}
              placeholder={`${formatMoney(detail.computedAmount)} (dari perhitungan)`}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
              hint="Kosongkan untuk memakai hasil perhitungan tahapan."
            />
            <TextareaField
              label="Alasan penyesuaian"
              name="commission-override-reason"
              rows={2}
              maxLength={500}
              value={reason}
              placeholder="Wajib diisi kalau nilainya beda dari perhitungan"
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              required={differs}
            />
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <div>
            <Button variant="secondary" disabled={busy} onClick={() => void save()}>
              {busy ? "Menyimpan…" : "Simpan nilai komisi"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * PEMBAYARAN — once paid, the facts of the payment; before that, the mockup's
 * status control with a Terapkan beside it, offering only the moves the Owner
 * allowed.
 */
function PaymentCard({
  detail,
  manages,
  onChanged,
}: {
  detail: CommissionDetail;
  manages: boolean;
  onChanged: () => void;
}) {
  const { can } = usePermissions();
  const options = nextStatuses(detail.status);
  const [target, setTarget] = useState<CommissionStatus>(detail.status);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = { bookingId: detail.bookingId, groomerUserId: detail.groomerUserId };

  async function apply() {
    if (target === detail.status || busy) return;

    if (target === "paid") {
      setPaying(true);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (target === "approved") await reportService.approveCommissions([key]);
      else await reportService.unapproveCommissions([key]);
      onChanged();
      try {
        swalToast(target === "approved" ? "Komisi disetujui." : "Persetujuan dibatalkan.");
      } catch {
        /* The status badge above already moved. */
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.fullMessage : "Status tidak bisa diubah. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  function onPaid(payments: CommissionPayment[]) {
    setPaying(false);
    onChanged();
    try {
      swalToast(
        `Komisi dibayar — ${payments[0]?.number ?? "transaksi"}, jurnal ${payments[0]?.entryNumber ?? "dibuat"}.`,
      );
    } catch {
      /* The payment card below already shows it. */
    }
  }

  return (
    <Card title="Pembayaran">
      {detail.payment ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="Tanggal bayar">
            <span className="tabular-nums">{formatDay(detail.payment.at)}</span>
          </Field>
          <Field label="Akun kas/bank">{detail.payment.cashAccountName ?? "—"}</Field>
          <Field label="No. transaksi">
            <Link
              href={`/dashboard/keuangan/kas-bank/transaksi/${detail.payment.id}`}
              className="rounded-md tabular-nums text-primary-hover underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {detail.payment.number ?? "Lihat transaksi"}
            </Link>
          </Field>
          <Field label="No. jurnal">
            {detail.payment.journalEntryId ? (
              <JournalLink
                id={detail.payment.journalEntryId}
                number={detail.payment.entryNumber}
                linked={can("journalEntries", "read")}
              />
            ) : (
              "—"
            )}
          </Field>
        </dl>
      ) : manages && options.length > 1 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Status"
              value={target}
              onChange={(value) => setTarget(value as CommissionStatus)}
              options={options.map((status) => ({
                value: status,
                label: COMMISSION_STATUS_LABEL[status],
              }))}
              disabled={busy}
              className="min-w-64"
            />
            <Button disabled={busy || target === detail.status} onClick={() => void apply()}>
              {busy ? "Menerapkan…" : "Terapkan"}
            </Button>
          </div>
          <p className="text-sm text-muted">
            {detail.status === "pending"
              ? "Setujui dulu — komisi baru bisa dibayar setelah disetujui."
              : "Pilih Dibayar untuk memilih akun kas/bank; transaksi dan jurnalnya dibuat otomatis."}
          </p>
          {error && <Alert variant="error">{error}</Alert>}
        </div>
      ) : (
        <p className="text-sm text-muted">
          {detail.status === "reversed"
            ? "Komisi yang dibatalkan tidak dibayar."
            : "Belum dibayar."}
        </p>
      )}

      {paying && (
        <PayCommissionDialog
          rows={[detail]}
          onCancel={() => {
            setPaying(false);
            setTarget(detail.status);
          }}
          onPaid={onPaid}
        />
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-widest text-muted uppercase">{label}</dt>
      <dd className="mt-1 font-semibold">{children}</dd>
    </div>
  );
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

/**
 * THE POOL, LINE BY LINE — the service, then each add-on, then the total the
 * tahapan share. Asked for on 21 September 2026: "kasih tau ini layanan apa,
 * komisi dari jasa tsb berapa (harga × komisi layanan), baru bawahnya bathing,
 * styling".
 */
function PoolTable({
  pool,
  basisAmount,
}: {
  pool: NonNullable<CommissionDetail["pool"]>;
  basisAmount: string;
}) {
  const hasAddon = !isZeroMoney(pool.addon);

  return (
    <div className="mb-5 overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Komisi dari</TableHead>
            <TableHead className="text-right">Perhitungan</TableHead>
            <TableHead className="text-right">Komisi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="px-4 py-2.5 text-sm">
              {pool.serviceName ?? "Layanan"}
              <p className="text-xs text-muted">Layanan</p>
            </TableCell>
            <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
              {pool.rateType === "percentage"
                ? `${formatMoney(basisAmount)} × ${formatPercent(pool.rateValue)}`
                : pool.rateType === "size_nominal"
                  ? "Nominal per ukuran hewan"
                  : "Nominal tetap"}
            </TableCell>
            <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
              {formatMoney(pool.service)}
            </TableCell>
          </TableRow>

          {pool.addons.map((addon, index) => (
            <TableRow key={`${addon.name ?? "addon"}-${index}`}>
              <TableCell className="px-4 py-2.5 text-sm">
                {addon.name ?? "Add-on"}
                {/* Paid to its tahapan, not split by the service's bobot (22 Sep 2026). */}
                <p className="text-xs text-muted">
                  {addon.sessionNames?.length
                    ? `Add-on · untuk tahapan ${addon.sessionNames.join(", ")}`
                    : "Add-on"}
                </p>
              </TableCell>
              <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
                {addon.rateType === "percentage"
                  ? `${formatMoney(addon.price)} × ${formatPercent(addon.rateValue)}`
                  : "Nominal tetap per add-on"}
              </TableCell>
              <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                {formatMoney(addon.commission)}
              </TableCell>
            </TableRow>
          ))}

          {/*
            AN OLDER RECORD'S ADD-ONS CANNOT ALWAYS BE NAMED — it kept only the
            total, and today's rule no longer reproduces it. The total alone is
            still true; per-add-on figures would not be.
          */}
          {hasAddon && pool.addons.length === 0 && (
            <TableRow>
              <TableCell className="px-4 py-2.5 text-sm">Add-on</TableCell>
              <TableCell className="px-4 py-2.5 text-right text-sm text-muted">—</TableCell>
              <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                {formatMoney(pool.addon)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        <TableFooter className="bg-transparent">
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={2}
              className="px-4 py-2.5 text-right text-xs font-semibold tracking-widest text-muted uppercase"
            >
              Total komisi
            </TableCell>
            <TableCell className="px-4 py-2.5 text-right text-sm font-bold tabular-nums">
              {formatMoney(pool.total)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function isZeroMoney(value: string): boolean {
  return toMinor(value) === 0n;
}

/** "30000.0000" → "30000", for an input somebody edits. */
function plainAmount(value: string): string {
  const minor = toMinor(value);
  if (minor === null) return value;
  return toDecimalString(minor).replace(/\.?0+$/, "");
}
