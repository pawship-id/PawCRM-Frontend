"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Card, Spinner, TextField } from "@/components";
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
import type { AccountCategory, ChartOfAccount } from "@/types/accounting";
import { accountTypeOf, normalBalanceOf } from "@/types/accounting";

import { useChartOfAccounts } from "../hooks/useChartOfAccounts";
import { useBusinessLines } from "../hooks/useBusinessLines";
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_CATEGORY_HINT,
  ACCOUNT_CATEGORY_LABEL,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
} from "../labels";
import { ACCOUNTING_CRUMBS } from "../crumbs";

/** Backend caps and rules — chartOfAccounts.model.js. Restated, not guessed. */
const CODE_MAX_LENGTH = 20;
const NAME_MAX_LENGTH = 120;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,19}$/;
const MAX_DEPTH = 4;

/**
 * Radix Select forbids an empty item value, so "root" stands in for "no parent".
 * It is mapped to `null` on the way out, which is what the API wants — and null
 * there is a real value meaning "top of the tree", not an omission.
 */
const ROOT = "root";

/**
 * "No line" — the same sentinel dance `ROOT` does above, and for the same
 * reason: Radix Select forbids `value=""`, and null is a real answer here rather
 * than an absence of one.
 */
const NO_LINE = "__none__";

const LIST_HREF = ACCOUNTING_CRUMBS.accounts.href;

/**
 * Create an account — GET the chart for the parent picker, then POST.
 *
 * The chart is fetched rather than passed in because this is a ROUTE now: the
 * page can be opened directly, bookmarked, or reloaded, and a form that only
 * worked when the list happened to be mounted first would break every one of
 * those. It is the same request the list makes, so the browser cache absorbs the
 * common case of arriving here from it.
 */
export function ChartOfAccountCreateForm() {
  const { accounts, loading, error } = useChartOfAccounts();

  return (
    <AccountForm
      accounts={accounts}
      loadError={error}
      // The parent picker is the only thing waiting on the chart, and it has a
      // legitimate empty value — so the form is usable while it loads rather
      // than hidden behind a spinner it does not need.
      loadingParents={loading}
    />
  );
}

/**
 * Edit an account — the same chart read, with the target picked out of it.
 *
 * ONE REQUEST, NOT TWO. `GET /chart-of-accounts/:id` exists, but the parent
 * picker needs the whole chart anyway, and the account is in it: asking for the
 * document separately would be a second round trip for data already in hand, and
 * two copies of one record that could disagree.
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

  return <AccountForm account={account} accounts={accounts} loadError={null} />;
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
 * THREE FIELDS CAN BE FROZEN, and each says so rather than merely greying out:
 *
 *   - `code` and `accountCategory` on a SEEDED account (`isDefault`). Every
 *     posting module resolves its target by code — "credit 1201" — so
 *     renumbering it or refiling it from persediaan to biaya would silently
 *     redirect or corrupt every inventory entry in the tenant. The server
 *     answers 403; the form does not offer the field at all rather than letting
 *     someone change it and lose the edit.
 *   - `accountCategory` on an account that HAS sub-accounts. A child must share
 *     its parent's category, so refiling would break that for all of them at
 *     once. The server refuses with a 400 naming the count and asking for the
 *     children to be reparented first.
 *
 * THE PARENT LIST IS FILTERED TO WHAT THE SERVER WOULD ACCEPT — same CATEGORY,
 * not itself, not one of its own descendants, and not already at the maximum
 * depth. Mirrored rather than tightened: a list that hid a parent the API would
 * have taken is as wrong as one that offers a parent it refuses.
 */
