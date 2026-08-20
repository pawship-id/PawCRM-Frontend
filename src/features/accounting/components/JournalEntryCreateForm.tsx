"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import {
  Alert,
  Button,
  Card,
  FilterSelect,
  Spinner,
  TextField,
} from "@/components";
import { Label } from "@/components/ui/label";
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

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { useChartOfAccounts } from "../hooks/useChartOfAccounts";

/**
 * A MANUAL journal entry — the one kind of ledger posting a human writes.
 *
 * EVERY OTHER ENTRY IS POSTED BY THE MODULE THAT OWNS THE DOCUMENT. A sale, a
 * receipt, an opname: each posts service-to-service and stamps its own source,
 * so nothing typed here can disguise itself as one. `POST /journal-entries`
 * always produces `source.type: "manual"`, enforced twice on the server — the
 * schema does not accept `source` and the service overwrites it regardless.
 *
 * WHAT THIS SCREEN IS FOR is the correction nothing else can express: moving a
 * value from the account it landed on to the one it belonged on. Stock, sales
 * and purchases each have a screen that knows their rules; a reclassification
 * has no document behind it, which is exactly why it is typed.
 *
 * THE FORM TEACHES DOUBLE ENTRY RATHER THAN ASSUMING IT. A running Σdebit,
 * Σcredit and the difference between them sit under the lines and update as
 * somebody types, because "does not balance" discovered at submit is a rule
 * learned by rejection. The same three numbers are what the server refuses on,
 * so the panel is not a friendlier restatement of the rule — it is the rule.
 *
 * ONE SIDE PER LINE, ENFORCED BY THE FIELDS. Typing a debit clears that line's
 * credit and the other way round: the API refuses a line carrying both, and a
 * form that lets somebody fill both and then explains the refusal has taught
 * them nothing they could not have been shown.
 *
 * NO CASH FLOW CLASSIFICATION IS ASKED FOR, though the API accepts one. The
 * field labels which section of the cash flow statement an entry belongs to —
 * and no report reads it: Arus Kas still renders ./data/reportFixtures rather
 * than the ledger, so the answer would be filed away unseen.
 *
 * ASKING LATER COSTS NOTHING, which is what settles it. `cashflowType` is one
 * of the five fields PATCH /journal-entries/:id accepts, so an entry can be
 * classified at any point without being reversed or rewritten — there is no
 * backfill to dread, only a patch. And the shape of the question is not settled
 * either: how the report groups its sections is a decision that has not been
 * made, and a value collected against an unbuilt report is a guess somebody
 * would have to re-examine anyway. It is omitted rather than defaulted, so the
 * server stores null and the day the report exists, it says what it needs.
 *
 * NOTHING IS EDITABLE AFTER IT POSTS. A ledger entry is immutable and there is
 * no delete route — a wrong entry is corrected by reversing it, which leaves the
 * error and the correction both visible. That is stated on the form, before the
 * button, rather than discovered afterwards.
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
  debit: string;
  credit: string;
  memo: string;
  /**
   * Which column this line is waiting for, when a shortcut put it here.
   *
   * UI ONLY, and never `memo`: the memo is stored on the ledger line, so an
   * instruction parked there would be read six months later as the accounting
   * note for the posting. The hint belongs on the field somebody is about to
   * type into and nowhere else — it is scaffolding, not a fact about the entry.
   *
   * Cleared the moment either side of the line carries a value: by then the
   * hint is telling somebody to do what they have just done.
   */
  expects?: "debit" | "credit";
}

