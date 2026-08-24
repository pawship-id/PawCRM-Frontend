"use client";

import { Alert, Card, Spinner, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import {
  validateSupplierBankAccount,
  validateSupplierCity,
  validateSupplierCodeRequired,
  validateSupplierCountry,
  validateSupplierEmail,
  validateSupplierFax,
  validateSupplierName,
  validateSupplierNotes,
  validateSupplierNpwp,
  validateSupplierPaymentTerm,
  validateSupplierPhone,
  validateSupplierPic,
  validateSupplierPicAddress,
  validateSupplierPicEmail,
  validateSupplierPicPhone,
  validateSupplierPostalCode,
  validateSupplierProvince,
  validateSupplierStreet,
  validateSupplierWebsite,
  validateSupplierWhatsapp,
  SUPPLIER_MAX_BANK_ACCOUNTS,
} from "@/utils/validation";
import type { SupplierEntityType, SupplierType } from "@/types/api";

import { useSupplierCategoryOptions } from "../hooks/useSupplierCategoryOptions";
import { useSupplierAccountOptions } from "../hooks/useSupplierAccountOptions";
import { useSupplierBranchOptions } from "../hooks/useSupplierBranchOptions";

/**
 * The fields shared by the create and edit supplier forms.
 *
 * Extracted rather than duplicated: the two forms differ in what they SUBMIT (a
 * POST of everything versus a PATCH of what changed) and in whether they can
 * deactivate, but the inputs themselves are identical, and two copies of a
 * thirty-field form is how a validation rule ends up applied on one screen and
 * not the other.
 *
 * FIVE CARDS, GROUPED BY THE QUESTION EACH ANSWERS rather than by how the data
 * is stored:
 *
 *   Info Umum          who the vendor is and what identifies them — plus the
 *                      channels somebody reaches the COMPANY on. Contact details
 *                      sit here rather than in a card of their own because a
 *                      clerk reading a supplier reads the name and the phone
 *                      number in one glance.
 *   Info Lainnya       where to send the money, what kind of vendor this is, and
 *                      which branches may use them.
 *   Akun Pembelian     where their debt lands in the ledger. Its own card
 *                      because it is the one section a purchasing clerk should
 *                      NOT touch without an accountant, and a heading is the
 *                      cheapest way to say so.
 *   Rekening Bank      the vendor's bank accounts — a small editable table.
 *   Penanggung Jawab   the PERSON at the vendor, as opposed to the company.
 *
 * EVERY SCALAR VALUE IS A STRING, including the numeric term and the account
 * ids. That is the app's existing pattern (see CustomerCreateForm): an input's
 * value is a string, and converting at the submit boundary means one place to
 * get it wrong instead of one per keystroke. The three exceptions earn it —
 * `allBranches` is a checkbox, and `branchIds` and `bankAccounts` are lists.
 */
export interface SupplierFormValues {
  // ── Info Umum ────────────────────────────────────────────────────────────
  name: string;
  code: string;
  paymentTermDays: string;
  npwp: string;
  categoryId: string;
  phone: string;
  whatsapp: string;
  email: string;
  fax: string;
  website: string;

  // ── Info Lainnya ─────────────────────────────────────────────────────────
  address: {
    street: string;
    city: string;
    postalCode: string;
    province: string;
    country: string;
  };
  entityType: string;
  /** The cooperation model — a different axis from `entityType`. See below. */
  type: SupplierType;
  allBranches: boolean;
  branchIds: string[];
  notes: string;

  // ── Akun Pembelian ───────────────────────────────────────────────────────
  payableAccountId: string;
  advanceAccountId: string;

  // ── Rekening Bank ────────────────────────────────────────────────────────
  bankAccounts: BankAccountDraft[];

  // ── Penanggung Jawab ─────────────────────────────────────────────────────
  pic: {
    name: string;
    email: string;
    address: string;
    phone: string;
  };
}

/**
 * A bank row while it is being edited.
 *
 * `key` IS A CLIENT-SIDE ROW IDENTITY, not the server's `_id`, and it exists for
 * one reason: React needs a stable key, and a row the user has just added has no
 * `_id` yet. Keying by array index instead would make React reuse the wrong
 * input when a row is deleted from the middle — the classic symptom being the
 * text of row 3 appearing in row 2 after a removal. It is never sent.
 */
export interface BankAccountDraft {
  key: string;
  accountNumber: string;
  accountHolder: string;
  bankName: string;
}

/** The value the optional pickers show for "not recorded". */
const NONE = "__none__";

/**
 * The cooperation model, spelled out. The hint under each is not decoration: it
 * is the difference between goods that create a debt on arrival and goods that
 * do not, and choosing wrong is only discovered weeks later as a payable nobody
 * expected.
 */
export const SUPPLIER_TYPES: Array<{
  value: SupplierType;
  label: string;
  hint: string;
}> = [
  {
    value: "beli_putus",
    label: "Beli putus",
    hint: "Barang jadi milik toko saat diterima — penerimaan membuat faktur utang.",
  },
  {
    value: "konsinyasi",
    label: "Konsinyasi",
    hint: "Barang dititipkan; masih milik supplier sampai laku. Tidak membuat utang saat diterima.",
  },
  {
    value: "both",
    label: "Keduanya",
    hint: "Tipe ditentukan per penerimaan.",
  },
];

/**
 * The vendor's legal form — a DIFFERENT question from the cooperation model
 * above, and the hints say so, because both are called "tipe supplier" out loud.
 * What it decides in practice is whether a faktur pajak is expected at all: an
 * individual supplier typically has no NPWP and purchasing should not chase one.
 */
export const SUPPLIER_ENTITY_TYPES: Array<{
  value: SupplierEntityType;
  label: string;
}> = [
  { value: "perusahaan", label: "Perusahaan" },
  { value: "perorangan", label: "Perorangan" },
];

/** A fresh, empty bank row. */
export function emptyBankAccount(): BankAccountDraft {
  return {
    // `crypto.randomUUID` is available in every browser this app supports and in
    // jsdom; the fallback keeps a non-secure context (an IP-address dev server)
    // from throwing on what is only ever a React key.
    key:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `row-${Math.random().toString(36).slice(2)}`,
    accountNumber: "",
    accountHolder: "",
    bankName: "",
  };
}

export function SupplierFormFields({
  values,
  errors,
  disabled = false,
  onChange,
}: {
  values: SupplierFormValues;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (patch: Partial<SupplierFormValues>) => void;
}) {
  const activeType = SUPPLIER_TYPES.find((type) => type.value === values.type);

  // Passing the current selection in keeps a retired label visible on a
  // supplier already filed under it — see the hook.
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
  } = useSupplierCategoryOptions(values.categoryId || null);

  const accounts = useSupplierAccountOptions();
  const {
    branches,
    loading: branchesLoading,
    error: branchesError,
  } = useSupplierBranchOptions();

  /** Merge one part of the address without disturbing the others. */
  function patchAddress(part: Partial<SupplierFormValues["address"]>) {
    onChange({ address: { ...values.address, ...part } });
  }

  function patchPic(part: Partial<SupplierFormValues["pic"]>) {
    onChange({ pic: { ...values.pic, ...part } });
  }

  return (
    <>
      <Card title="Info Umum">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nama supplier"
              name="name"
              value={values.name}
              onChange={(event) => onChange({ name: event.target.value })}
              error={errors.name}
              placeholder="PT Sumber Pakan Sejahtera"
              disabled={disabled}
              required
            />

            <TextField
              label="ID Pemasok"
              name="code"
              value={values.code}
              onChange={(event) => onChange({ code: event.target.value })}
              error={errors.code}
              placeholder="SUP-001"
              // Not generated: most tenants already have a code for this vendor
              // in whatever they are migrating off, and inventing a second one
              // would put two identifiers on one supplier.
              hint="Kode internal Anda untuk supplier ini. Harus unik."
              disabled={disabled}
              className="uppercase"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Termin pembayaran"
              name="paymentTermDays"
              inputMode="numeric"
              value={values.paymentTermDays}
              onChange={(event) =>
                onChange({ paymentTermDays: event.target.value })
              }
              error={errors.paymentTermDays}
              // The field that quietly drives the payables screen: it is what
              // turns an invoice date into a due date, and therefore what
              // decides which rows show up as overdue.
              hint="Hari sampai jatuh tempo. 0 = bayar saat terima."
              disabled={disabled}
              required
            />

            <TextField
              label="NPWP"
              name="npwp"
              value={values.npwp}
              onChange={(event) => onChange({ npwp: event.target.value })}
              error={errors.npwp}
              className="tabular-nums"
              placeholder="01.234.567.8-901.000"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="No telp bisnis"
              name="phone"
              type="tel"
              value={values.phone}
              onChange={(event) => onChange({ phone: event.target.value })}
              error={errors.phone}
              placeholder="031-8877-221"
              // The server rewrites every number to +62… on save, so the user is
              // free to type whichever form is in front of them.
              hint="Boleh ditulis 0812…, +62812… atau 62812… — disimpan seragam."
              disabled={disabled}
            />
            <TextField
              label="No WhatsApp bisnis"
              name="whatsapp"
              type="tel"
              value={values.whatsapp}
              onChange={(event) => onChange({ whatsapp: event.target.value })}
              error={errors.whatsapp}
              placeholder="0812-3456-7890"
              hint="Sering beda dengan telepon kantor — isi nomor yang benar-benar dibalas."
              disabled={disabled}
            />
            <TextField
              label="Email"
              name="email"
              type="email"
              value={values.email}
              onChange={(event) => onChange({ email: event.target.value })}
              error={errors.email}
              placeholder="sales@supplier.co.id"
              disabled={disabled}
            />
            <TextField
              label="Faximili"
              name="fax"
              type="tel"
              value={values.fax}
              onChange={(event) => onChange({ fax: event.target.value })}
              error={errors.fax}
              placeholder="031-8877-222"
              disabled={disabled}
            />
          </div>

          {/*
            Kategori sits beside Website rather than on a row of its own. Both
            are one-line optional fields, and the select's own wrapper is the
            same `flex flex-col gap-1.5` a TextField renders internally — so the
            two columns line up label-to-label and hint-to-hint with no extra
            alignment. The select's loading and error states swap in at the same
            height as an input, so the row does not jump while the list arrives.
          */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-category">Kategori</Label>

              {categoriesError ? (
                <Alert variant="error">{categoriesError}</Alert>
              ) : categoriesLoading ? (
                <div className="flex h-9 items-center gap-2 text-sm text-muted">
                  <Spinner size={16} /> Memuat kategori supplier…
                </div>
              ) : (
                <Select
                  value={values.categoryId || NONE}
                  disabled={disabled}
                  onValueChange={(value) =>
                    onChange({ categoryId: value === NONE ? "" : value })
                  }
                >
                  <SelectTrigger
                    id="supplier-category"
                    aria-label="Kategori"
                    aria-invalid={errors.categoryId ? true : undefined}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Tanpa kategori</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {category.name}
                        {!category.isActive && " (nonaktif)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {errors.categoryId ? (
                <p role="alert" className="text-xs text-danger">
                  {errors.categoryId}
                </p>
              ) : (
                !categoriesLoading &&
                !categoriesError &&
                categories.length === 0 && (
                  <p className="text-xs text-muted">
                    Belum ada kategori supplier. Buat dulu di menu Kategori
                    supplier kalau mau mengelompokkan.
                  </p>
                )
              )}
            </div>

            <TextField
              label="Website"
              name="website"
              value={values.website}
              onChange={(event) => onChange({ website: event.target.value })}
              error={errors.website}
              placeholder="sumberpangan.co.id"
              hint="Tanpa https:// juga boleh."
              disabled={disabled}
            />
          </div>
        </div>
      </Card>

      <Card title="Info Lainnya">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Alamat Pembayaran</p>
            <p className="-mt-2 text-xs text-muted">
              Alamat tujuan faktur dan bukti pembayaran.
            </p>

            <TextField
              label="Jalan"
              name="address.street"
              value={values.address.street}
              onChange={(event) => patchAddress({ street: event.target.value })}
              error={errors["address.street"]}
              placeholder="Jl. Rungkut Industri 21"
              disabled={disabled}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Kota"
                name="address.city"
                value={values.address.city}
                onChange={(event) => patchAddress({ city: event.target.value })}
                error={errors["address.city"]}
                placeholder="Surabaya"
                disabled={disabled}
              />
              <TextField
                label="Kode pos"
                name="address.postalCode"
                inputMode="numeric"
                value={values.address.postalCode}
                onChange={(event) =>
                  patchAddress({ postalCode: event.target.value })
                }
                error={errors["address.postalCode"]}
                className="tabular-nums"
                placeholder="60293"
                disabled={disabled}
              />
              <TextField
                label="Provinsi"
                name="address.province"
                value={values.address.province}
                onChange={(event) =>
                  patchAddress({ province: event.target.value })
                }
                error={errors["address.province"]}
                placeholder="Jawa Timur"
                disabled={disabled}
              />
              <TextField
                label="Negara"
                name="address.country"
                value={values.address.country}
                onChange={(event) =>
                  patchAddress({ country: event.target.value })
                }
                error={errors["address.country"]}
                // No default. Pre-filling "Indonesia" would be an assertion the
                // user never made, and indistinguishable from one they did.
                placeholder="Indonesia"
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-entity-type">Tipe pemasok</Label>
              <Select
                value={values.entityType || NONE}
                disabled={disabled}
                onValueChange={(value) =>
                  onChange({ entityType: value === NONE ? "" : value })
                }
              >
                <SelectTrigger
                  id="supplier-entity-type"
                  aria-label="Tipe pemasok"
                  aria-invalid={errors.entityType ? true : undefined}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Belum ditentukan</SelectItem>
                  {SUPPLIER_ENTITY_TYPES.map((entityType) => (
                    <SelectItem key={entityType.value} value={entityType.value}>
                      {entityType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted">
                Badan usaha atau perorangan. Bukan tipe kerja sama di sebelah.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-type">
                Tipe kerja sama<span className="text-danger"> *</span>
              </Label>
              <Select
                value={values.type}
                disabled={disabled}
                onValueChange={(value) =>
                  onChange({ type: value as SupplierType })
                }
              >
                <SelectTrigger
                  id="supplier-type"
                  aria-label="Tipe kerja sama"
                  aria-invalid={errors.type ? true : undefined}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLIER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type ? (
                <p role="alert" className="text-xs text-danger">
                  {errors.type}
                </p>
              ) : (
                activeType && (
                  <p className="text-xs text-muted">{activeType.hint}</p>
                )
              )}
            </div>
          </div>

          <SupplierBranchScope
            branches={branches}
            loading={branchesLoading}
            loadError={branchesError}
            allBranches={values.allBranches}
            branchIds={values.branchIds}
            error={errors.branchIds}
            disabled={disabled}
            onChange={onChange}
          />

          <TextField
            label="Catatan"
            name="notes"
            value={values.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            error={errors.notes}
            placeholder="opsional"
            disabled={disabled}
          />
        </div>
      </Card>

      <Card title="Akun Pembelian">
        <p className="mb-4 text-xs text-muted">
          Isi hanya kalau Anda ingin utang/uang muka supplier ini masuk ke akun
          tersendiri, bukan akun default. Kosongkan kalau ragu — jurnalnya tetap
          jalan memakai akun bawaan.
        </p>

        {accounts.error ? (
          /*
            403 is the ONE status that genuinely is a permissions answer;
            everything else gets the server's own message. The product form
            learned this the hard way — it reported "no Accounting access" for
            any failure at all, and the first real failure was a malformed
            request from our own service layer. The screen was confidently wrong
            and sent people looking at RBAC instead of at the bug.
          */
          <p className="rounded-lg border border-secondary/40 bg-secondary/15 px-3 py-2 text-xs">
            {accounts.error.status === 403 ? (
              <>
                Role Anda tidak punya akses ke Akuntansi, jadi daftar akun tidak
                bisa dimuat.
              </>
            ) : (
              <>
                Daftar akun gagal dimuat
                {accounts.error.status > 0 && ` (${accounts.error.status})`}:{" "}
                {accounts.error.message}
              </>
            )}{" "}
            Supplier tetap bisa disimpan tanpa itu.
          </p>
        ) : accounts.loading ? (
          <div className="flex h-9 items-center gap-2 text-sm text-muted">
            <Spinner size={16} /> Memuat daftar akun…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AccountPicker
              id="payableAccountId"
              label="Akun Utang"
              value={values.payableAccountId}
              accounts={accounts.payableAccounts}
              error={errors.payableAccountId}
              disabled={disabled}
              emptyLabel="Belum ada akun kewajiban"
              defaultLabel="2101 — Utang Supplier (default)"
              hint="Hanya akun bertipe kewajiban. Dipakai saat penerimaan barang, retur, dan pembayaran faktur."
              onChange={(next) => onChange({ payableAccountId: next })}
            />
            <AccountPicker
              id="advanceAccountId"
              label="Akun Uang Muka"
              value={values.advanceAccountId}
              accounts={accounts.advanceAccounts}
              error={errors.advanceAccountId}
              disabled={disabled}
              emptyLabel="Belum ada akun aset"
              defaultLabel="Akun uang muka bawaan"
              hint="Hanya akun bertipe aset — uang muka adalah uang yang sudah keluar tapi belum terpakai."
              onChange={(next) => onChange({ advanceAccountId: next })}
            />
          </div>
        )}
      </Card>

      <BankAccountsCard
        rows={values.bankAccounts}
        errors={errors}
        disabled={disabled}
        onChange={(bankAccounts) => onChange({ bankAccounts })}
      />

      <Card title="Penanggung Jawab">
        <p className="mb-4 text-xs text-muted">
          Orang di pihak supplier yang dihubungi kalau kiriman kurang atau
          terlambat. Bukan pengguna PawCRM.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nama"
            name="pic.name"
            value={values.pic.name}
            onChange={(event) => patchPic({ name: event.target.value })}
            error={errors["pic.name"]}
            placeholder="Pak Hendra"
            disabled={disabled}
          />
          <TextField
            label="No HP"
            name="pic.phone"
            type="tel"
            value={values.pic.phone}
            onChange={(event) => patchPic({ phone: event.target.value })}
            error={errors["pic.phone"]}
            placeholder="0812-3456-7891"
            disabled={disabled}
          />
          <TextField
            label="Email"
            name="pic.email"
            type="email"
            value={values.pic.email}
            onChange={(event) => patchPic({ email: event.target.value })}
            error={errors["pic.email"]}
            placeholder="hendra@supplier.co.id"
            disabled={disabled}
          />
          <TextField
            label="Alamat"
            name="pic.address"
            value={values.pic.address}
            onChange={(event) => patchPic({ address: event.target.value })}
            error={errors["pic.address"]}
            placeholder="opsional"
            disabled={disabled}
          />
        </div>
      </Card>
    </>
  );
}

/**
 * One posting-override picker.
 *
 * `NONE` IS A REAL OPTION and it means "use the default account", which is a
 * choice rather than a blank. Radix Select forbids `value=""` anyway, but the
 * copy is the point: an empty trigger would read as a field somebody forgot.
 */
function AccountPicker({
  id,
  label,
  value,
  accounts,
  error,
  disabled,
  emptyLabel,
  defaultLabel,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  accounts: Array<{ _id: string; code: string; name: string }>;
  error?: string;
  disabled: boolean;
  emptyLabel: string;
  defaultLabel: string;
  hint: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || NONE}
        disabled={disabled || accounts.length === 0}
        onValueChange={(next) => onChange(next === NONE ? "" : next)}
      >
        {/* shadcn's SelectTrigger defaults to w-fit, which collapses in a form
            column — the same note CategoryParentField carries. */}
        <SelectTrigger
          id={id}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          className="w-full"
        >
          <SelectValue
            placeholder={accounts.length === 0 ? emptyLabel : defaultLabel}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{defaultLabel}</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account._id} value={account._id}>
              {account.code} — {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

/**
 * Which branches may choose this supplier.
 *
 * A CHECKBOX PLUS A LIST, not a multi-select, and it mirrors `BranchScopeField`
 * on the user form. "Every branch" is a genuinely different answer from "these
 * five", not a shortcut for one — it keeps meaning every branch as new ones
 * open — so it gets a control of its own rather than being expressible only by
 * ticking everything.
 *
 * TICKING "SEMUA CABANG" DROPS THE LIST, matching what the server stores: a
 * leftover list is a trap the day the box is unticked, because the supplier
 * would silently reappear in exactly the branches somebody picked months ago.
 */
function SupplierBranchScope({
  branches,
  loading,
  loadError,
  allBranches,
  branchIds,
  error,
  disabled,
  onChange,
}: {
  branches: Array<{ _id: string; name: string }>;
  loading: boolean;
  loadError: string | null;
  allBranches: boolean;
  branchIds: string[];
  error?: string;
  disabled: boolean;
  onChange: (patch: Partial<SupplierFormValues>) => void;
}) {
  function toggleBranch(branchId: string, checked: boolean) {
    onChange({
      allBranches: false,
      branchIds: checked
        ? [...branchIds, branchId]
        : branchIds.filter((id) => id !== branchId),
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <p className="text-sm font-medium">Dipakai di cabang</p>

      <div className="flex items-start gap-3">
        <Checkbox
          id="supplier-all-branches"
          checked={allBranches}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({
              allBranches: checked === true,
              // Cleared rather than kept — see the header.
              ...(checked === true ? { branchIds: [] } : {}),
            })
          }
        />
        <div>
          <Label htmlFor="supplier-all-branches" className="font-normal">
            Semua cabang
          </Label>
          <p className="mt-1 text-xs text-muted">
            Termasuk cabang yang dibuka nanti. Hilangkan centang kalau supplier
            ini hanya melayani sebagian cabang.
          </p>
        </div>
      </div>

      {!allBranches &&
        (loadError ? (
          // Reported beside the field rather than as a banner: the supplier
          // saves perfectly well on "Semua cabang", which is what the schema
          // defaults to and the only safe answer when the list cannot be seen.
          <p className="text-xs text-danger">
            {loadError} Centang “Semua cabang” untuk melanjutkan.
          </p>
        ) : loading ? (
          <div className="flex h-9 items-center gap-2 text-sm text-muted">
            <Spinner size={16} /> Memuat cabang…
          </div>
        ) : branches.length === 0 ? (
          <p className="text-xs text-muted">
            Belum ada cabang yang bisa dipilih. Centang “Semua cabang”.
          </p>
        ) : (
          <div className="ml-7 flex flex-col gap-2">
            {branches.map((branch) => (
              <div key={branch._id} className="flex items-center gap-3">
                <Checkbox
                  id={`supplier-branch-${branch._id}`}
                  checked={branchIds.includes(branch._id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    toggleBranch(branch._id, checked === true)
                  }
                />
                <Label
                  htmlFor={`supplier-branch-${branch._id}`}
                  className="font-normal"
                >
                  {branch.name}
                </Label>
              </div>
            ))}
          </div>
        ))}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The vendor's bank accounts — a small table the user edits in place.
 *
 * EDITED IN PLACE RATHER THAN THROUGH A DIALOG. A vendor with two accounts is
 * comparing them ("the BCA one is for invoices, the Mandiri one for the
 * principal"), and a modal hides exactly the comparison it was opened to make.
 * It is also the cheapest thing that works: one array, no new component.
 *
 * THE WHOLE LIST IS REPLACED ON SAVE, which is the API's contract. Two people
 * editing the table at once overwrite each other — the same trade every other
 * array field in this API makes, and an acceptable one for a table that changes
 * a few times a year.
 */
function BankAccountsCard({
  rows,
  errors,
  disabled,
  onChange,
}: {
  rows: BankAccountDraft[];
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (rows: BankAccountDraft[]) => void;
}) {
  const atCap = rows.length >= SUPPLIER_MAX_BANK_ACCOUNTS;

  function patchRow(key: string, part: Partial<BankAccountDraft>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...part } : row)));
  }

  return (
    <Card title="Rekening Bank">
      <div className="flex flex-col gap-3">
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || atCap}
            onClick={() => onChange([...rows, emptyBankAccount()])}
            aria-label="Tambah rekening"
          >
            <Plus className="size-4" />
            Tambah rekening
          </Button>
          {atCap && (
            <p className="mt-1 text-xs text-muted">
              Maksimal {SUPPLIER_MAX_BANK_ACCOUNTS} rekening per supplier.
            </p>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No Rekening</TableHead>
                <TableHead>Atas Nama</TableHead>
                <TableHead>Nama Bank</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-sm text-muted"
                  >
                    Belum ada data
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.key}>
                    <TableCell>
                      <TextField
                        label="No Rekening"
                        // The label is visually redundant beside the column
                        // header but not to a screen reader, which reads a cell
                        // without its header when it lands on the input.
                        className="tabular-nums"
                        aria-label={`No rekening baris ${index + 1}`}
                        value={row.accountNumber}
                        onChange={(event) =>
                          patchRow(row.key, {
                            accountNumber: event.target.value,
                          })
                        }
                        error={errors[`bankAccounts.${index}.accountNumber`]}
                        placeholder="123-456-7890"
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        label="Atas Nama"
                        aria-label={`Atas nama baris ${index + 1}`}
                        value={row.accountHolder}
                        onChange={(event) =>
                          patchRow(row.key, {
                            accountHolder: event.target.value,
                          })
                        }
                        error={errors[`bankAccounts.${index}.accountHolder`]}
                        placeholder="PT Sumber Pakan Sejahtera"
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        label="Nama Bank"
                        aria-label={`Nama bank baris ${index + 1}`}
                        value={row.bankName}
                        onChange={(event) =>
                          patchRow(row.key, { bankName: event.target.value })
                        }
                        error={errors[`bankAccounts.${index}.bankName`]}
                        placeholder="BCA"
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        aria-label={`Hapus rekening baris ${index + 1}`}
                        onClick={() =>
                          onChange(rows.filter((other) => other.key !== row.key))
                        }
                      >
                        <Trash2 className="size-4 text-danger" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted">
          Nomor rekening disimpan persis seperti yang Anda ketik — format bank
          sendiri yang jadi acuan. Pastikan “Atas Nama” sama dengan yang tertera
          di faktur supplier.
        </p>
      </div>
    </Card>
  );
}

/**
 * Runs every field validator; returns the errors keyed by field name — the same
 * key `ApiError.fieldErrors` uses, so a client error and a server one land in
 * the same slot and the form needs only one error state.
 *
 * NESTED FIELDS ARE KEYED BY THEIR DOTTED PATH (`pic.email`,
 * `bankAccounts.0.bankName`), which is exactly what the API sends back in
 * `details` — so a 400 from the server drops onto the same input a client-side
 * refusal would.
 *
 * The client rules are a nicety, not the authority: every one also runs on the
 * server, and the ones that cannot run here at all — a duplicate name, a
 * duplicate code, a category that is not a supplier category, an account of the
 * wrong type — come back as a 409 or a 400 the caller maps in.
 */
export function validateSupplierForm(
  values: SupplierFormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};

  const checks: Array<[string, string | undefined]> = [
    ["name", validateSupplierName(values.name)],
    ["code", validateSupplierCodeRequired(values.code)],
    ["paymentTermDays", validateSupplierPaymentTerm(values.paymentTermDays)],
    ["npwp", validateSupplierNpwp(values.npwp)],
    ["phone", validateSupplierPhone(values.phone)],
    ["whatsapp", validateSupplierWhatsapp(values.whatsapp)],
    ["email", validateSupplierEmail(values.email)],
    ["fax", validateSupplierFax(values.fax)],
    ["website", validateSupplierWebsite(values.website)],
    ["notes", validateSupplierNotes(values.notes)],

    ["address.street", validateSupplierStreet(values.address.street)],
    ["address.city", validateSupplierCity(values.address.city)],
    ["address.postalCode", validateSupplierPostalCode(values.address.postalCode)],
    ["address.province", validateSupplierProvince(values.address.province)],
    ["address.country", validateSupplierCountry(values.address.country)],

    ["pic.name", validateSupplierPic(values.pic.name)],
    ["pic.email", validateSupplierPicEmail(values.pic.email)],
    ["pic.address", validateSupplierPicAddress(values.pic.address)],
    ["pic.phone", validateSupplierPicPhone(values.pic.phone)],
  ];

  checks.forEach(([field, message]) => {
    if (message) errors[field] = message;
  });

  /**
   * A supplier narrowed to NO branch is refused here as well as by the server.
   * It is not a harmless empty state: the vendor vanishes from every purchasing
   * screen while looking perfectly healthy on its own page.
   */
  if (!values.allBranches && values.branchIds.length === 0) {
    errors.branchIds = "Pilih minimal satu cabang, atau centang Semua cabang";
  }

  values.bankAccounts.forEach((row, index) => {
    Object.entries(validateSupplierBankAccount(row)).forEach(
      ([field, message]) => {
        errors[`bankAccounts.${index}.${field}`] = message;
      },
    );
  });

  return errors;
}

/**
 * Trims a value and returns `null` for the empty case — the payload shape the
 * API expects for a clearable field. `""` would be stored as neither absent nor
 * present; `null` means "no value", which is what an emptied input meant.
 */
export function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
