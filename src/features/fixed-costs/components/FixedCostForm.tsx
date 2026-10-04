"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  SelectField,
  Spinner,
  TextField,
  TextareaField,
  namedOptions,
} from "@/components";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import {
  blankLine,
  CashLinesEditor,
  canAddLine,
  linesProblem,
  linesTotal,
  toLineInputs,
  type DraftLine,
} from "@/features/cash-transactions/components/CashLinesEditor";
import { useLineLookups } from "@/features/cash-transactions/hooks/useLineLookups";
import { cashBankAccountOptions } from "@/features/cash-transactions/hooks/useCashBankAccountOptions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { fixedCostService } from "@/services/fixedCost.service";
import type {
  FixedCost,
  FixedCostInterval,
  FixedCostKind,
} from "@/types/accounting";
import { formatMoney, toDecimalString } from "@/utils/decimal";

import { fixedCostHref, INTERVAL_LABEL } from "../labels";

const INTERVAL_OPTIONS = (
  ["monthly", "weekly", "daily", "yearly"] as FixedCostInterval[]
).map((value) => ({ value, label: INTERVAL_LABEL[value] }));

/** An ISO instant as the day part a `<input type="date">` shows. */
function dateInput(iso: string): string {
  return iso.slice(0, 10);
}

/** A saved schedule's lines, as editable drafts. */
function draftsFrom(fixedCost: FixedCost): DraftLine[] {
  return fixedCost.lines.map((line, index) => ({
    key: `fixed-cost-line-${index}`,
    accountId: line.accountId,
    amount: line.amount,
    businessLineId: line.businessLineId ?? "",
    allocationId: line.allocationId ?? "",
    memo: line.memo ?? "",
  }));
}

/**
 * UBAH BIAYA TETAP — revising the schedule behind a cost.
 *
 * EDIT ONLY. Creating one goes through Tambah transaksi with "Jadikan biaya
 * tetap" switched on (21 September 2026, on request, and the mockup's own
 * shape): a fixed cost IS a transaction somebody also means to repeat, so the
 * two share a form and the switch is the difference.
 *
 * REVISING ONE IS NOT THAT ACT, which is why this screen survived the merge. A
 * revision moves no money — no transaction, no number, no journal entry — and a
 * form that recorded one every time a rent went up would post a payment nobody
 * asked for. The create form's own switch and its "record the first occurrence"
 * half have no meaning here, so they are not on it.
 *
 * EVERYTHING ABOUT THE PLAN MAY MOVE, unlike a cash transaction's edit, which
 * is a separate screen because editing one REVERSES a reported entry and issues
 * a new one. A template has nothing posted to reverse.
 */
