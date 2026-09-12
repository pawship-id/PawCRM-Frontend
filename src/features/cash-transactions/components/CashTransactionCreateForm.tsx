"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  FilterPills,
  FilterSelect,
  FormActionBar,
  SelectField,
  Spinner,
  TextField,
  TextareaField,
  namedOptions,
  type PillOption,
} from "@/components";
import { CASHFLOW_LABEL } from "@/features/accounting/labels";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type { CashflowType } from "@/types/accounting";
import type { CreateCashTransactionInput, PaymentChannel } from "@/types/api";
import { formatMoney, toDecimalString } from "@/utils/decimal";

import { accountsForKind, useLineLookups } from "../hooks/useLineLookups";
import {
  CASH_TRANSACTIONS_HREF,
  cashTransactionHref,
  cashTransactionTitle,
  numberPrefix,
  todayValue,
} from "../labels";
import {
  CashLinesEditor,
  blankLine,
  linesProblem,
  linesTotal,
  toLineInputs,
  type DraftLine,
} from "./CashLinesEditor";

type ManualKind = "expense" | "other_income";

const KIND_OPTIONS: PillOption<ManualKind>[] = [
  { value: "expense", label: "Pengeluaran" },
  { value: "other_income", label: "Pemasukan" },
];

const CASHFLOW_TYPES: CashflowType[] = ["operating", "investing", "financing"];
const CASHFLOW_OPTIONS = CASHFLOW_TYPES.map((value) => ({
  value,
  label: CASHFLOW_LABEL[value],
}));

/**
 * CATAT TRANSAKSI — money that has no invoice behind it: rent, electricity,
 * wages paid outside commission, interest, a sold fixture.
 *
 * FORM TRANSAKSI (§16): the action bar at the head, a two-column header —
 * Tanggal · Cabang, then who and through which channel, then Arus kas and No.
 * referensi, Keterangan closing the header — and the row table of accounts
 * underneath. THE ROWS ARE THE AMOUNT: there is no Jumlah field to disagree
 * with them.
 *
 * WHAT THE PICKERS OFFER IS WHAT THE SERVER ACCEPTS. Channels usable for this
 * direction at this branch; accounts that are active and of the right class
 * (beban for Pengeluaran, pendapatan for Pemasukan). Flipping the toggle clears
 * the chosen accounts, because none of them is valid on the other side.
 *
 * No number field: BKK/BBK or BKM/BBM is drawn by the server from the channel,
 * and the bar's meta says which series it will be.
 */
