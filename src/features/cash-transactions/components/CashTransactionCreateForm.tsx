"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
  type FilterOption,
  type PillOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SHARED_LINE_LABEL } from "@/features/accounting";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { fixedCostService } from "@/services/fixedCost.service";
import {
  fixedCostHref,
  INTERVAL_LABEL,
} from "@/features/fixed-costs/labels";
import { cashTypeOf, type FixedCostInterval } from "@/types/accounting";
import type { CreateCashTransactionInput } from "@/types/api";

import {
  cashBankAccountOptions,
  cashBankAccounts,
} from "../hooks/useCashBankAccountOptions";
import {
  OTHER_PARTY,
  parseContactKey,
  useContactOptions,
} from "../hooks/useContactOptions";
import { accountsForKind, useLineLookups } from "../hooks/useLineLookups";
import {
  CASH_TRANSACTIONS_HREF,
  cashTransactionHref,
  cashTransactionTitle,
  numberPrefixForClass,
  todayValue,
} from "../labels";
import {
  CashLinesEditor,
  blankLine,
  canAddLine,
  linesProblem,
  toLineInputs,
  type DraftLine,
} from "./CashLinesEditor";

type ManualKind = "expense" | "other_income";

/**
 * MASUK FIRST, and the words are the mockup's — the same two the Kas & Bank
 * cards above the list are labelled with, so the toggle on the form and the
 * figures it lands in are named the same thing.
 */
const KIND_OPTIONS: PillOption<ManualKind>[] = [
  { value: "other_income", label: "Uang masuk" },
  { value: "expense", label: "Uang keluar" },
];

/**
 * TAMBAH TRANSAKSI — money that has no invoice behind it: rent, electricity,
 * wages paid outside commission, interest, a sold fixture.
 *
 * ADOPTED FROM THE MOCKUP on 20 September 2026 (Keuangan / Kas & Bank /
 * Transaksi / Tambah Transaksi): the Uang masuk / Uang keluar toggle at the head
 * of the card, an Akun Kas/Bank picker in place of the channel one, one Lini
 * Usaha in the header, the Biaya Tetap switch closing it, and Rincian Akun as
 * its own card underneath with "+ Tambah baris" in its header and the total as
 * the row table's last line. THE ROWS ARE THE AMOUNT: there is no Jumlah field
 * to disagree with them.
 *
 * TWO PLACES IT DOES NOT FOLLOW THE MOCKUP, both because §16 of
 * docs/ui-rules.md says otherwise and the rule wins:
 *
 *   No. Transaksi is NOT a field. "A read-only number is not a field somebody
 *   fills in, so it does not get a slot in the grid" — and the page heading
 *   already names the document, so the bar carries no title for it to sit under
 *   either (the Faktur baru precedent, 11 September 2026). What is knowable
 *   before saving is the SERIES, and that is said as a hint under the account
 *   that decides it: BKK for kas out, BBM for bank in.
 *
 *   The grid keeps §16's field order — kapan, di mana, dengan siapa, then the
 *   secondary classification — rather than the mockup's pairing, which only
 *   differs in which two fields share a row.
 *
 * AKUN KAS/BANK, AND NO CHANNEL AT ALL. The picker lists every active account
 * filed under Kas & Bank in Daftar Akun — the same `accountCategory` the table
 * on the page above is built from — and that is what `POST /cash-transactions`
 * now takes. A CHANNEL IS THE CASHIER'S: "QRIS Xendit", "BCA 8730…" are buttons
 * pressed at a till, several of them routinely settle into one account, and a
 * back-office transaction has no till to press them at. The account's own
 * `cashType` decides the BKM/BKK or BBM/BBK series that the channel's type used
 * to decide.
 *
 * WHAT THE PICKERS OFFER IS WHAT THE SERVER ACCEPTS. Active Kas & Bank accounts
 * for the cash side; line accounts that are active and of the right class (beban
 * for Keluar, pendapatan for Masuk). Flipping the toggle clears the chosen line
 * accounts, because none of them is valid on the other side. THE CASH ACCOUNT
 * SURVIVES THE FLIP — an account has no direction, and a bank account both
 * receives and pays.
 *
 * NO ARUS KAS FIELD AND NO NO. REFERENSI — neither is in the mockup, dropped on
 * request. The cash flow statement still needs a section, so every transaction
 * typed here is filed under Operasi, which is what all but a handful of them
 * are; left unsent the entry would carry no section at all and drop out of Arus
 * Kas entirely. One that belongs under Investasi or Pendanaan is re-filed from
 * Jurnal Umum.
 */
