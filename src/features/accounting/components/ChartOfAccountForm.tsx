"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  FilterMultiSelect,
  namedOptions,
  Spinner,
  TextField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/services/api-error";
import {
  chartOfAccountsService,
  type ChartOfAccountPayload,
} from "@/services/chartOfAccounts.service";
import { swalToast } from "@/lib/swal";
import type {
  AccountCategory,
  CashType,
  ChartOfAccount,
} from "@/types/accounting";
import { accountTypeOf, cashTypeOf, normalBalanceOf } from "@/types/accounting";

import { useAllocationTargets } from "../hooks/useAllocationTargets";
import { useChartOfAccounts } from "../hooks/useChartOfAccounts";
import {
  accountCategoryOption,
  ACCOUNT_CATEGORIES,
  ACCOUNT_CATEGORY_HINT,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
} from "../labels";
import { ACCOUNTING_CRUMBS } from "../crumbs";
import { CASH_ACCOUNT_CATEGORY } from "../financeSummary";

/** Backend caps and rules — chartOfAccounts.model.js. Restated, not guessed. */
const CODE_MAX_LENGTH = 20;
const NAME_MAX_LENGTH = 120;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

const LIST_HREF = ACCOUNTING_CRUMBS.accounts.href;

/**
 * Create an account — one POST. The branch picker reads the tenant's branches
 * itself, and the form is a ROUTE, so it can be opened directly or reloaded.
 */
export function ChartOfAccountCreateForm() {
  return <AccountForm />;
}

/**
 * Edit an account — the chart read, with the target picked out of it.
 *
 * THE TREE, NOT `GET /chart-of-accounts/:id`: both carry the account's
 * `branchIds` and `subAccounts`, and the tree is the request the list just made,
 * so arriving here from it is answered from the browser cache.
 */
export function ChartOfAccountEditForm({ accountId }: { accountId: string }) {
  const { accounts, loading, error } = useChartOfAccounts();
  const account = accounts.find((item) => item._id === accountId);

  if (loading && accounts.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat akun…
      </div>
    );
  }

  if (error && !account) {
    return <Alert variant="error">{error}</Alert>;
  }

  // Not in the chart means not in this tenant, deleted, or a mistyped URL — all
  // of which read the same to the person holding the link.
  if (!account) {
    return (
      <Card>
        <p className="font-medium text-foreground">Akun tidak ditemukan</p>
        <p className="mt-1 text-sm text-muted">
          Akun ini mungkin sudah dihapus, atau tautannya salah.{" "}
          <Link href={LIST_HREF} className="underline">
            Kembali ke daftar akun
          </Link>
          .
        </p>
      </Card>
    );
  }

  return <AccountForm account={account} />;
}

/**
 * The form itself, shared by both verbs because the fields are identical; only
 * the request and the wording differ.
 *
 * THE CLASS IS NOT A FIELD HERE ANY MORE. A tenant picks a CATEGORY — Cash &
 * Bank, Persediaan, Biaya Lainnya — and "Aset · saldo normal Debit" is shown
 * underneath as a consequence of that choice. Before this, "Beban Iklan" could
 * be filed as income and nothing anywhere refused it; the class is now derived
 * on the server and no request body carries one.
 *
 * IT IS STILL SHOWN, though, and deliberately: hiding the class entirely would
 * make a mis-picked category invisible until a report came out wrong, and the
 * one line of feedback is what lets somebody catch it while they are still
 * looking at the form.
 *
 * TWO FIELDS CAN BE FROZEN, and each says so rather than merely greying out:
 *
 *   - `code` and `accountCategory` on a SEEDED account (`isDefault`). Every
 *     posting module resolves its target by code — "credit 1201" — so
 *     renumbering it or refiling it from persediaan to biaya would silently
 *     redirect or corrupt every inventory entry in the tenant. The server
 *     answers 403; the form does not offer the field at all rather than letting
 *     someone change it and lose the edit.
 *
 * THERE IS NO "INDUK AKUN" ANY MORE (Sub-Akun-Implementation-Plan §1.2). This
 * page makes parent accounts only; what used to hang under one is a SUB AKUN,
 * made from the account's own row in Daftar Akun. What this page asks instead is
 * CABANG — which branches may post here — all of them ticked on a new account.
 */
