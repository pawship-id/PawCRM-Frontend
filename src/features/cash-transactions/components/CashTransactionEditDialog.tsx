"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  FilterSelect,
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
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type {
  CashTransaction,
  PaymentChannel,
  UpdateCashTransactionInput,
} from "@/types/api";
import { isDecimal, toMinor, trimDecimal } from "@/utils/decimal";

import { accountsForKind, useLineLookups } from "../hooks/useLineLookups";
import {
  cashTransactionTitle,
  channelClassOf,
  hasLines,
  kindLabel,
  lockedReason,
  toDateInputValue,
  todayValue,
} from "../labels";
import {
  CashLinesEditor,
  draftLinesFrom,
  linesProblem,
  linesSignature,
  toLineInputs,
  type DraftLine,
} from "./CashLinesEditor";

/** The server's cap on `reason`. */
const REASON_MAX_LENGTH = 200;

/**
 * UBAH — change one transaction in place (D4). SHARED: the detail page opens it
 * with the transaction it holds; the invoice's payment page opens it with only
 * the payment's id (`paymentId` IS the transaction's id) and it loads the rest.
 *
 * WHAT IT SAYS BEFORE ANYTHING IS TYPED: the number stays, and the journal is
 * reversed and posted again. Somebody who expects an edit to rewrite history
 * should learn otherwise here, not from two new rows in Jurnal Umum.
 *
 * THE CHANNEL LIST IS THE SAME CLASS ONLY — kas stays kas, bank stays bank —
 * and only channels usable for this direction at this branch. Crossing kas ↔
 * bank would leave a BKM number on bank money; the server refuses it, and the
 * picker never offers the refusal.
 *
 * Sends only what changed. Server 400/409s stay in the dialog, verbatim.
 */