export function CashTransactionCreateForm() {
  const router = useRouter();
  const scope = useBranchScope();
  const lookups = useLineLookups();

  const [kind, setKind] = useState<ManualKind>("expense");
  const [date, setDate] = useState(todayValue);
  const [pickedBranch, setPickedBranch] = useState("");
  const [channelId, setChannelId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [cashflowType, setCashflowType] = useState<CashflowType>("operating");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine()]);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // One branch is not a choice (useBranchScope).
  const branchId = pickedBranch || scope.soleBranch;
  const direction = kind === "expense" ? "out" : "in";

  useEffect(() => {
    if (!branchId) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChannelsLoading(true);

    paymentChannelService
      .list({ isActive: true, usableFor: direction, branchId, limit: 100 })
      .then((result) => {
        if (active) setChannels(result.items);
      })
      .catch(() => {
        if (active) setChannels([]);
      })
      .finally(() => {
        if (active) setChannelsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branchId, direction]);

  // Derived, not reset in an effect: a channel the new branch or direction does
  // not offer simply stops being the selection.
  const channel = branchId
    ? (channels.find((item) => item._id === channelId) ?? null)
    : null;

  function switchKind(next: ManualKind) {
    if (next === kind) return;
    setKind(next);
    setLines((prev) => prev.map((line) => ({ ...line, accountId: "" })));
  }

  function blockedReason(): string | null {
    if (date === "") return "Tanggal belum diisi";
    if (date > todayValue()) return "Tanggal tidak boleh di masa depan";
    if (!branchId) return "Cabang belum dipilih";
    if (!channel) return "Channel belum dipilih";
    return linesProblem(lines);
  }

  const blocked = blockedReason();
  const total = linesTotal(lines);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || saving || !channel) return;

    setSaving(true);
    setFormError(null);

    const input: CreateCashTransactionInput = {
      kind,
      branchId,
      channelId: channel._id,
      // Today is left to the server, which stamps the time as well as the day.
      ...(date !== todayValue() ? { at: date } : {}),
      ...(partyName.trim() ? { partyName: partyName.trim() } : {}),
      cashflowType,
      ...(ref.trim() ? { ref: ref.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      lines: toLineInputs(lines),
    };

    try {
      const created = await cashTransactionService.create(input);
      swalToast(`Transaksi ${cashTransactionTitle(created)} tersimpan.`);
      router.push(cashTransactionHref(created._id));
    } catch (error) {
      // The refusals name what to fix — an account of the wrong class, a
      // channel not usable here — so they are shown verbatim.
      setFormError(
        error instanceof ApiError
          ? error.fullMessage
          : "Gagal menyimpan transaksi. Coba lagi.",
      );
      setSaving(false);
    }
  }

  const channelOptions = namedOptions(channels);

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <FormActionBar
        title="Transaksi baru"
        meta={
          channel
            ? `No. ${numberPrefix(direction, channel.type)}/… · total ${formatMoney(toDecimalString(total))}`
            : "No. diberikan saat disimpan"
        }
        submitLabel={kind === "expense" ? "Simpan pengeluaran" : "Simpan pemasukan"}
        submitting={saving}
        disabled={blocked !== null}
        blockedReason={blocked}
        cancelHref={CASH_TRANSACTIONS_HREF}
      />

      {formError && <Alert variant="error">{formError}</Alert>}

      <Card>
        <div className="flex flex-col gap-5">
          <FilterPills
            ariaLabel="Jenis transaksi"
            value={kind}
            options={KIND_OPTIONS}
            onChange={switchKind}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Tanggal"
              name="cash-at"
              type="date"
              value={date}
              max={todayValue()}
              required
              disabled={saving}
              error={date > todayValue() ? "Tanggal tidak boleh di masa depan." : undefined}
              onChange={(event) => setDate(event.target.value)}
            />

            <FilterSelect
              layout="form"
              label="Cabang"
              ariaLabel="Cabang"
              value={branchId}
              options={namedOptions(scope.branches)}
              active={false}
              placeholder={scope.loading ? "Memuat cabang…" : "Pilih cabang"}
              required
              disabled={saving}
              onChange={setPickedBranch}
            />

            <TextField
              label="Nama pihak"
              name="cash-party"
              value={partyName}
              maxLength={120}
              disabled={saving}
              hint="Opsional — mis. PLN, pemilik ruko."
              onChange={(event) => setPartyName(event.target.value)}
            />

            <FilterSelect
              layout="form"
              label="Channel"
              ariaLabel="Channel"
              value={channel?._id ?? ""}
              options={channelOptions}
              active={false}
              placeholder={
                channelsLoading
                  ? "Memuat channel…"
                  : kind === "expense"
                    ? "Dibayar dari"
                    : "Diterima di"
              }
              required
              disabled={saving || !branchId}
              disabledHint="Pilih cabang dulu."
              onChange={setChannelId}
            />

            <SelectField
              label="Arus kas"
              value={cashflowType}
              options={CASHFLOW_OPTIONS}
              disabled={saving}
              hint="Kebanyakan pengeluaran toko masuk Operasi."
              onChange={(value) => setCashflowType(value as CashflowType)}
            />

            <TextField
              label="No. referensi"
              name="cash-ref"
              value={ref}
              maxLength={100}
              disabled={saving}
              hint="Opsional — no. transfer atau no. nota."
              onChange={(event) => setRef(event.target.value)}
            />

            <div className="sm:col-span-2">
              <TextareaField
                label="Keterangan"
                name="cash-note"
                value={note}
                rows={3}
                maxLength={500}
                disabled={saving}
                placeholder="mis. Listrik Agustus, cabang Bogor"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={kind === "expense" ? "Untuk apa uangnya keluar" : "Dari mana uangnya masuk"}
        description={
          kind === "expense"
            ? "Satu baris per akun beban. Totalnya adalah jumlah yang keluar dari channel."
            : "Satu baris per akun pendapatan. Totalnya adalah jumlah yang masuk ke channel."
        }
      >
        {lookups.loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <Spinner /> Memuat daftar akun…
          </div>
        ) : lookups.error ? (
          <Alert variant="error">{lookups.error}</Alert>
        ) : (
          <CashLinesEditor
            kind={kind}
            lines={lines}
            onChange={setLines}
            accounts={accountsForKind(lookups.accounts, kind)}
            businessLines={lookups.businessLines}
            disabled={saving}
          />
        )}
      </Card>
    </form>
  );
}