let lineSeq = 0;
function blankLine(): DraftLine {
  lineSeq += 1;
  return {
    key: `line-${lineSeq}`,
    accountId: "",
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
 * "12." — and a panel that goes blank while somebody types is a panel they stop
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

export function JournalEntryCreateForm() {
  const router = useRouter();
  const chart = useChartOfAccounts();

  const [date, setDate] = useState(todayValue);
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

  /**
   * Only accounts that can actually receive a posting.
   *
   * The API refuses an inactive account by CODE, having already accepted the
   * request — so offering one here would produce a rejection after the whole
   * entry was typed. Parents are deliberately NOT excluded: the ledger permits
   * posting to them, and a picker that hid them would be inventing a rule.
   */
  const postable = useMemo(
    () => chart.accounts.filter((account) => account.isActive),
    [chart.accounts],
  );

  const accountOptions = useMemo(
    () =>
      postable.map((account) => ({
        value: account._id,
        label: `${account.code} · ${account.name}`,
      })),
    [postable],
  );

  const byId = chart.byId;

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
   * ONE SOURCE FOR TWO JOBS, the same shape the stock adjustment form uses:
   * `handleSubmit` shows these, and the save button reads the same result to
   * decide whether it may be pressed. Written twice, the button would drift from
   * the messages and start refusing things the form had no complaint about.
   */
  function collectErrors(): Record<string, string> {
    const next: Record<string, string> = {};

    if (date === "") next.date = "Tanggal wajib diisi.";
    else if (date > todayValue())
      next.date = "Tanggal tidak boleh di masa depan.";

    const trimmed = description.trim();
    if (trimmed === "") next.description = "Keterangan wajib diisi.";
    else if (trimmed.length > DESCRIPTION_MAX_LENGTH)
      next.description = `Maksimal ${DESCRIPTION_MAX_LENGTH} karakter.`;

    lines.forEach((line, index) => {
      const position = `line.${line.key}`;
      const debit = line.debit.trim();
      const credit = line.credit.trim();

      if (line.accountId === "") {
        next[`${position}.account`] = "Pilih akun.";
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
        next[`${position}.debit`] = "Isi debit atau kredit.";
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
      // Index is unused but keeps the callback honest about its own signature.
      void index;
    });

    if (totalDebit > 0n && difference !== 0n) {
      next.balance = "Debit dan kredit harus sama.";
    }
    if (totalDebit === 0n) {
      next.balance = "Total jurnal harus lebih besar dari nol.";
    }

    return next;
  }

  /** The first complaint, for the note under a disabled button. */
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
        description: description.trim(),
        lines: lines.map((line) => ({
          accountId: line.accountId,
          // Only the side that carries a value is sent. Both keys default to
          // "0" on the server, so omitting one is how a credit-only line is
          // expressed — not a zero it then has to reject.
          ...(line.debit.trim() !== "" ? { debit: line.debit.trim() } : {}),
          ...(line.credit.trim() !== "" ? { credit: line.credit.trim() } : {}),
          memo: line.memo.trim() === "" ? null : line.memo.trim(),
        })),
      });

      swalToast(`Jurnal ${entry.entryNumber} tersimpan.`);
      router.push(`${ACCOUNTING_CRUMBS.journal.href}/${entry._id}`);
    } catch (error) {
      // The server's refusals here are all about the entry as a whole — it does
      // not balance, an account is inactive or unknown — and each names the
      // account code or the two totals. Shown verbatim: a paraphrase would drop
      // exactly the part that says what to fix.
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      {/* WHAT A JOURNAL ENTRY IS, before the first field rather than in a help
          page. Somebody reaching this screen has been sent here by a correction
          they were told to make, and the two-sided rule is the whole of what
          they need to know to do it. */}
      <div className="rounded-lg border border-secondary/40 bg-secondary/15 px-4 py-3 text-sm text-secondary-foreground">
        <b>Jurnal selalu punya dua sisi yang jumlahnya sama.</b> Setiap baris
        mengisi salah satu: <b>debit</b> (nilai masuk ke akun itu) atau{" "}
        <b>kredit</b> (nilai keluar dari akun itu). Total debit dan total kredit
        harus sama persis sebelum bisa disimpan — panel di bawah baris
        menghitungnya sambil Anda mengetik.
      </div>

      <Card
        title="Keterangan jurnal"
        description="Tanggal dan keterangan inilah yang muncul di daftar Jurnal Umum dan di laporan."
      >
        <div className="flex flex-col gap-4">
          <div className="sm:max-w-xs">
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
              hint="Tanggal transaksinya, bukan tanggal Anda mengetik. Tidak boleh di masa depan."
              disabled={saving}
              required
            />
          </div>

          <TextField
            label="Keterangan"
            name="description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setFieldErrors({});
            }}
            error={fieldErrors.description}
            hint="Tulis alasannya, bukan cuma apa yang dipindah — enam bulan lagi ini satu-satunya penjelasan yang tersisa."
            placeholder="mis. Koreksi stok awal produk yang terlanjur masuk sebagai kerugian"
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={saving}
            required
          />

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

          {/* THE TWO THINGS THE ACCOUNTS ALONE DO NOT SAY, and both are wrong
              by default rather than merely unstated:

              THE AMOUNT is not a number anybody should retype from memory — it
              is whatever the adjustment actually posted, which is its quantity
              at the cost the ledger valued it at, not the cost typed into the
              form. The entry that holds it is findable, so the instruction is
              to go and read it.

              THE DATE defaults to today, and today is usually the wrong answer
              here. A correction posted in a later month leaves the earlier
              month's profit overstated and the later month's understated —
              both wrong, even though the year nets out. Matching the
              adjustment's date puts the two in one period, where they cancel. */}
          {presetApplied && (
            <div className="rounded-lg border-l-[3px] border-primary bg-accent/60 px-4 py-3 text-sm">
              <b className="mb-1 block">Dua hal sebelum menyimpan</b>
              <ul className="ml-4 list-disc space-y-1 text-muted">
                <li>
                  <b>Nominalnya</b> ambil dari jurnal penyesuaiannya, jangan
                  dihitung ulang. Cari di Jurnal Umum dengan keterangan{" "}
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
        description="Minimal dua baris. Satu baris mengisi debit atau kredit — tidak keduanya."
      >
        <div className="flex flex-col gap-4">
          {lines.map((line, index) => {
            const key = `line.${line.key}`;
            const account = byId.get(line.accountId);

            return (
              <div
                key={line.key}
                className="rounded-lg border border-border p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">
                    Baris {index + 1}
                  </span>
                  {lines.length > MIN_LINES && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeLine(line.key)}
                      disabled={saving}
                      aria-label={`Hapus baris ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                      Hapus
                    </Button>
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <FilterSelect
                      layout="field"
                      label="Akun"
                      ariaLabel={`Akun baris ${index + 1}`}
                      value={line.accountId}
                      active={line.accountId !== ""}
                      placeholder="Pilih akun"
                      searchable
                      options={accountOptions}
                      onChange={(value) =>
                        patchLine(line.key, { accountId: value })
                      }
                    />
                    {fieldErrors[`${key}.account`] && (
                      <p role="alert" className="mt-1.5 text-xs text-danger">
                        {fieldErrors[`${key}.account`]}
                      </p>
                    )}
                    {account && (
                      <p className="mt-1.5 text-xs text-muted">
                        {ACCOUNT_TYPE_LABEL[account.accountType]} · muncul di{" "}
                        {REPORT_OF_TYPE[account.accountType]}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Debit"
                      name={`debit-${line.key}`}
                      inputMode="decimal"
                      value={line.debit}
                      onChange={(event) =>
                        // Filling one side clears the other: the API refuses a
                        // line carrying both, so the form never assembles one.
                        patchLine(line.key, {
                          debit: event.target.value,
                          credit: "",
                        })
                      }
                      error={fieldErrors[`${key}.debit`]}
                      // The shortcut knows which column this line is for. Said
                      // ON the field rather than in the row above it, because a
                      // note that names a column is read once and a hint under
                      // the box is read while typing into it.
                      hint={
                        line.expects === "debit"
                          ? "Isi di sini — nominalnya sama dengan baris berikutnya."
                          : undefined
                      }
                      placeholder="0"
                      className="tabular-nums"
                      disabled={saving}
                    />
                    <TextField
                      label="Kredit"
                      name={`credit-${line.key}`}
                      inputMode="decimal"
                      value={line.credit}
                      onChange={(event) =>
                        patchLine(line.key, {
                          credit: event.target.value,
                          debit: "",
                        })
                      }
                      error={fieldErrors[`${key}.credit`]}
                      hint={
                        line.expects === "credit"
                          ? "Isi di sini — nominalnya sama dengan baris sebelumnya."
                          : undefined
                      }
                      placeholder="0"
                      className="tabular-nums"
                      disabled={saving}
                    />
                  </div>

                  <TextField
                    label="Catatan baris"
                    name={`memo-${line.key}`}
                    value={line.memo}
                    onChange={(event) =>
                      patchLine(line.key, { memo: event.target.value })
                    }
                    error={fieldErrors[`${key}.memo`]}
                    hint="Opsional."
                    maxLength={MEMO_MAX_LENGTH}
                    disabled={saving}
                  />
                </div>
              </div>
            );
          })}

          {lines.length < MAX_LINES && (
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={addLine}
                disabled={saving}
              >
                <Plus className="size-4" />
                Tambah baris
              </Button>
            </div>
          )}

          {/* THE INVARIANT, LIVE. These are the same three numbers the server
              refuses on, so this is the rule itself rather than a friendly
              restatement of it. */}
          <div
            className={cn(
              "rounded-lg px-4 py-3",
              balanced
                ? "bg-tint-success"
                : totalDebit === 0n && totalCredit === 0n
                  ? "bg-accent/60"
                  : "bg-tint-danger",
            )}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1 block">Total debit</Label>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {formatMoney(toDecimalString(totalDebit))}
                </p>
              </div>
              <div>
                <Label className="mb-1 block">Total kredit</Label>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {formatMoney(toDecimalString(totalCredit))}
                </p>
              </div>
              <div>
                <Label className="mb-1 block">Selisih</Label>
                <p
                  className={cn(
                    "text-base font-bold tabular-nums",
                    balanced
                      ? "text-success"
                      : difference === 0n
                        ? "text-muted"
                        : "text-danger",
                  )}
                >
                  {balanced
                    ? "Seimbang"
                    : formatMoney(
                        toDecimalString(
                          difference < 0n ? -difference : difference,
                        ),
                      )}
                </p>
              </div>
            </div>

            {!balanced && (totalDebit > 0n || totalCredit > 0n) && (
              <p className="mt-2.5 text-sm text-danger">
                {difference > 0n
                  ? "Sisi kredit kurang sebesar selisih di atas."
                  : "Sisi debit kurang sebesar selisih di atas."}
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || blocking !== null}>
            {saving ? "Menyimpan…" : "Simpan jurnal"}
          </Button>
        </div>

        {blocking && !saving && (
          <p className="text-xs text-muted">
            Belum bisa disimpan: <b>{blocking}</b>
          </p>
        )}

        <p className="text-xs text-muted">
          Jurnal yang sudah tersimpan <b>tidak bisa diubah atau dihapus</b>.
          Kalau salah, koreksinya dengan membuat jurnal pembalik — sehingga
          kesalahan dan perbaikannya sama-sama tetap terlihat di buku besar.
        </p>
      </div>
    </form>
  );
}

/** Plain-language names for the five classes, for the hint under a picked account. */
const ACCOUNT_TYPE_LABEL: Record<ChartOfAccount["accountType"], string> = {
  asset: "Aset (harta)",
  liability: "Liabilitas (utang)",
  equity: "Ekuitas (modal)",
  income: "Pendapatan",
  expense: "Beban",
};

/**
 * Which report an account lands on.
 *
 * Said out loud because it is the single fact that makes a wrong account
 * visible: picking a beban where an ekuitas belonged is what moves a correction
 * onto the laba rugi, and the class name alone does not say so.
 */
const REPORT_OF_TYPE: Record<ChartOfAccount["accountType"], string> = {
  asset: "Neraca",
  liability: "Neraca",
  equity: "Neraca",
  income: "Laba Rugi",
  expense: "Laba Rugi",
};