const INTERVAL_OPTIONS = (
  ["monthly", "weekly", "daily", "yearly"] as FixedCostInterval[]
).map((value) => ({ value, label: INTERVAL_LABEL[value] }));

export function CashTransactionCreateForm() {
  const router = useRouter();
  const { can } = usePermissions();
  const scope = useBranchScope();
  const lookups = useLineLookups();
  const contacts = useContactOptions();

  const [kind, setKind] = useState<ManualKind>("expense");
  const [date, setDate] = useState(todayValue);
  const [pickedBranch, setPickedBranch] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  /**
   * WHO THE MONEY CAME FROM OR WENT TO — `"customer:abc"`, `OTHER_PARTY`, or
   * `""` for nobody. Two states because the field has two shapes: a row out of
   * one of the three registers, which travels as a type and an id, or a name
   * typed for somebody no register holds.
   */
  const [partyKey, setPartyKey] = useState("");
  const [partyName, setPartyName] = useState("");
  const [businessLineId, setBusinessLineId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine()]);
  /*
    THE SWITCH, AND THE TWO FIELDS IT REVEALS. A schedule needs one thing a
    transaction does not — a NAME — because a transaction is identified by its
    number and a template recurs, so the only stable handle anybody has on it is
    what they called it.
  */
  /*
    OFF, WHICHEVER TAB SOMEBODY CAME FROM.

    `/kas-bank/biaya-tetap/new` was a second route that opened this same form
    with the switch pre-answered; it is gone (21 September 2026, on request).
    One form, one URL, and the switch is the only thing that decides which of
    the two documents gets written — so it starts from the same answer for
    everybody and is never pre-set by where somebody clicked.
  */
  const [recur, setRecur] = useState(false);
  const [recurName, setRecurName] = useState("");
  const [recurInterval, setRecurInterval] =
    useState<FixedCostInterval>("monthly");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // One branch is not a choice (useBranchScope).
  const branchId = pickedBranch || scope.soleBranch;
  const direction = kind === "expense" ? "out" : "in";

  const cashAccountOptions: FilterOption<string>[] = cashBankAccountOptions(
    lookups.accounts,
  );

  // Derived, not held twice: a chart that reloads without the chosen account —
  // retired in Daftar Akun in another tab — simply stops having a selection, and
  // the bar says the field is unanswered.
  const cashAccount =
    cashBankAccounts(lookups.accounts).find(
      (account) => account._id === cashAccountId,
    ) ?? null;

  const lineOptions: FilterOption<string>[] = [
    { value: "", label: SHARED_LINE_LABEL },
    ...namedOptions(lookups.businessLines),
  ];

  function switchKind(next: ManualKind) {
    if (next === kind) return;
    setKind(next);
    setLines((prev) => prev.map((line) => ({ ...line, accountId: "" })));
  }

  /*
    THE HEADER'S LINI USAHA IS A DEFAULT, NOT AN OVERRIDE. It seeds new rows, and
    changing it carries along every row that still agreed with it — a row somebody
    set by hand keeps what they set. Filling the header in after typing three rows
    has to do something, or it reads as a dead control; silently overwriting a
    deliberate per-row choice is the other way to get this wrong.
  */
  function changeBusinessLine(next: string) {
    setLines((prev) =>
      prev.map((line) =>
        line.businessLineId === businessLineId
          ? { ...line, businessLineId: next }
          : line,
      ),
    );
    setBusinessLineId(next);
  }

  function addLine() {
    setLines((prev) => [...prev, { ...blankLine(), businessLineId }]);
  }

  /** The party, in whichever of its two shapes — or nothing at all. */
  function partyInput(): Partial<CreateCashTransactionInput> {
    const contact = parseContactKey(partyKey);
    if (contact) return { partyType: contact.type, partyId: contact.id };
    if (partyKey === OTHER_PARTY && partyName.trim()) {
      return { partyName: partyName.trim() };
    }
    return {};
  }

  function blockedReason(): string | null {
    /*
      THE GRANTS FIRST, ahead of every empty field. Saving with the switch on is
      two acts — writing the schedule and recording its first occurrence — and
      they are two grants. A reason somebody cannot fix by typing belongs above
      the ones they can, or they fill in the whole form to be told they were
      never allowed to save it.
    */
    if (recur) {
      if (!can("fixedCosts", "create")) {
        return "Kamu belum boleh membuat biaya tetap";
      }
      if (!can("fixedCosts", "post")) {
        return "Kamu belum boleh mencatat biaya tetap";
      }
    }
    if (date === "") return "Tanggal belum diisi";
    if (partyKey === OTHER_PARTY && partyName.trim() === "") {
      return kind === "other_income"
        ? "Nama pengirim belum diisi"
        : "Nama penerima belum diisi";
    }
    if (date > todayValue()) return "Tanggal tidak boleh di masa depan";
    if (!branchId) return "Cabang belum dipilih";
    if (!cashAccount) return "Akun kas/bank belum dipilih";
    if (recur && recurName.trim() === "") return "Nama biaya tetap belum diisi";
    return linesProblem(lines);
  }

  const blocked = blockedReason();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || saving || !cashAccount) return;

    setSaving(true);
    setFormError(null);

    const input: CreateCashTransactionInput = {
      kind,
      branchId,
      accountId: cashAccount._id,
      // Today is left to the server, which stamps the time as well as the day.
      ...(date !== todayValue() ? { at: date } : {}),
      ...partyInput(),
      // Not asked, always sent — see the note at the head of the file.
      cashflowType: "operating",
      ...(note.trim() ? { note: note.trim() } : {}),
      lines: toLineInputs(lines),
    };

    /*
      TWO DIFFERENT SAVES BEHIND ONE BUTTON.

      Switch OFF — one transaction, as this form has always done.

      Switch ON — the SCHEDULE is written first and its first occurrence is then
      recorded THROUGH it (`POST /fixed-costs/:id/post`). Not a transaction plus
      a template written beside it: posting through the schedule is what sets
      `postedCount` and moves `nextDueAt` on, so the row lands in Biaya Tetap
      already showing next month rather than opening a month in arrears for a
      rent that was just paid.

      The two calls are not atomic, and the failure they can leave is a benign
      one: a schedule whose first occurrence is still outstanding, which the
      list draws as "Jatuh tempo" with a Catat button. Money is never recorded
      twice, and nothing is silently lost.
    */
    if (recur) {
      let fixedCostId: string;

      try {
        const schedule = await fixedCostService.create({
          name: recurName.trim(),
          kind,
          branchId,
          accountId: cashAccount._id,
          interval: recurInterval,
          // The transaction's own date anchors the schedule, so the month it
          // next falls due is counted from the one just paid.
          startDate: new Date(`${date}T00:00:00.000Z`).toISOString(),
          lines: toLineInputs(lines),
          ...partyInput(),
          cashflowType: "operating",
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        fixedCostId = schedule._id;
      } catch (error) {
        setFormError(
          error instanceof ApiError
            ? error.fullMessage
            : "Gagal menyimpan biaya tetap. Coba lagi.",
        );
        setSaving(false);
        return;
      }

      try {
        await fixedCostService.post(fixedCostId, { at: date });
      } catch (error) {
        // The schedule EXISTS — saying otherwise would send somebody to make it
        // again. What failed is only its first occurrence, which the list
        // offers to record.
        setFormError(
          `Biaya tetap "${recurName.trim()}" tersimpan, tapi transaksi pertamanya gagal dicatat. Catat dari daftar Biaya Tetap. ${
            error instanceof ApiError ? error.fullMessage : ""
          }`.trim(),
        );
        setSaving(false);
        return;
      }

      swalToast(`Transaksi & biaya tetap "${recurName.trim()}" tersimpan.`);
      router.push(fixedCostHref(fixedCostId));
      return;
    }

    let created;

    try {
      created = await cashTransactionService.create(input);
    } catch (error) {
      // The refusals name what to fix — an account of the wrong class, a
      // channel not usable here — so they are shown verbatim.
      setFormError(
        error instanceof ApiError
          ? error.fullMessage
          : "Gagal menyimpan transaksi. Coba lagi.",
      );
      setSaving(false);
      return;
    }

    swalToast(`Transaksi ${cashTransactionTitle(created)} tersimpan.`);
    router.push(cashTransactionHref(created._id));
  }

  const masuk = kind === "other_income";

  /*
    "Nama lain…" LAST, under its own heading, so it reads as an escape from the
    three registers rather than a fourth register. `FilterSelect` draws a heading
    wherever the group changes, in the order given.
  */
  const partyOptions: FilterOption<string>[] = [
    ...contacts.options,
    { value: OTHER_PARTY, label: "Nama lain…", group: "Tidak terdaftar" },
  ];
  const typedParty = partyKey === OTHER_PARTY;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* No title: the page heading already names the document, so the bar is
          the two buttons the mockup draws beside it. */}
      <FormActionBar
        submitLabel="Simpan transaksi"
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

            {/*
              THE THREE REGISTERS A SHOP ALREADY KEEPS, plus a way out of them.

              `partyType` on the transaction is exactly customer | supplier |
              user, so the groups are what the field CAN be rather than a tidy
              arrangement — and picking from one stores the id, which is what
              lets the list filter by party instead of by however the name was
              spelled that day.

              "Nama lain…" IS NOT A GAP IN THE DESIGN. Most of what a shop pays
              is nobody it keeps a record of — PLN, the landlord, an ad platform
              — and forcing those into the supplier register to record a
              transaction would fill it with rows nobody ever buys from.
            */}
            <FilterSelect
              layout="form"
              label={masuk ? "Pengirim" : "Penerima"}
              ariaLabel={masuk ? "Pengirim" : "Penerima"}
              value={partyKey}
              options={partyOptions}
              active={false}
              searchable
              placeholder={
                contacts.loading ? "Memuat kontak…" : "Pilih kontak…"
              }
              disabled={saving}
              hint={typedParty ? undefined : "Opsional."}
              onChange={(next) => {
                setPartyKey(next);
                if (next !== OTHER_PARTY) setPartyName("");
              }}
            />

            {typedParty && (
              <TextField
                label={masuk ? "Nama pengirim" : "Nama penerima"}
                name="cash-party-name"
                value={partyName}
                maxLength={120}
                required
                disabled={saving}
                hint="Yang tidak terdaftar — mis. PLN, pemilik ruko."
                onChange={(event) => setPartyName(event.target.value)}
              />
            )}

            <FilterSelect
              layout="form"
              label="Akun Kas/Bank"
              ariaLabel="Akun Kas/Bank"
              value={cashAccountId}
              options={cashAccountOptions}
              active={false}
              searchable
              placeholder={
                lookups.loading
                  ? "Memuat akun…"
                  : masuk
                    ? "Diterima di"
                    : "Dibayar dari"
              }
              required
              disabled={saving || lookups.loading}
              hint={
                cashAccount
                  ? `Nomornya seri ${numberPrefixForClass(direction, cashTypeOf(cashAccount))}, diberikan saat disimpan.`
                  : undefined
              }
              onChange={setCashAccountId}
            />

            <FilterSelect
              layout="form"
              label="Lini Usaha"
              ariaLabel="Lini Usaha"
              value={businessLineId}
              options={lineOptions}
              active={false}
              placeholder={SHARED_LINE_LABEL}
              disabled={saving}
              hint="Dipakai untuk baris baru di Rincian Akun; tiap baris masih bisa diubah sendiri."
              onChange={changeBusinessLine}
            />

            <div className="sm:col-span-2">
              <TextareaField
                label="Deskripsi"
                name="cash-note"
                value={note}
                rows={3}
                maxLength={500}
                disabled={saving}
                placeholder="cth: Gaji staff Oktober"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          {/*
            THE MOCKUP'S SWITCH, LIVE SINCE 21 SEPTEMBER 2026. It was shown,
            disabled and badged "Segera" while nothing stored a schedule.

            ITS COPY DOES NOT PROMISE AUTOMATION, because there still is no
            scheduler: turning it on records this transaction AND remembers the
            arrangement, and each month's occurrence is pressed by a person in
            the Biaya Tetap tab. A switch that said "otomatis" would be a promise
            the system cannot keep.
          */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-hover px-4 py-3">
            <div className="flex items-start gap-3">
              <Switch
                checked={recur}
                onCheckedChange={setRecur}
                disabled={saving}
                aria-label="Jadikan biaya tetap"
                className="mt-1"
              />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  Jadikan biaya tetap
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  Transaksinya tetap dicatat sekarang, dan jadwalnya diingat —
                  jatuh tempo berikutnya muncul di tab Biaya Tetap untuk dicatat
                  di sana.
                </p>
              </div>
            </div>

            {recur && (
              <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
                <TextField
                  label="Nama biaya tetap"
                  value={recurName}
                  onChange={(event) => setRecurName(event.target.value)}
                  placeholder="cth: Sewa toko Pusat"
                  disabled={saving}
                  required
                  hint="Nama ini yang dipakai daftar Biaya Tetap, dan harus unik."
                />
                <SelectField
                  label="Pengulangan"
                  value={recurInterval}
                  options={INTERVAL_OPTIONS}
                  onChange={(value) =>
                    setRecurInterval(value as FixedCostInterval)
                  }
                  disabled={saving}
                  required
                  hint={`Dihitung dari tanggal transaksi ini, ${date || "hari ini"}.`}
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Rincian Akun"
        description={
          masuk
            ? "Satu baris per akun pendapatan. Totalnya adalah jumlah yang masuk ke akun kas/bank di atas."
            : "Satu baris per akun beban. Totalnya adalah jumlah yang keluar dari akun kas/bank di atas."
        }
        action={
          canAddLine(lines) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={saving || lookups.loading}
              onClick={addLine}
            >
              <Plus className="size-4" />
              Tambah baris
            </Button>
          ) : null
        }
      >
        {lookups.loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted">
            <Spinner /> Memuat daftar akun…
          </div>
        ) : lookups.error ? (
          <Alert variant="error">{lookups.error}</Alert>
        ) : (
          <>
            <CashLinesEditor
              kind={kind}
              lines={lines}
              onChange={setLines}
              accounts={accountsForKind(lookups.accounts, kind)}
              businessLines={lookups.businessLines}
              disabled={saving}
              showAddButton={false}
            />
            <p className="mt-3 text-sm text-muted">
              Detil akun hanya muncul untuk akun yang punya beberapa aturan
              alokasi (cth. Beban Gaji) — dipakai untuk laporan per lini, tidak
              memengaruhi jurnal. Total dihitung otomatis dari baris di atas.
            </p>
          </>
        )}
      </Card>
    </form>
  );
}