export function CashTransactionEditDialog({
  open,
  transaction,
  transactionId,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** The transaction, when the caller already holds it. */
  transaction?: CashTransaction | null;
  /** Otherwise its id — loaded each time the dialog opens. */
  transactionId?: string | null;
  onClose: () => void;
  /** Handed the transaction the write returned. */
  onSaved: (updated: CashTransaction) => void;
}) {
  const [loaded, setLoaded] = useState<CashTransaction | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const needsLoad = open && !transaction && Boolean(transactionId);

  useEffect(() => {
    if (!needsLoad || !transactionId) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(null);
    setLoadError(null);

    cashTransactionService
      .getById(transactionId)
      .then((result) => {
        if (active) setLoaded(result);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat transaksi. Coba lagi.",
        );
      });

    return () => {
      active = false;
    };
  }, [needsLoad, transactionId]);

  const target = transaction ?? loaded;
  const wide = target ? hasLines(target.kind) : false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={cn("max-h-[90vh] overflow-y-auto", wide && "sm:max-w-4xl")}
      >
        {target ? (
          <EditForm
            key={`${target._id}-${target.updatedAt}`}
            transaction={target}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Ubah transaksi</DialogTitle>
              <DialogDescription>Memuat data transaksi.</DialogDescription>
            </DialogHeader>
            {loadError ? (
              <Alert variant="error">{loadError}</Alert>
            ) : (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                <Spinner /> Memuat transaksi…
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                Kembali
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: CashTransaction;
  onClose: () => void;
  onSaved: (updated: CashTransaction) => void;
}) {
  const withLines = hasLines(transaction.kind);
  // The server pays exactly what its books say is owed — see CommissionRecapScreen.
  const amountLocked = transaction.kind === "commission_payment";
  const originalDate = toDateInputValue(transaction.at);
  const channelClass = channelClassOf(transaction.channelType);
  const locked = lockedReason(transaction);

  const [date, setDate] = useState(originalDate);
  const [amount, setAmount] = useState(trimDecimal(transaction.amount));
  const [channelId, setChannelId] = useState(transaction.channelId ?? "");
  const [ref, setRef] = useState(transaction.ref ?? "");
  const [note, setNote] = useState(transaction.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    draftLinesFrom(transaction.lines),
  );
  const [reason, setReason] = useState("");
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const lookups = useLineLookups(withLines && !locked);

  useEffect(() => {
    if (locked) return;
    let active = true;

    paymentChannelService
      .list({
        isActive: true,
        usableFor: transaction.direction,
        branchId: transaction.branchId,
        limit: 100,
      })
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
  }, [locked, transaction.direction, transaction.branchId]);

  const channelOptions = useMemo(() => {
    const options = channels
      .filter((channel) => channelClassOf(channel.type) === channelClass)
      .map((channel) => ({ value: channel._id, label: channel.name }));
    // The channel it already uses stays choosable even if since retired —
    // keeping it is not a change.
    if (
      transaction.channelId &&
      !options.some((option) => option.value === transaction.channelId)
    ) {
      options.unshift({
        value: transaction.channelId,
        label: transaction.channelName ?? "Channel saat ini",
      });
    }
    return options;
  }, [channels, channelClass, transaction.channelId, transaction.channelName]);

  if (locked) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Ubah transaksi</DialogTitle>
          <DialogDescription>{cashTransactionTitle(transaction)}</DialogDescription>
        </DialogHeader>
        <Alert variant="info">Transaksi ini tidak bisa diubah. {locked}</Alert>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Kembali
          </Button>
        </DialogFooter>
      </>
    );
  }

  /** Every rule the dialog owns, and the patch it would send — no state written. */
  function build(): { patch: UpdateCashTransactionInput; problem: string | null } {
    const patch: UpdateCashTransactionInput = {};

    if (date === "") return { patch, problem: "Tanggal belum diisi" };
    if (date > todayValue()) {
      return { patch, problem: "Tanggal tidak boleh di masa depan" };
    }
    if (date !== originalDate) patch.at = date;

    if (!withLines && !amountLocked) {
      const trimmed = amount.trim();
      const minor = trimmed !== "" && isDecimal(trimmed) ? toMinor(trimmed) : null;
      if (minor === null || minor <= 0n) {
        return { patch, problem: "Jumlah harus angka lebih dari nol" };
      }
      if (minor !== toMinor(transaction.amount)) patch.amount = trimmed;
    }

    if (!channelId) return { patch, problem: "Channel belum dipilih" };
    if (channelId !== (transaction.channelId ?? "")) patch.channelId = channelId;

    if (ref.trim() !== (transaction.ref ?? "")) patch.ref = ref.trim();
    if (note.trim() !== (transaction.note ?? "")) patch.note = note.trim();

    if (withLines) {
      const problem = linesProblem(lines);
      if (problem) return { patch, problem };
      const inputs = toLineInputs(lines);
      if (linesSignature(inputs) !== linesSignature(transaction.lines ?? [])) {
        patch.lines = inputs;
      }
    }

    if (Object.keys(patch).length === 0) {
      return { patch, problem: "Belum ada yang diubah" };
    }
    if (reason.trim()) patch.reason = reason.trim();

    return { patch, problem: null };
  }

  const { problem } = build();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { patch, problem: blocked } = build();
    if (blocked || saving) return;

    setSaving(true);
    setServerError(null);

    try {
      const updated = await cashTransactionService.update(transaction._id, patch);
      swalToast(`Perubahan ${cashTransactionTitle(updated)} tersimpan.`);
      onSaved(updated);
      onClose();
    } catch (caught) {
      setServerError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Gagal menyimpan perubahan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Ubah transaksi</DialogTitle>
        <DialogDescription>
          {cashTransactionTitle(transaction)} · {kindLabel(transaction.kind)}
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
        Nomor{" "}
        <b className="tabular-nums">{transaction.number ?? "transaksi ini"}</b>{" "}
        tetap sama. Jurnal yang berlaku sekarang <b>dibalik</b>, lalu jurnal baru{" "}
        <b>diposting ulang</b> dengan isi yang baru — keduanya tetap terlihat di
        Jurnal Umum dan di riwayat perubahan.
      </div>

      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Tanggal"
          name="edit-at"
          type="date"
          value={date}
          max={todayValue()}
          required
          disabled={saving}
          onChange={(event) => setDate(event.target.value)}
        />

        {!withLines && (
          <TextField
            label="Jumlah"
            name="edit-amount"
            inputMode="decimal"
            value={amount}
            required
            disabled={saving || amountLocked}
            className="tabular-nums"
            hint={
              amountLocked
                ? "Jumlah komisi dihitung dari pembukuan dan tidak bisa diubah."
                : undefined
            }
            onChange={(event) => setAmount(event.target.value)}
          />
        )}

        <div>
          <FilterSelect
            layout="form"
            label="Channel"
            ariaLabel="Channel"
            value={channelId}
            options={channelOptions}
            active={false}
            placeholder={channelsLoading ? "Memuat channel…" : "Pilih channel"}
            required
            disabled={saving}
            onChange={setChannelId}
          />
          <p className="mt-1.5 text-xs text-muted">
            {channelClass === "cash"
              ? "Hanya channel kas. Pindah ke rekening bank berarti batalkan transaksi ini lalu catat ulang."
              : "Hanya channel bank (transfer, QRIS, EDC, giro). Pindah ke kas berarti batalkan transaksi ini lalu catat ulang."}
          </p>
        </div>

        <TextField
          label="No. referensi"
          name="edit-ref"
          value={ref}
          maxLength={100}
          disabled={saving}
          onChange={(event) => setRef(event.target.value)}
        />

        <div className="sm:col-span-2">
          <TextareaField
            label="Catatan"
            name="edit-note"
            value={note}
            rows={2}
            maxLength={500}
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      {withLines &&
        (lookups.loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted">
            <Spinner /> Memuat daftar akun…
          </div>
        ) : lookups.error ? (
          <Alert variant="error">{lookups.error}</Alert>
        ) : (
          <CashLinesEditor
            kind={transaction.kind as "expense" | "other_income"}
            lines={lines}
            onChange={setLines}
            accounts={accountsForKind(
              lookups.accounts,
              transaction.kind as "expense" | "other_income",
            )}
            businessLines={lookups.businessLines}
            disabled={saving}
          />
        ))}

      <TextareaField
        label="Alasan perubahan"
        name="edit-reason"
        value={reason}
        rows={2}
        maxLength={REASON_MAX_LENGTH}
        disabled={saving}
        hint="Opsional — tersimpan di riwayat perubahan."
        onChange={(event) => setReason(event.target.value)}
      />

      <DialogFooter className="items-center">
        {problem && !saving && (
          <p className="mr-auto text-xs text-muted">
            Belum bisa disimpan: <b className="font-semibold">{problem}</b>
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={saving}
        >
          Kembali
        </Button>
        <Button type="submit" disabled={problem !== null || saving}>
          {saving ? "Menyimpan…" : "Simpan transaksi"}
        </Button>
      </DialogFooter>
    </form>
  );
}
