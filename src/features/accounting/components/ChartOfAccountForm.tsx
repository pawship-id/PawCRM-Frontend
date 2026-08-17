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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/services/api-error";
import {
  chartOfAccountsService,
  type ChartOfAccountPayload,
} from "@/services/chartOfAccounts.service";
import { swalToast } from "@/lib/swal";
import type { AccountType, ChartOfAccount } from "@/types/accounting";
import { normalBalanceOf } from "@/types/accounting";

import { useChartOfAccounts } from "../hooks/useChartOfAccounts";
import { useBusinessLines } from "../hooks/useBusinessLines";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL } from "../labels";
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
 * THREE FIELDS CAN BE FROZEN, and each says so rather than merely greying out:
 *
 *   - `code` and `accountType` on a SEEDED account (`isDefault`). Every posting
 *     module resolves its target by code — "credit 1201" — so renumbering it or
 *     reclassifying it from asset to expense would silently redirect or corrupt
 *     every inventory entry in the tenant. The server answers 403; the form does
 *     not offer the field at all rather than letting someone type into it and
 *     lose the edit.
 *   - `accountType` on an account that HAS sub-accounts. A child must share its
 *     parent's class, so reclassifying would break that for all of them at once.
 *     The server refuses with a 400 naming the count and asking for the children
 *     to be reparented first.
 *
 * THE PARENT LIST IS FILTERED TO WHAT THE SERVER WOULD ACCEPT — same class, not
 * itself, not one of its own descendants, and not already at the maximum depth.
 * Mirrored rather than tightened: a list that hid a parent the API would have
 * taken is as wrong as one that offers a parent it refuses.
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
  const [accountType, setAccountType] = useState<AccountType>(
    account?.accountType ?? "asset",
  );
  const [parentId, setParentId] = useState(account?.parentAccountId ?? ROOT);
  const [businessLineId, setBusinessLineId] = useState(
    account?.businessLineId ?? NO_LINE,
  );
  const [isActive, setIsActive] = useState(account?.isActive ?? true);

  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
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
  const typeFrozen = account?.isDefault === true || hasChildren;

  const parentOptions = useMemo(
    () => eligibleParents({ accounts, byId, accountType, self: account }),
    [accounts, byId, accountType, account],
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

    const errors: { code?: string; name?: string } = {};
    if (nextCode === "") errors.code = "Kode akun wajib diisi.";
    else if (nextCode.length > CODE_MAX_LENGTH)
      errors.code = `Maksimal ${CODE_MAX_LENGTH} karakter.`;
    else if (!CODE_PATTERN.test(nextCode))
      errors.code =
        "Hanya huruf, angka dan tanda hubung, dan harus diawali huruf atau angka.";
    if (nextName === "") errors.name = "Nama akun wajib diisi.";
    else if (nextName.length > NAME_MAX_LENGTH)
      errors.name = `Maksimal ${NAME_MAX_LENGTH} karakter.`;

    if (errors.code || errors.name) {
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
        if (accountType !== account.accountType) patch.accountType = accountType;
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
          accountType,
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
      if (error instanceof ApiError && error.status === 409) {
        setFieldErrors({ code: `Kode ${nextCode} sudah dipakai akun lain.` });
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coa-type">
                Tipe akun<span className="text-danger"> *</span>
              </Label>
              <Select
                value={accountType}
                onValueChange={(value) => setAccountType(value as AccountType)}
                disabled={busy || typeFrozen}
              >
                {/* w-full: the shadcn trigger defaults to `w-fit`, which is
                    right for a toolbar filter and wrong in a form. */}
                <SelectTrigger
                  id="coa-type"
                  aria-label="Tipe akun"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ACCOUNT_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted">
                {account?.isDefault
                  ? "Akun bawaan: tipenya menentukan ke mana uang mendarat, jadi tidak bisa diubah."
                  : hasChildren
                    ? "Akun ini punya sub-akun, dan sub-akun wajib setipe induknya. Pindahkan sub-akunnya dulu kalau tipenya mau diganti."
                    : `Saldo normal ${normalBalanceOf(accountType) === "debit" ? "debit" : "kredit"} — ikut tipe, bukan pilihan tersendiri.`}
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
                  : `Hanya akun bertipe ${ACCOUNT_TYPE_LABEL[accountType].toLowerCase()} yang bisa jadi induk, maksimal ${MAX_DEPTH} tingkat.`}
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
 *   1. same class — a parent's balance is the sum of its children's, and summing
 *      across classes produces a number that means nothing in any report;
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
  accountType,
  self,
}: {
  accounts: ChartOfAccount[];
  byId: Map<string, ChartOfAccount>;
  accountType: AccountType;
  self?: ChartOfAccount;
}): { item: ChartOfAccount; depth: number }[] {
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
    .filter((item) => item.accountType === accountType && !blocked.has(item._id))
    .map((item) => ({ item, depth: depthOf(item) }))
    // `depth` is 0-based, so this is the 1-based chain length the server checks
    // against MAX_DEPTH: a parent at chain length 4 would put its child at 5.
    .filter(({ depth }) => depth + 1 < MAX_DEPTH);
}