function AccountForm({ account }: {
  /** Absent to create; present to edit that account. */
  account?: ChartOfAccount;
}) {
  const router = useRouter();
  const editing = account !== undefined;

  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  /**
   * NO DEFAULT ON A CREATE. `useState<AccountCategory | "">("")` rather than
   * seeding "cash_bank": a pre-picked category is a category somebody can leave
   * unread, and this is the one field the whole change exists to make people
   * think about. The picker shows a placeholder and the submit reports it as
   * required, the way the code and name fields already do.
   */
  const [accountCategory, setAccountCategory] = useState<AccountCategory | "">(
    account?.accountCategory ?? "",
  );
  /**
   * KAS OR BANK — asked only for a Kas & Bank account, and it decides the bukti
   * kas series a transaction on the account draws: BKM/BKK for a till, BBM/BBK
   * for a bank account. Defaults to `bank`, the server's own default, and is
   * never guessed from the name — "Kas Bon Karyawan" is not a till.
   */
  const [cashType, setCashType] = useState<CashType>(
    account?.cashType === "cash" ? "cash" : "bank",
  );
  /**
   * `null` UNTOUCHED, and that is what makes "all branches" the default without
   * an effect: the branches arrive after the form is on screen, and an
   * untouched picker reads them all as they land. The first tick replaces it
   * with a real list. An edit starts from what the account has saved.
   */
  const [pickedBranchIds, setPickedBranchIds] = useState<string[] | null>(null);
  const { branches, loading: branchesLoading } = useAllocationTargets();
  const [isActive, setIsActive] = useState(account?.isActive ?? true);

  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
    accountCategory?: string;
    branchIds?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const branchIds =
    pickedBranchIds ??
    (editing
      ? (account.branchIds ?? [])
      : branches.map((branch) => branch._id));

  /** Whether the jenis question exists at all — see the control below. */
  const isCashBank = accountCategory === CASH_ACCOUNT_CATEGORY;

  const codeFrozen = account?.isDefault === true;
  const categoryFrozen = account?.isDefault === true;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Uppercased here as well as on the server, so what is validated and what
    // is compared against the stored value are the same string.
    const nextCode = code.trim().toUpperCase();
    const nextName = name.trim();

    const errors: {
      code?: string;
      name?: string;
      accountCategory?: string;
      branchIds?: string;
    } = {};
    if (accountCategory === "")
      errors.accountCategory = "Kategori akun wajib dipilih.";
    if (nextCode === "") errors.code = "Kode akun wajib diisi.";
    else if (nextCode.length > CODE_MAX_LENGTH)
      errors.code = `Maksimal ${CODE_MAX_LENGTH} karakter.`;
    else if (!CODE_PATTERN.test(nextCode))
      errors.code =
        "Hanya huruf, angka dan tanda hubung, dan harus diawali huruf atau angka.";
    if (nextName === "") errors.name = "Nama akun wajib diisi.";
    else if (nextName.length > NAME_MAX_LENGTH)
      errors.name = `Maksimal ${NAME_MAX_LENGTH} karakter.`;

    if (branchIds.length === 0)
      errors.branchIds = "Pilih minimal satu cabang untuk akun ini.";

    // `accountCategory === ""` rather than `errors.accountCategory`, though they
    // are set together: this spelling is what narrows the state to a real
    // category for the rest of the function, so the create below needs no cast.
    if (
      errors.code ||
      errors.name ||
      errors.branchIds ||
      accountCategory === ""
    ) {
      setFieldErrors(errors);
      return;
    }

    // Whether this save touches the branch set — told apart from a taken code
    // below, since both come back as a 409.
    const savedBranches = account?.branchIds ?? [];
    const branchesChanged =
      editing &&
      (branchIds.length !== savedBranches.length ||
        branchIds.some((id) => !savedBranches.includes(id)));

    setBusy(true);
    setFieldErrors({});
    setFormError(null);

    try {
      if (editing) {
        // ONLY WHAT MOVED: an empty body is a 400, and sending `code` unchanged
        // would run the uniqueness check against the account's own code.
        const patch: Partial<ChartOfAccountPayload> = {};
        if (nextCode !== account.code) patch.code = nextCode;
        if (nextName !== account.name) patch.name = nextName;
        if (accountCategory !== account.accountCategory)
          patch.accountCategory = accountCategory;
        // A set, not a sequence: the order the branches were ticked in is not
        // a change, and a patch that resent the same set is one more request.
        if (branchesChanged) patch.branchIds = branchIds;
        // Only where the question exists. Re-filing an account out of Kas & Bank
        // clears the jenis on the server; sending one would be refused.
        if (isCashBank && cashType !== cashTypeOf(account)) {
          patch.cashType = cashType;
        }
        if (isActive !== account.isActive) patch.isActive = isActive;

        if (Object.keys(patch).length === 0) {
          router.push(LIST_HREF);
          return;
        }
        await chartOfAccountsService.update(account._id, patch);
      } else {
        await chartOfAccountsService.create({
          code: nextCode,
          name: nextName,
          // Narrowed by the guard above: the empty string cannot reach here.
          accountCategory,
          ...(isCashBank ? { cashType } : {}),
          branchIds,
          // NO SUB AKUN FROM HERE. A new Pendapatan or Beban account is born
          // "Belum dipetakan" and gets its sub akun in the list, inside its own
          // row — their codes hang off this one, and each carries rules checked
          // against the tenant's lines and against the branches ticked above.
        });
      }

      swalToast(
        editing ? "Akun diperbarui." : `Akun ${nextCode} ${nextName} dibuat.`,
      );
      router.push(LIST_HREF);
    } catch (error) {
      // A code clash belongs on the field that is wrong. Everything else — the
      // parent rules, the frozen-field guards — is about the form as a whole and
      // is shown verbatim, because the server's message names the account or the
      // count that explains what to do next.
      /*
        A 409 used to mean one thing. It now means two, and they belong in
        different places on the screen: a taken CODE is a fact about the field
        somebody just typed, while a refused recategorisation is a fact about the
        account's history that no field can restate. Told apart by whether the
        code is the thing that moved — the server's own message names the account
        and the entry count, so it is shown verbatim.
      */
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        branchesChanged
      ) {
        // A branch that cannot be removed: a sub akun or an entry still uses it.
        // The server's message names which, so it is shown whole, as a toast —
        // the field is intact and the person has to read it, not dismiss it.
        void swalToast(error.fullMessage, "error", 6000);
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        (!editing || nextCode !== account.code)
      ) {
        setFieldErrors({ code: `Kode ${nextCode} sudah dipakai akun lain.` });
      } else {
        // `fullMessage`, not `message`: the refusals that reach this banner carry
        // their explanation in `reason` — which account has how many journal
        // entries — and the message
        // alone ("Cannot change the category of this account") says nothing a
        // person can act on.
        setFormError(
          error instanceof ApiError
            ? error.fullMessage
            : "Terjadi kesalahan. Coba lagi.",
        );
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Card>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Kode akun"
              name="code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setFieldErrors((prev) => ({ ...prev, code: undefined }));
              }}
              error={fieldErrors.code}
              hint={
                codeFrozen
                  ? "Akun bawaan: kodenya dipakai modul lain untuk posting, jadi tidak bisa diubah."
                  : "Angka depan menandai kelasnya — 1 aset, 2 kewajiban, 3 ekuitas, 4 pendapatan, 5 beban."
              }
              placeholder="mis. 1102"
              maxLength={CODE_MAX_LENGTH}
              className="tabular-nums"
              disabled={busy || codeFrozen}
              autoFocus={!codeFrozen}
              required
            />

            <TextField
              label="Nama akun"
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFieldErrors((prev) => ({ ...prev, name: undefined }));
              }}
              error={fieldErrors.name}
              placeholder="mis. Bank BCA"
              maxLength={NAME_MAX_LENGTH}
              disabled={busy}
              autoFocus={codeFrozen}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/*
              THE FIELD THIS WHOLE CHANGE IS ABOUT. "Tipe akun" used to stand
              here as five free choices; the class is now derived from what is
              picked below and shown underneath as a consequence.

              GROUPED BY CLASS, which is what makes fifteen options scannable:
              somebody looking for where a vehicle goes reads down the Aset
              group rather than down a flat list of fifteen.
            */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coa-category">
                Kategori akun<span className="text-danger"> *</span>
              </Label>
              <Select
                value={accountCategory}
                onValueChange={(value) => {
                  setAccountCategory(value as AccountCategory);
                  setFieldErrors((prev) => ({
                    ...prev,
                    accountCategory: undefined,
                  }));
                }}
                disabled={busy || categoryFrozen}
              >
                {/* w-full: the shadcn trigger defaults to `w-fit`, which is
                    right for a toolbar filter and wrong in a form. */}
                <SelectTrigger
                  id="coa-category"
                  aria-label="Kategori akun"
                  aria-invalid={fieldErrors.accountCategory ? true : undefined}
                  className="w-full"
                >
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => {
                    const inClass = ACCOUNT_CATEGORIES.filter(
                      (category) => accountTypeOf(category) === type,
                    );

                    return (
                      <SelectGroup key={type}>
                        <SelectLabel>{ACCOUNT_TYPE_LABEL[type]}</SelectLabel>
                        {/*
                          THE NUMBER LEADS — "110 - Cash & Bank", BO's own
                          reference number for the category. Somebody filing an
                          account is usually reading a chart on paper, or one
                          exported from Jubelio, and looking DOWN a column of
                          numbers; the number is also what makes two similar
                          names ("Hutang Lainnya" vs "Hutang Jangka Panjang")
                          tellable apart at a glance.

                          The trigger shows the same string once a choice is
                          made, because Radix renders the chosen item's own
                          children there.
                        */}
                        {inClass.map((category) => (
                          <SelectItem key={category} value={category}>
                            {accountCategoryOption(category)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
              {fieldErrors.accountCategory ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {fieldErrors.accountCategory}
                </p>
              ) : (
                <p className="text-xs text-muted">
                  {account?.isDefault
                    ? "Akun bawaan: kategorinya menentukan ke mana uang mendarat dan di baris mana laporannya muncul, jadi tidak bisa diubah."
                    : accountCategory === ""
                      ? "Kategori menentukan di baris mana akun ini muncul di Laba Rugi atau Neraca."
                      : ACCOUNT_CATEGORY_HINT[accountCategory]}
                </p>
              )}
            </div>

            {/*
              ASKED ONLY WHERE IT MEANS SOMETHING. Every other category has no
              kas/bank half, and a control that is always on screen with nothing
              to say is a control people stop reading. It appears the moment
              Kas & Bank is picked and goes away again if the category moves.
            */}
            {isCashBank && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="coa-cash-type">Jenis</Label>
                <Select
                  value={cashType}
                  onValueChange={(next) => setCashType(next as CashType)}
                  disabled={busy}
                >
                  <SelectTrigger
                    id="coa-cash-type"
                    aria-label="Jenis"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Kas</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted">
                  Menentukan nomor bukti kas transaksi di akun ini —{" "}
                  {cashType === "cash"
                    ? "BKM untuk uang masuk, BKK untuk uang keluar."
                    : "BBM untuk uang masuk, BBK untuk uang keluar."}
                </p>
              </div>
            )}

            {/*
              THE CLASS, AS A CONSEQUENCE — read-only, and deliberately still on
              screen. Hiding it would make a mis-picked category invisible until
              a report came out wrong; one line here is what lets somebody catch
              it while they are still looking at the form.

              Rendered as text rather than a disabled input: a greyed-out field
              reads as something that could be filled in under other
              circumstances, and this one never can.
            */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                Tipe akun
              </span>
              <div className="flex h-9 items-center text-sm text-foreground">
                {accountCategory === "" ? (
                  <span className="text-muted">
                    Mengikuti kategori yang dipilih
                  </span>
                ) : (
                  <span>
                    {ACCOUNT_TYPE_LABEL[accountTypeOf(accountCategory)]} · saldo
                    normal{" "}
                    {normalBalanceOf(accountTypeOf(accountCategory)) === "debit"
                      ? "Debit"
                      : "Kredit"}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                Ditentukan Buloo dari kategorinya, bukan pilihan tersendiri.
              </p>
            </div>

            {/*
              WHICH BRANCHES MAY POST HERE — replaces "Induk akun". A multi-select
              rather than a row of checkboxes because a tenant can have dozens,
              and `layout="form"` so it stands among its siblings at the same
              height and with its caption above, as the benefit-scope form does.

              ALL TICKED ON A NEW ACCOUNT, at least one always: an account no
              branch may post to is one nobody can use, and a journal entry at a
              branch outside this list is refused. Removing a branch that a sub
              akun or an entry already uses is refused too, with a 409 that names
              what holds it — shown as it arrives.
            */}
            <FilterMultiSelect
              layout="form"
              label="Cabang"
              required
              values={branchIds}
              options={namedOptions(branches)}
              onApply={(next) => {
                setPickedBranchIds(next);
                setFieldErrors((prev) => ({ ...prev, branchIds: undefined }));
              }}
              onReset={() => setPickedBranchIds([])}
              disabled={busy || branchesLoading}
              error={fieldErrors.branchIds}
              hint="Cabang yang boleh memakai akun ini untuk posting. Minimal satu."
              formatValue={(values) => {
                if (branchesLoading) return "Memuat cabang…";
                if (values.length === 0) return "Pilih cabang";
                if (values.length === branches.length && branches.length > 1)
                  return "Semua cabang";
                if (values.length === 1)
                  return (
                    branches.find((branch) => branch._id === values[0])?.name ??
                    "1 cabang"
                  );
                return `${values.length} cabang`;
              }}
            />

          </div>

          {editing && (
            <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
              <div className="min-w-0">
                <Label htmlFor="coa-active">Aktif</Label>
                <p className="mt-1 text-xs text-muted">
                  Akun nonaktif tidak ditawarkan lagi untuk posting baru, tapi
                  jurnal lama yang menunjuk akun ini tetap utuh dan tetap
                  terbaca.
                </p>
              </div>
              <Switch
                id="coa-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={busy}
              />
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="secondary" size="lg">
          <Link href={LIST_HREF}>Batal</Link>
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Spinner size={16} />}
          {editing ? "Simpan" : "Buat akun"}
        </Button>
      </div>
    </form>
  );
}