export function FixedCostForm({ fixedCost }: { fixedCost: FixedCost }) {
  const router = useRouter();

  const [name, setName] = useState(fixedCost.name);
  const [kind, setKind] = useState<FixedCostKind>(fixedCost.kind);
  const [pickedBranch, setPickedBranch] = useState(fixedCost.branchId);
  const [accountId, setAccountId] = useState(fixedCost.accountId);
  const [interval, setInterval] = useState<FixedCostInterval>(
    fixedCost.interval,
  );
  const [startDate, setStartDate] = useState(dateInput(fixedCost.startDate));
  const [partyName, setPartyName] = useState(fixedCost.partyName ?? "");
  const [note, setNote] = useState(fixedCost.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(draftsFrom(fixedCost));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope = useBranchScope();
  const lookups = useLineLookups();

  // One branch is not a choice — the same rule the transaction form follows.
  const branchId = pickedBranch || scope.soleBranch;

  const cashAccounts = cashBankAccountOptions(lookups.accounts);
  const total = linesTotal(lines);

  /*
    WHAT STOPS SAVE, SAID IN ONE PLACE. `FormActionBar` disables its own button
    and shows this, so nobody hunts a greyed control for the reason — §16.
  */
  const blockedReason =
    name.trim() === ""
      ? "Isi nama biaya tetapnya dulu."
      : branchId === ""
        ? "Pilih cabangnya dulu."
        : accountId === ""
          ? "Pilih akun kas/bank-nya dulu."
          : startDate === ""
            ? "Isi tanggal mulainya dulu."
            : (linesProblem(lines) ?? null);

  async function submit() {
    if (blockedReason) return;

    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      kind,
      branchId,
      accountId,
      interval,
      // A date input gives a local day; the API takes an instant.
      startDate: new Date(`${startDate}T00:00:00.000Z`).toISOString(),
      lines: toLineInputs(lines),
      partyName: partyName.trim() || null,
      note: note.trim() || null,
    };

    // ONLY THE REQUEST IS INSIDE THE `try` — see FixedCostDetail for why: a
    // hiccup announcing a save must never be reported as a failure to save.
    let saved;

    try {
      saved = await fixedCostService.update(fixedCost._id, payload);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Gagal menyimpan biaya tetap. Coba lagi.",
      );
      setSaving(false);
      return;
    }

    swalToast(`${saved.name} tersimpan.`);
    // Back to what was being read: the schedule's own page.
    router.push(fixedCostHref(saved._id));
    router.refresh();
  }

  if (lookups.loading || scope.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat…
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/*
        NO CARD AROUND THE BAR, as Tambah transaksi and Faktur baru have none:
        the page heading already names the document, so the bar is Batal and
        Simpan (§16).
      */}
      <FormActionBar
        submitLabel="Simpan biaya tetap"
        submitting={saving}
        disabled={blockedReason !== null}
        blockedReason={blockedReason}
        cancelHref={fixedCostHref(fixedCost._id)}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        <div className="flex flex-col gap-4">
          {/*
            TIPE FIRST, as the transaction form's own toggle is: it decides
            which accounts the lines below may name, so choosing it late means
            re-choosing everything under it.
          */}
          <div className="flex gap-2">
            {(
              [
                ["other_income", "Uang masuk"],
                ["expense", "Uang keluar"],
              ] as [FixedCostKind, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value);
                  // The chart offered below is a different one, so a line kept
                  // from the old kind would name an account that is not on it.
                  setLines([blankLine()]);
                }}
                className={cn(
                  "h-11 flex-1 rounded-lg border-[1.5px] text-sm font-semibold transition",
                  "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  kind === value
                    ? "border-primary bg-navy-100 text-primary"
                    : "border-border bg-surface text-foreground hover:bg-surface-hover",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <TextField
            label="Nama biaya tetap"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="cth: Sewa toko Pusat"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FilterSelect
              layout="form"
              label="Cabang"
              value={branchId}
              options={namedOptions(scope.branches)}
              active={false}
              placeholder="Pilih cabang"
              required
              onChange={setPickedBranch}
            />
            <FilterSelect
              layout="form"
              label="Akun Kas & Bank"
              value={accountId}
              options={cashAccounts}
              active={false}
              placeholder="Pilih akun"
              searchable
              required
              onChange={setAccountId}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Pengulangan"
              value={interval}
              options={INTERVAL_OPTIONS}
              onChange={(value) => setInterval(value as FixedCostInterval)}
              required
            />
            <TextField
              label="Mulai tanggal"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
              /*
                A PAST DATE IS ALLOWED, and the hint says so. A shop entering a
                rent it has paid since March is stating a fact about March;
                refusing it would force a fiction. The row simply opens with a
                backlog, which is what the list is for.
              */
              hint={
                fixedCost.postedCount > 0
                  ? `Sudah ${fixedCost.postedCount}× dicatat. Menggeser tanggal ini menghitung ulang jatuh tempo berikutnya dari yang sudah tercatat, bukan mengulang dari awal.`
                  : "Boleh tanggal yang sudah lewat — jatuh tempo yang terlewat akan muncul sebagai tunggakan."
              }
            />
          </div>

          {/*
            A TYPED NAME, not a register id. Most of what a standing cost pays
            is nobody the shop keeps a record of — PLN, the landlord, a SaaS
            vendor — and the API takes `partyName` alone for exactly that.
            Wiring the grouped contact picker here would mean resolving an id at
            post time as well, which is the transaction form's job, not the
            schedule's.
          */}
          <TextField
            label={kind === "expense" ? "Penerima" : "Pengirim"}
            value={partyName}
            onChange={(event) => setPartyName(event.target.value)}
            placeholder="cth: Pemilik ruko"
            hint="Kosongkan kalau tidak perlu dicatat."
          />

          <TextareaField
            label="Keterangan"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Dipakai sebagai deskripsi tiap kali dicatat."
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
              Rincian akun
            </h2>
            <span className="text-sm font-semibold tabular-nums">
              Total {formatMoney(toDecimalString(total))}
            </span>
          </div>

          <CashLinesEditor
            kind={kind}
            lines={lines}
            onChange={setLines}
            accounts={lookups.accounts}
            businessLines={lookups.businessLines}
            disabled={saving}
            showAddButton={canAddLine(lines)}
          />
        </div>
      </Card>
    </form>
  );
}