function AccountForm({
  account,
  accounts,
  loadError,
  loadingParents = false,
}: {
  /** Absent to create; present to edit that account. */
  account?: ChartOfAccount;
  /** The whole chart — the parent picker is built from it. */
  accounts: ChartOfAccount[];
  /** A failed chart read, which costs the parent picker but not the form. */
  loadError: string | null;
  loadingParents?: boolean;
}) {
  const router = useRouter();
  const editing = account !== undefined;

  /**
   * The lines this account may belong to.
   *
   * READ HERE RATHER THAN PASSED IN, unlike the chart: both wrappers would have
   * to fetch it and hand it down identically, and nothing else in either uses
   * it. A failed read degrades to an empty picker with a note — an account saves
   * perfectly well without a line, and `businessLines:read` is its own grant.
   */
  const { lines: businessLines } = useBusinessLines();

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
  const [parentId, setParentId] = useState(account?.parentAccountId ?? ROOT);
  const [businessLineId, setBusinessLineId] = useState(
    account?.businessLineId ?? NO_LINE,
  );
  const [isActive, setIsActive] = useState(account?.isActive ?? true);

  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
    accountCategory?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(
    () => new Map(accounts.map((item) => [item._id, item])),
    [accounts],
  );

  const hasChildren = useMemo(
    () => editing && accounts.some((item) => item.parentAccountId === account._id),
    [accounts, account, editing],
  );

  const codeFrozen = account?.isDefault === true;
  const categoryFrozen = account?.isDefault === true || hasChildren;

  const parentOptions = useMemo(
    () => eligibleParents({ accounts, byId, accountCategory, self: account }),
    [accounts, byId, accountCategory, account],
  );

  /**
   * A parent that is no longer eligible falls back to the root.
   *
   * Two things can strand one: changing the class, and — on a create page opened
   * cold — the chart arriving after the field was already touched. Both are
   * silent, because keeping a selection the server would refuse is the worse
   * outcome, and the field is on screen either way.
   */
  useEffect(() => {
    if (parentId === ROOT) return;
    if (parentOptions.some(({ item }) => item._id === parentId)) return;
    // Nothing to fall back FROM while the chart is still empty — that is a
    // loading state, not an ineligible parent.
    if (accounts.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParentId(ROOT);
  }, [parentId, parentOptions, accounts.length]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Uppercased here as well as on the server, so what is validated and what
    // is compared against the stored value are the same string.
    const nextCode = code.trim().toUpperCase();
    const nextName = name.trim();
    const nextParent = parentId === ROOT ? null : parentId;
    const nextLine = businessLineId === NO_LINE ? null : businessLineId;

    const errors: {
      code?: string;
      name?: string;
      accountCategory?: string;
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

    // `accountCategory === ""` rather than `errors.accountCategory`, though they
    // are set together: this spelling is what narrows the state to a real
    // category for the rest of the function, so the create below needs no cast.
    if (errors.code || errors.name || accountCategory === "") {
      setFieldErrors(errors);
      return;
    }

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
        if (nextParent !== account.parentAccountId)
          patch.parentAccountId = nextParent;
        if (isActive !== account.isActive) patch.isActive = isActive;
        if (nextLine !== (account.businessLineId ?? null))
          patch.businessLineId = nextLine;

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
          parentAccountId: nextParent,
          businessLineId: nextLine,
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
        (!editing || nextCode !== account.code)
      ) {
        setFieldErrors({ code: `Kode ${nextCode} sudah dipakai akun lain.` });
      } else {
        // `fullMessage`, not `message`: the refusals that reach this banner carry
        // their explanation in `reason` — which account has how many journal
        // entries, how many sub-accounts have to move first — and the message
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
                        {inClass.map((category) => (
                          <SelectItem key={category} value={category}>
                            {ACCOUNT_CATEGORY_LABEL[category]}
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
                    : hasChildren
                      ? "Akun ini punya sub-akun, dan sub-akun wajib sekategori induknya. Pindahkan sub-akunnya dulu kalau kategorinya mau diganti."
                      : accountCategory === ""
                        ? "Kategori menentukan di baris mana akun ini muncul di Laba Rugi atau Neraca."
                        : ACCOUNT_CATEGORY_HINT[accountCategory]}
                </p>
              )}
            </div>

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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coa-parent">Induk akun</Label>
              <Select
                value={parentId}
                onValueChange={setParentId}
                disabled={busy || loadingParents}
              >
                <SelectTrigger
                  id="coa-parent"
                  aria-label="Induk akun"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT}>Tanpa induk (akun utama)</SelectItem>
                  {parentOptions.map(({ item, depth }) => (
                    <SelectItem key={item._id} value={item._id}>
                      {/* The indent is what makes a flat list read as the tree
                          it came from — two accounts named "Bank" under
                          different parents are otherwise indistinguishable
                          here. Padding rather than spaces in the label: a run
                          of them collapses in HTML, and non-breaking ones end
                          up in the option's accessible name. */}
                      <span style={{ paddingLeft: `${depth * 14}px` }}>
                        {item.code} · {item.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted">
                {loadError
                  ? "Daftar akun gagal dimuat, jadi induk belum bisa dipilih. Akun tetap bisa dibuat tanpa induk."
                  : accountCategory === ""
                    ? `Pilih kategorinya dulu — induk wajib sekategori, maksimal ${MAX_DEPTH} tingkat.`
                    : `Hanya akun berkategori ${ACCOUNT_CATEGORY_LABEL[accountCategory]} yang bisa jadi induk, maksimal ${MAX_DEPTH} tingkat.`}
              </p>
            </div>

            {/*
              THE LINE OF BUSINESS, asked here because this is where the tenant
              knows the answer: naming it on "5102 HPP Grooming" says it once for
              everything that ever lands there. Empty is ordinary — rent and the
              electricity bill belong to no single line.
            */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coa-business-line">Lini bisnis</Label>
              <Select
                value={businessLineId}
                onValueChange={setBusinessLineId}
                disabled={busy || businessLines.length === 0}
              >
                <SelectTrigger
                  id="coa-business-line"
                  aria-label="Lini bisnis"
                  className="w-full"
                >
                  <SelectValue
                    placeholder={
                      businessLines.length === 0
                        ? "Belum ada lini bisnis"
                        : "Tanpa lini bisnis"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LINE}>Tanpa lini bisnis</SelectItem>
                  {businessLines.map((line) => (
                    <SelectItem key={line._id} value={line._id}>
                      {line.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted">
                {businessLines.length === 0
                  ? "Buat lini bisnisnya dulu di Keuangan → Lini Bisnis."
                  : "Menandai akun ini milik unit usaha mana. Kosongkan untuk yang dipakai bersama, misalnya listrik atau sewa."}
              </p>
            </div>
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

/**
 * The accounts the server would accept as a parent, each with its depth so the
 * picker can indent it.
 *
 * Four rules, all of them the backend's (#assertValidParent in
 * chartOfAccounts.service.js), restated here so the common refusals never reach
 * the network:
 *
 *   1. same CATEGORY — a parent's balance is the sum of its children's, and
 *      summing across categories produces a number that means nothing in any
 *      report. Tightened from "same class" when categories landed: both are
 *      assets, so the old rule let a vehicle file under cash;
 *   2. not itself, and 3. not one of its own descendants — either would detach
 *      the branch from the tree and make the ancestor walk never terminate;
 *   4. depth. `chain.length >= MAX_DEPTH` is what the server refuses, where the
 *      chain is the parent plus its ancestors — so a parent at 1-based depth 4
 *      is out, and everything shallower is in.
 *
 * NOT TIGHTENED BEYOND THAT. Moving a subtree under a deep parent can still push
 * its own descendants past MAX_DEPTH, and the server allows it; adding the check
 * here would refuse an edit the API accepts, which is the more confusing of the
 * two wrongs.
 */
function eligibleParents({
  accounts,
  byId,
  accountCategory,
  self,
}: {
  accounts: ChartOfAccount[];
  byId: Map<string, ChartOfAccount>;
  /** "" while a create has no category yet — nothing can be a parent then. */
  accountCategory: AccountCategory | "";
  self?: ChartOfAccount;
}): { item: ChartOfAccount; depth: number }[] {
  // No category, no rule to filter by: offering the whole chart would offer
  // parents the server refuses the moment a category is picked.
  if (accountCategory === "") return [];

  const blocked = new Set<string>();
  if (self) {
    blocked.add(self._id);
    // One pass is enough because `accounts` is already parents-before-children.
    for (const item of accounts) {
      if (item.parentAccountId && blocked.has(item.parentAccountId)) {
        blocked.add(item._id);
      }
    }
  }

  const depthOf = (item: ChartOfAccount) => {
    let depth = 0;
    let parentId = item.parentAccountId;
    while (parentId && depth < MAX_DEPTH) {
      depth += 1;
      parentId = byId.get(parentId)?.parentAccountId ?? null;
    }
    return depth;
  };

  return accounts
    .filter(
      (item) =>
        item.accountCategory === accountCategory && !blocked.has(item._id),
    )
    .map((item) => ({ item, depth: depthOf(item) }))
    // `depth` is 0-based, so this is the 1-based chain length the server checks
    // against MAX_DEPTH: a parent at chain length 4 would put its child at 5.
    .filter(({ depth }) => depth + 1 < MAX_DEPTH);
}
