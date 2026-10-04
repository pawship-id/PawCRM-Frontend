"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  namedOptions,
  Spinner,
  TextareaField,
  TextField,
  type FilterOption,
} from "@/components";
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
import { useAuth } from "@/features/auth";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { journalEntryService } from "@/services/journalEntry.service";
import type { ChartOfAccount } from "@/types/accounting";
import {
  formatMoney,
  isDecimal,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

import { allocationOptionsFor } from "../allocationLabels";
import { ACCOUNTING_CRUMBS } from "../crumbs";
import { useChartOfAccounts } from "../hooks/useChartOfAccounts";
import { ACCOUNT_CATEGORIES, ACCOUNT_CATEGORY_LABEL } from "../labels";

/**
 * A MANUAL journal entry — the one kind of ledger posting a human writes.
 *
 * LAID OUT AS THE MOCKUP'S "Tambah Jurnal Manual" (21 September 2026): Tanggal
 * and Cabang side by side, Keterangan under them, then the lines as a TABLE —
 * Akun · Detil · Keterangan · Debit · Kredit — with the totals as its last row
 * and a note under it that says whether the two sides meet. A journal is a
 * document with rows, so it takes the Form Transaksi pattern (ui-rules §16).
 *
 * EVERY OTHER ENTRY IS POSTED BY THE MODULE THAT OWNS THE DOCUMENT. A sale, a
 * receipt, an opname: each posts service-to-service and stamps its own source,
 * so nothing typed here can disguise itself as one. `POST /journal-entries`
 * always produces `source.type: "manual"`, enforced twice on the server.
 *
 * NON-CASH ONLY. Kas & Bank accounts are not offered, and the server refuses
 * them too: money that actually moves is recorded through Tambah transaksi,
 * which numbers it as a bukti kas and puts it in the list the shop reconciles
 * against. What is left for this screen is the correction nothing else can
 * express — a reclass, depreciation, the stock-awal fix.
 *
 * THE BRANCH IS ASKED FOR, where it used to be the session's. It is what a
 * Shared-Lokasi cost splits by (standing in for the wallet a cash transaction
 * would have supplied), and what a branch-less Direct rule is pinned to — the
 * mockup's rules 2 and 3, applied by the laba rugi. One field for the whole
 * entry, on purpose: manual entries are reclasses and modal/utang postings,
 * which rarely need two branches at once.
 *
 * ONE SIDE PER LINE, ENFORCED BY THE FIELDS. Typing a debit clears that line's
 * credit and the other way round: the API refuses a line carrying both.
 *
 * NO CASH FLOW CLASSIFICATION IS ASKED FOR, though the API accepts one — it can
 * be patched later without reversing anything, so it is omitted rather than
 * guessed.
 *
 * NOTHING IS EDITABLE AFTER IT POSTS. A wrong entry is corrected by reversing
 * it, and that is said under the lines, before the save rather than after.
 */

/** Backend limits, mirrored so the form refuses what the API would. */
const DESCRIPTION_MAX_LENGTH = 500;
const MEMO_MAX_LENGTH = 255;
const MIN_LINES = 2;
const MAX_LINES = 200;

/**
 * The accounts the stock-awal correction moves value between.
 *
 * Looked up BY CODE rather than hardcoded as ids: the codes are the stable
 * identifiers every posting module resolves against, and a tenant's ids are its
 * own. If either is missing from the chart the shortcut simply does not offer
 * itself — see `presetLines`.
 */
const PRESET_FROM_CODE = "5201";
const PRESET_TO_CODE = "3101";

interface DraftLine {
  /** Local key — the array index is not stable across a removal. */
  key: string;
  accountId: string;
  /**
   * Which Detil Akun of `accountId` this line is posted to, or `""`.
   *
   * ASKED HERE TOO, not only on Transaksi Keuangan: a cost posted to Beban Gaji
   * with no detil lands in the shared bucket of the laba rugi with nothing to
   * say which lini should have carried it.
   */
  allocationId: string;
  debit: string;
  credit: string;
  memo: string;
  /**
   * Which column this line is waiting for, when a shortcut put it here.
   *
   * UI ONLY, and never `memo`: the memo is stored on the ledger line, so an
   * instruction parked there would be read six months later as the accounting
   * note for the posting. Cleared the moment either side carries a value.
   */
  expects?: "debit" | "credit";
}

let lineSeq = 0;
function blankLine(): DraftLine {
  lineSeq += 1;
  return {
    key: `line-${lineSeq}`,
    accountId: "",
    allocationId: "",
    debit: "",
    credit: "",
    memo: "",
  };
}

/** Today in the browser's timezone, as the `date` input wants it. */
function todayValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Sum a column in minor units, skipping what does not parse.
 *
 * Blank and malformed both contribute nothing rather than throwing: the totals
 * are rendered on every keystroke, including the one in the middle of typing
 * "12." — and a total that goes blank while somebody types is one they stop
 * reading.
 */
function sumColumn(values: string[]): bigint {
  let total = 0n;
  for (const value of values) {
    if (value.trim() === "" || !isDecimal(value)) continue;
    total += toMinor(value) ?? 0n;
  }
  return total;
}

/**
 * The account picker's options, GROUPED BY CATEGORY as the mockup draws them.
 *
 * In the reports' category order (ACCOUNT_CATEGORIES), then by code inside a
 * group — the order a chart of accounts is read in. `FilterSelect` draws a
 * heading wherever `group` changes, so the sort IS the grouping.
 */
function groupedAccountOptions(
  accounts: ChartOfAccount[],
): FilterOption<string>[] {
  return [...accounts]
    .sort(
      (a, b) =>
        ACCOUNT_CATEGORIES.indexOf(a.accountCategory) -
          ACCOUNT_CATEGORIES.indexOf(b.accountCategory) ||
        a.code.localeCompare(b.code, "id", { numeric: true }),
    )
    .map((account) => ({
      value: account._id,
      label: `${account.code} · ${account.name}`,
      group: ACCOUNT_CATEGORY_LABEL[account.accountCategory],
    }));
}

export function JournalEntryCreateForm() {
  const router = useRouter();
  const chart = useChartOfAccounts();
  const scope = useBranchScope();
  const { session } = useAuth();

  const [date, setDate] = useState(todayValue);
  const [pickedBranch, setPickedBranch] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [
    blankLine(),
    blankLine(),
  ]);

  /** Whether the shortcut has been used — see the note it puts on screen. */
  const [presetApplied, setPresetApplied] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /*
    THE BRANCH STARTS WHERE THE SESSION STANDS, when the user may post there —
    that is the branch they are working in and the one the old form used without
    asking. Otherwise the one branch they have, or nothing: a blank the form
    refuses beats a branch nobody chose.
  */
  const sessionBranch = scope.branches.some(
    (branch) => branch._id === session?.currentBranchId,
  )
    ? (session?.currentBranchId ?? "")
    : "";
  const branchId = pickedBranch || sessionBranch || scope.soleBranch;

  /**
   * Only accounts that can receive a MANUAL posting: active, and not Kas & Bank.
   *
   * Inactive ones are refused by the API after the whole entry was typed, so
   * offering one would be a rejection waiting to happen. Kas & Bank is refused
   * too — see the header — and hiding it here is what makes that a rule people
   * never run into rather than an error they meet at the end.
   */
  const postable = useMemo(
    () =>
      chart.accounts.filter(
        (account) =>
          account.isActive && account.accountCategory !== "cash_bank",
      ),
    [chart.accounts],
  );

  const accountOptions = useMemo(
    () => groupedAccountOptions(postable),
    [postable],
  );

  const byId = chart.byId;

  /*
    THE DETIL COLUMN ONLY WHEN SOMETHING CAN BE MAPPED — CashLinesEditor's rule.
    A column of dashes on every row of a tenant with no Detil Akun set up
    teaches people to ignore the column.
  */
  const anyAccountMapped = postable.some(
    (account) => allocationOptionsFor(account).length > 0,
  );

  const totalDebit = useMemo(
    () => sumColumn(lines.map((line) => line.debit)),
    [lines],
  );
  const totalCredit = useMemo(
    () => sumColumn(lines.map((line) => line.credit)),
    [lines],
  );
  const difference = totalDebit - totalCredit;
  const balanced = difference === 0n && totalDebit > 0n;

  /**
   * The stock-awal correction, prefilled — the case this screen was built for.
   *
   * AMOUNTS ARE LEFT BLANK on purpose. Only the tenant knows what its opening
   * stock was worth, and a number filled in for them is one they would approve
   * without checking. The accounts and the direction are the part that is hard
   * to get right, so those are what the shortcut supplies.
   */
  const presetLines = useMemo(() => {
    const from = postable.find((account) => account.code === PRESET_FROM_CODE);
    const to = postable.find((account) => account.code === PRESET_TO_CODE);
    return from && to ? { from, to } : null;
  }, [postable]);

  function applyPreset() {
    if (!presetLines) return;
    setDescription(
      "Koreksi stok awal — pindah dari Kerugian Persediaan ke Modal",
    );
    setLines([
      {
        ...blankLine(),
        accountId: presetLines.from._id,
        // Memos are LEDGER TEXT: what this line does, for whoever reads the
        // posting later. What the user must do next is `expects`, below.
        memo: "Membatalkan kredit yang salah di Kerugian Persediaan",
        expects: "debit",
      },
      {
        ...blankLine(),
        accountId: presetLines.to._id,
        memo: "Pengakuan stok awal sebagai modal pemilik",
        expects: "credit",
      },
    ]);
    setPresetApplied(true);
    setFieldErrors({});
  }

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        // The hint has done its job once the line carries an amount.
        if (next.debit.trim() !== "" || next.credit.trim() !== "") {
          delete next.expects;
        }
        return next;
      }),
    );
    setFieldErrors({});
  }

  function addLine() {
    if (lines.length >= MAX_LINES) return;
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(key: string) {
    if (lines.length <= MIN_LINES) return;
    setLines((prev) => prev.filter((line) => line.key !== key));
    setFieldErrors({});
  }

  /**
   * Every rule the form owns, as a plain object — no state written.
   *
   * ONE SOURCE FOR TWO JOBS: `handleSubmit` shows these, and the save button
   * reads the same result to decide whether it may be pressed. Written twice,
   * the button would drift from the messages.
   */
  function collectErrors(): Record<string, string> {
    const next: Record<string, string> = {};

    if (date === "") next.date = "Tanggal wajib diisi.";
    else if (date > todayValue())
      next.date = "Tanggal tidak boleh di masa depan.";

    if (!branchId) next.branch = "Pilih cabang.";

    const trimmed = description.trim();
    if (trimmed === "") next.description = "Keterangan wajib diisi.";
    else if (trimmed.length > DESCRIPTION_MAX_LENGTH)
      next.description = `Maksimal ${DESCRIPTION_MAX_LENGTH} karakter.`;

    lines.forEach((line, index) => {
      const position = `line.${line.key}`;
      const row = index + 1;
      const debit = line.debit.trim();
      const credit = line.credit.trim();

      if (line.accountId === "") {
        next[`${position}.account`] = `Akun di baris ${row} belum dipilih.`;
      }
      if (debit !== "" && !isDecimal(debit)) {
        next[`${position}.debit`] = "Gunakan angka.";
      }
      if (credit !== "" && !isDecimal(credit)) {
        next[`${position}.credit`] = "Gunakan angka.";
      }
      if (debit !== "" && credit !== "") {
        next[`${position}.debit`] =
          "Satu baris hanya boleh debit atau kredit, tidak keduanya.";
      }
      if (debit === "" && credit === "") {
        next[`${position}.debit`] = `Isi debit atau kredit di baris ${row}.`;
      }
      if (debit !== "" && isDecimal(debit) && (toMinor(debit) ?? 0n) <= 0n) {
        next[`${position}.debit`] = "Harus lebih besar dari nol.";
      }
      if (credit !== "" && isDecimal(credit) && (toMinor(credit) ?? 0n) <= 0n) {
        next[`${position}.credit`] = "Harus lebih besar dari nol.";
      }
      if (line.memo.length > MEMO_MAX_LENGTH) {
        next[`${position}.memo`] = `Maksimal ${MEMO_MAX_LENGTH} karakter.`;
      }
    });

    if (totalDebit > 0n && difference !== 0n) {
      next.balance = "Debit dan kredit harus sama.";
    }
    if (totalDebit === 0n) {
      next.balance = "Total jurnal harus lebih besar dari nol.";
    }

    return next;
  }

  /** The first complaint, for the action bar's note while the button is off. */
  const blocking = Object.values(collectErrors())[0] ?? null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const errors = collectErrors();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(null);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const entry = await journalEntryService.create({
        date,
        branchId,
        description: description.trim(),
        lines: lines.map((line) => ({
          accountId: line.accountId,
          // Omitted rather than sent as null when nothing was picked: the server
          // defaults it, and an account with no rules has nothing to send.
          ...(line.allocationId ? { allocationId: line.allocationId } : {}),
          // Only the side that carries a value is sent. Both keys default to
          // "0" on the server, so omitting one is how a credit-only line is
          // expressed — not a zero it then has to reject.
          ...(line.debit.trim() !== "" ? { debit: line.debit.trim() } : {}),
          ...(line.credit.trim() !== "" ? { credit: line.credit.trim() } : {}),
          memo: line.memo.trim() === "" ? null : line.memo.trim(),
        })),
      });

      swalToast(`Jurnal manual ${entry.entryNumber} tersimpan.`);
      router.push(`${ACCOUNTING_CRUMBS.journal.href}/${entry._id}`);
    } catch (error) {
      // The server's refusals here are all about the entry as a whole — it does
      // not balance, an account is inactive or Kas & Bank, the branch is out of
      // reach — and each names what to fix. Shown verbatim.
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  if (chart.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat daftar akun…
      </div>
    );
  }

  if (chart.error) {
    return <Alert variant="error">{chart.error}</Alert>;
  }

  const gap = difference < 0n ? -difference : difference;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* The mockup's two header buttons, Batal and Simpan Jurnal. */}
      <FormActionBar
        submitLabel="Simpan jurnal"
        submitting={saving}
        disabled={blocking !== null}
        blockedReason={blocking}
        cancelHref={ACCOUNTING_CRUMBS.journal.href}
      />

      {formError && <Alert variant="error">{formError}</Alert>}

      {/* WHAT THIS SCREEN IS NOT FOR, before the first field — the mockup's
          callout. The picker below already leaves Kas & Bank out; this is the
          sentence that says why, so its absence reads as a rule rather than as
          a missing account. */}
      <div className="rounded-lg border border-primary/20 bg-accent/60 px-4 py-3 text-sm">
        <b className="mb-0.5 block text-primary">
          Untuk penyesuaian non-kas saja
        </b>
        Reklasifikasi, penyusutan, koreksi, dan sejenisnya. Uang yang benar-benar
        berpindah tetap dicatat lewat <b>Tambah transaksi</b> di Kas &amp; Bank —
        daftar akun di sini sengaja tidak menyertakan akun Kas &amp; Bank.
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Tanggal"
              name="date"
              type="date"
              value={date}
              max={todayValue()}
              onChange={(event) => {
                setDate(event.target.value);
                setFieldErrors({});
              }}
              error={fieldErrors.date}
              disabled={saving}
              required
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
              error={fieldErrors.branch}
              onChange={(next) => {
                setPickedBranch(next);
                setFieldErrors({});
              }}
            />
          </div>

          <TextareaField
            label="Keterangan"
            name="description"
            value={description}
            rows={2}
            onChange={(event) => {
              setDescription(event.target.value);
              setFieldErrors({});
            }}
            error={fieldErrors.description}
            placeholder="cth: Penyusutan peralatan grooming bulan September"
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={saving}
            required
          />

          <p className="text-xs text-muted">
            Cabang berlaku untuk seluruh baris. Akun yang biayanya dibagi per
            lokasi memakai cabang ini, karena jurnal manual tidak lewat akun kas
            atau bank mana pun.
          </p>

          {/* Offered only when both accounts exist in this tenant's chart. A
              shortcut that fills in an account somebody does not have is worse
              than no shortcut. */}
          {presetLines && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-accent/60 px-3 py-2.5 text-sm">
              <span className="text-muted">
                Mengoreksi stok awal yang terlanjur masuk sebagai kerugian?
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={applyPreset}
                disabled={saving}
              >
                Isi contohnya
              </Button>
            </div>
          )}

          {/* The two things the accounts alone do not say: the amount comes
              from the adjustment's own entry, and the date should match it so
              the two land in one period and cancel. */}
          {presetApplied && (
            <div className="rounded-lg border-l-[3px] border-primary bg-accent/60 px-4 py-3 text-sm">
              <b className="mb-1 block">Dua hal sebelum menyimpan</b>
              <ul className="ml-4 list-disc space-y-1 text-muted">
                <li>
                  <b>Nominalnya</b> ambil dari jurnal penyesuaiannya, jangan
                  dihitung ulang. Cari di Jurnal dengan keterangan{" "}
                  <b>Stock adjustment</b> — angka pada baris Kerugian Persediaan
                  itulah yang dipindah.
                </li>
                <li>
                  <b>Tanggalnya</b> samakan dengan penyesuaian tersebut. Kalau
                  beda bulan, laba bulan itu tetap kelebihan dan bulan ini jadi
                  kekurangan — dua-duanya salah walau setahun nettonya benar.
                </li>
              </ul>
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Baris jurnal"
        action={
          lines.length < MAX_LINES && (
            <Button
              type="button"
              variant="secondary"
              onClick={addLine}
              disabled={saving}
            >
              <Plus className="size-4" />
              Tambah baris
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-64">Akun</TableHead>
                  {anyAccountMapped && (
                    <TableHead className="min-w-44">Detil</TableHead>
                  )}
                  <TableHead className="min-w-44">Keterangan</TableHead>
                  <TableHead className="min-w-36 text-right">Debit</TableHead>
                  <TableHead className="min-w-36 text-right">Kredit</TableHead>
                  <TableHead>
                    <span className="sr-only">Hapus</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => {
                  const key = `line.${line.key}`;
                  const row = index + 1;
                  const detilOptions = allocationOptionsFor(
                    byId.get(line.accountId),
                  );
                  const debitError = fieldErrors[`${key}.debit`];
                  const creditError = fieldErrors[`${key}.credit`];
                  // The note under a cell — its error, or the shortcut's hint —
                  // is tied to the input, so a screen reader hears it on focus.
                  const debitNoteId = `${line.key}-debit-note`;
                  const creditNoteId = `${line.key}-credit-note`;
                  const debitNote = Boolean(debitError) || line.expects === "debit";
                  const creditNote =
                    Boolean(creditError) || line.expects === "credit";

                  return (
                    <TableRow
                      key={line.key}
                      className="align-top hover:bg-transparent"
                    >
                      <TableCell>
                        <FilterSelect
                          layout="field"
                          label=""
                          ariaLabel={`Akun baris ${row}`}
                          value={line.accountId}
                          active={false}
                          placeholder="Pilih akun"
                          searchable
                          disabled={saving}
                          options={accountOptions}
                          onChange={(value) => {
                            // The detil is reset with the account — a rule id
                            // belongs to one account — and pre-picked when there
                            // is exactly one, as CashLinesEditor does.
                            const options = allocationOptionsFor(
                              byId.get(value),
                            );

                            patchLine(line.key, {
                              accountId: value,
                              allocationId:
                                options.length === 1 ? options[0].value : "",
                            });
                          }}
                        />
                        {fieldErrors[`${key}.account`] && (
                          <p
                            role="alert"
                            className="mt-1 text-xs font-semibold text-danger"
                          >
                            {fieldErrors[`${key}.account`]}
                          </p>
                        )}
                      </TableCell>

                      {anyAccountMapped && (
                        <TableCell>
                          {detilOptions.length === 0 ? (
                            <span className="mt-4 block text-sm text-muted">
                              —
                            </span>
                          ) : (
                            <FilterSelect
                              layout="field"
                              label=""
                              ariaLabel={`Detil akun baris ${row}`}
                              value={line.allocationId}
                              active={false}
                              placeholder="Pilih detil…"
                              disabled={saving}
                              options={detilOptions}
                              onChange={(value) =>
                                patchLine(line.key, { allocationId: value })
                              }
                            />
                          )}
                        </TableCell>
                      )}

                      <TableCell>
                        <Input
                          aria-label={`Keterangan baris ${row}`}
                          value={line.memo}
                          placeholder="opsional"
                          maxLength={MEMO_MAX_LENGTH}
                          disabled={saving}
                          className="mt-1.5 h-10"
                          onChange={(event) =>
                            patchLine(line.key, { memo: event.target.value })
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          aria-label={`Debit baris ${row}`}
                          inputMode="decimal"
                          placeholder="0"
                          value={line.debit}
                          disabled={saving}
                          aria-invalid={Boolean(debitError) || undefined}
                          aria-describedby={debitNote ? debitNoteId : undefined}
                          className="mt-1.5 h-10 text-right tabular-nums"
                          // Filling one side clears the other: the API refuses a
                          // line carrying both, so the form never assembles one.
                          onChange={(event) =>
                            patchLine(line.key, {
                              debit: event.target.value,
                              credit: "",
                            })
                          }
                        />
                        {debitError ? (
                          <p
                            id={debitNoteId}
                            role="alert"
                            className="mt-1 text-xs font-semibold text-danger"
                          >
                            {debitError}
                          </p>
                        ) : (
                          line.expects === "debit" && (
                            <p id={debitNoteId} className="mt-1 text-xs text-muted">
                              Isi di sini — sama dengan baris berikutnya.
                            </p>
                          )
                        )}
                      </TableCell>

                      <TableCell>
                        <Input
                          aria-label={`Kredit baris ${row}`}
                          inputMode="decimal"
                          placeholder="0"
                          value={line.credit}
                          disabled={saving}
                          aria-invalid={Boolean(creditError) || undefined}
                          aria-describedby={
                            creditNote ? creditNoteId : undefined
                          }
                          className="mt-1.5 h-10 text-right tabular-nums"
                          onChange={(event) =>
                            patchLine(line.key, {
                              credit: event.target.value,
                              debit: "",
                            })
                          }
                        />
                        {creditError ? (
                          <p
                            id={creditNoteId}
                            role="alert"
                            className="mt-1 text-xs font-semibold text-danger"
                          >
                            {creditError}
                          </p>
                        ) : (
                          line.expects === "credit" && (
                            <p id={creditNoteId} className="mt-1 text-xs text-muted">
                              Isi di sini — sama dengan baris sebelumnya.
                            </p>
                          )
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {lines.length > MIN_LINES && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1.5 size-10"
                            aria-label={`Hapus baris ${row}`}
                            disabled={saving}
                            onClick={() => removeLine(line.key)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {/* The totals are the table's last row, each under its own
                  column — the mockup's tfoot, and CashLinesEditor's. */}
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={anyAccountMapped ? 3 : 2}
                    className="text-right text-xs font-bold tracking-wide text-muted uppercase"
                  >
                    Total
                  </TableCell>
                  <TableCell className="text-right text-base font-bold tabular-nums">
                    {formatMoney(toDecimalString(totalDebit))}
                  </TableCell>
                  <TableCell className="text-right text-base font-bold tabular-nums">
                    {formatMoney(toDecimalString(totalCredit))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* THE INVARIANT, LIVE — the same comparison the server refuses on,
              said in a sentence under the totals it compares. */}
          <div
            role="status"
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              balanced
                ? "border-success/30 bg-tint-success"
                : "border-secondary/40 bg-secondary/15 text-secondary-foreground",
            )}
          >
            {balanced ? (
              <>
                <b className="mb-0.5 block text-success">✓ Seimbang</b>
                Total debit dan kredit sudah sama,{" "}
                {formatMoney(toDecimalString(totalDebit))}.
              </>
            ) : (
              <>
                <b className="mb-0.5 block">Belum seimbang</b>
                Selisih {formatMoney(toDecimalString(gap))} — isi Debit dan
                Kredit di semua baris sampai totalnya sama sebelum bisa
                disimpan.
              </>
            )}
          </div>

          <p className="text-xs text-muted">
            Jurnal yang sudah tersimpan <b>tidak bisa diubah atau dihapus</b>.
            Kalau salah, koreksinya dengan jurnal pembalik — sehingga kesalahan
            dan perbaikannya sama-sama tetap terlihat.
          </p>
        </div>
      </Card>
    </form>
  );
}
