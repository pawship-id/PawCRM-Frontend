import { normalizePhone } from "@/utils/validation";
import type {
  CreateSupplierInput,
  Supplier,
  SupplierBankAccountInput,
  UpdateSupplierInput,
} from "@/types/api";

import {
  emptyBankAccount,
  orNull,
  type BankAccountDraft,
  type SupplierFormValues,
} from "./SupplierFormFields";

/**
 * The FE ↔ BE mapping for a supplier, in one place.
 *
 * WHY THIS IS A MODULE AND NOT TWO COPIES INSIDE THE FORMS. The create form
 * sends everything and the edit form sends only what changed, so the two look
 * like different jobs — but they share the part that is easy to get wrong and
 * silent when you do: which fields are trimmed, which are nulled when empty,
 * which are numbers, and which are objects that must be compared part by part.
 * A supplier has thirty of those now. Two copies is how one form starts sending
 * `""` where the other sends `null`.
 *
 * NOTHING HERE FORMATS A PHONE NUMBER FOR STORAGE. The server normalizes to
 * E.164, and a second implementation on this side would be free to disagree with
 * the authority for every number a tenant enters. `normalizePhone` is used only
 * to COMPARE — see `phoneChanged`.
 */

/** A stored supplier, as the form's string-shaped state. */
export function toFormValues(supplier: Supplier): SupplierFormValues {
  return {
    name: supplier.name,
    code: supplier.code ?? "",
    paymentTermDays: String(supplier.paymentTermDays),
    npwp: supplier.npwp ?? "",
    categoryId: supplier.categoryId ?? "",
    phone: supplier.phone ?? "",
    whatsapp: supplier.whatsapp ?? "",
    email: supplier.email ?? "",
    fax: supplier.fax ?? "",
    website: supplier.website ?? "",

    /**
     * `?? {}` BEFORE EVERY PART, not only `?? ""` on each one.
     *
     * The API sends `address` as an object of nulls for a vendor with no address
     * — but a supplier read from an older cached response, or a partially built
     * test fixture, may not carry the key at all. Reaching straight for
     * `supplier.address.city` would throw on exactly those, and the screen this
     * form is on would white-page rather than render an empty input.
     */
    address: {
      street: supplier.address?.street ?? "",
      city: supplier.address?.city ?? "",
      postalCode: supplier.address?.postalCode ?? "",
      province: supplier.address?.province ?? "",
      country: supplier.address?.country ?? "",
    },
    entityType: supplier.entityType ?? "",
    type: supplier.type,
    // Absent means "everywhere", matching the schema default — a supplier
    // written before the field existed was available in every branch.
    allBranches: supplier.allBranches ?? true,
    branchIds: supplier.branchIds ?? [],
    notes: supplier.notes ?? "",

    payableAccountId: supplier.payableAccountId ?? "",
    advanceAccountId: supplier.advanceAccountId ?? "",

    bankAccounts: (supplier.bankAccounts ?? []).map((row) => ({
      // The SERVER's id becomes the row key, so a row that survives a save keeps
      // its React identity and the input it is focused in does not lose focus.
      key: row._id,
      accountNumber: row.accountNumber,
      accountHolder: row.accountHolder,
      bankName: row.bankName,
    })),

    pic: {
      name: supplier.pic?.name ?? "",
      email: supplier.pic?.email ?? "",
      address: supplier.pic?.address ?? "",
      phone: supplier.pic?.phone ?? "",
    },
  };
}

/** The form's blank state for a supplier that does not exist yet. */
export function emptyFormValues(): SupplierFormValues {
  return {
    name: "",
    code: "",
    paymentTermDays: "30",
    npwp: "",
    categoryId: "",
    phone: "",
    whatsapp: "",
    email: "",
    fax: "",
    website: "",
    address: {
      street: "",
      city: "",
      postalCode: "",
      province: "",
      country: "",
    },
    entityType: "",
    type: "beli_putus",
    allBranches: true,
    branchIds: [],
    notes: "",
    payableAccountId: "",
    advanceAccountId: "",
    bankAccounts: [],
    pic: { name: "", email: "", address: "", phone: "" },
  };
}

/** Re-exported so a form can add a row without importing two modules. */
export { emptyBankAccount };
export type { BankAccountDraft };

/** The bank table, as the API's row shape. `key` is client-side and dropped. */
function toBankAccounts(
  rows: BankAccountDraft[],
): SupplierBankAccountInput[] {
  return rows.map((row) => ({
    accountNumber: row.accountNumber.trim(),
    accountHolder: row.accountHolder.trim(),
    bankName: row.bankName.trim(),
  }));
}

/**
 * The whole form, as a create payload.
 *
 * `code` and `paymentTermDays` go up as a plain string and a number rather than
 * through `orNull`: both are required, and the validator has already refused an
 * empty one, so nulling them here could only turn a caught error into a 400.
 */
export function toSupplierPayload(
  values: SupplierFormValues,
): CreateSupplierInput {
  return {
    name: values.name.trim(),
    type: values.type,
    code: values.code.trim(),
    paymentTermDays: Number(values.paymentTermDays.trim()),
    categoryId: orNull(values.categoryId),
    entityType: orNull(values.entityType) as CreateSupplierInput["entityType"],
    payableAccountId: orNull(values.payableAccountId),
    advanceAccountId: orNull(values.advanceAccountId),
    allBranches: values.allBranches,
    // Sent even when empty: `allBranches: true` pairs with an empty list, and
    // the server drops any ids sent alongside the flag anyway.
    branchIds: values.allBranches ? [] : values.branchIds,
    bankAccounts: toBankAccounts(values.bankAccounts),
    pic: {
      name: orNull(values.pic.name),
      email: orNull(values.pic.email),
      address: orNull(values.pic.address),
      // AS TYPED. The server normalizes to E.164; pre-formatting here would be a
      // second implementation of that rule, free to disagree with the authority.
      phone: orNull(values.pic.phone),
    },
    address: {
      street: orNull(values.address.street),
      city: orNull(values.address.city),
      postalCode: orNull(values.address.postalCode),
      province: orNull(values.address.province),
      country: orNull(values.address.country),
    },
    phone: orNull(values.phone),
    whatsapp: orNull(values.whatsapp),
    fax: orNull(values.fax),
    // Sent without a scheme when the user typed none; the server prepends
    // https:// so the stored value is safe to use as an href.
    website: orNull(values.website),
    email: orNull(values.email),
    // Whitespace stripped, matching what the server stores — otherwise the
    // duplicate check would compare two spellings of one tax number.
    npwp: orNull(values.npwp.replace(/\s+/g, "")),
    notes: orNull(values.notes),
  };
}

/**
 * Whether a phone field actually changed — compared in the CANONICAL form, not
 * as typed.
 *
 * The server stores "+6281234567890"; the form shows it; a user who retypes it
 * as "0812-3456-7890" has changed nothing, and a naive string compare would
 * disagree. Sending that non-change is not merely wasteful: every field in a
 * PATCH is re-checked server-side, so it would make the server ask "does another
 * supplier hold this number" about a value nobody touched.
 */
function phoneChanged(typed: string, stored: string | null | undefined) {
  // `?? null` because a supplier stored before the field existed carries no key
  // at all — see the note on the `Supplier` type.
  return normalizePhone(orNull(typed)) !== normalizePhone(stored ?? null);
}

/** A nullable text field, or `undefined` when it matches what is stored. */
function textChange(typed: string, stored: string | null | undefined) {
  const next = orNull(typed);
  // `?? null`: absent and explicitly-null are one state to a user, and only one
  // of them is what the API sends for a field added after the record was written.
  return next === (stored ?? null) ? undefined : next;
}

/**
 * The form as a PATCH — only what differs from the stored supplier.
 *
 * ONLY WHAT CHANGED IS SENT, which is not micro-optimisation: the backend
 * rejects an empty body, every field it receives is re-checked for conflicts,
 * and two people editing different fields do not overwrite each other's work.
 *
 * THE THREE COMPOSITE FIELDS ARE ALL-OR-NOTHING, deliberately:
 *
 *   `pic` / `address` — sent whole when ANY part differs. The server flattens
 *     them to dot paths, so sending the whole object still merges rather than
 *     replaces; diffing part by part would save nothing and add five more
 *     comparisons to get wrong.
 *   `bankAccounts` — sent whole when the list differs at all. The API's contract
 *     is replace-the-array, so there is no partial form to send.
 *
 * THE BRANCH SCOPE IS SENT AS A PAIR whenever either half differs. They are two
 * halves of one setting, and sending `allBranches: false` without the list would
 * make the server validate against the STORED list, which is not what the user
 * just picked.
 */
export function toSupplierPatch(
  values: SupplierFormValues,
  supplier: Supplier,
): UpdateSupplierInput {
  const code = values.code.trim();
  const term = Number(values.paymentTermDays.trim());
  const npwp = orNull(values.npwp.replace(/\s+/g, ""));

  const picChanged =
    orNull(values.pic.name) !== (supplier.pic?.name ?? null) ||
    orNull(values.pic.email) !== (supplier.pic?.email ?? null) ||
    orNull(values.pic.address) !== (supplier.pic?.address ?? null) ||
    phoneChanged(values.pic.phone, supplier.pic?.phone);

  const addressChanged = (
    ["street", "city", "postalCode", "province", "country"] as const
  ).some(
    (part) =>
      orNull(values.address[part]) !== (supplier.address?.[part] ?? null),
  );

  const storedBank = supplier.bankAccounts ?? [];
  const nextBank = toBankAccounts(values.bankAccounts);
  const bankChanged =
    nextBank.length !== storedBank.length ||
    nextBank.some(
      (row, index) =>
        row.accountNumber !== storedBank[index].accountNumber ||
        row.accountHolder !== storedBank[index].accountHolder ||
        row.bankName !== storedBank[index].bankName,
    );

  const storedAllBranches = supplier.allBranches ?? true;
  const storedBranchIds = supplier.branchIds ?? [];
  const nextBranchIds = values.allBranches ? [] : values.branchIds;
  const scopeChanged =
    values.allBranches !== storedAllBranches ||
    nextBranchIds.length !== storedBranchIds.length ||
    nextBranchIds.some((id) => !storedBranchIds.includes(id));

  return {
    name: values.name.trim() === supplier.name ? undefined : values.name.trim(),
    type: values.type === supplier.type ? undefined : values.type,
    // `code` is never sent as null — it cannot be cleared once set, and the
    // validator has already refused an empty one.
    code: code === (supplier.code ?? "") ? undefined : code,
    categoryId: textChange(values.categoryId, supplier.categoryId),
    entityType: textChange(
      values.entityType,
      supplier.entityType,
    ) as UpdateSupplierInput["entityType"],
    payableAccountId: textChange(
      values.payableAccountId,
      supplier.payableAccountId,
    ),
    advanceAccountId: textChange(
      values.advanceAccountId,
      supplier.advanceAccountId,
    ),
    ...(scopeChanged
      ? { allBranches: values.allBranches, branchIds: nextBranchIds }
      : {}),
    ...(bankChanged ? { bankAccounts: nextBank } : {}),
    ...(picChanged
      ? {
          pic: {
            name: orNull(values.pic.name),
            email: orNull(values.pic.email),
            address: orNull(values.pic.address),
            phone: orNull(values.pic.phone),
          },
        }
      : {}),
    ...(addressChanged
      ? {
          address: {
            street: orNull(values.address.street),
            city: orNull(values.address.city),
            postalCode: orNull(values.address.postalCode),
            province: orNull(values.address.province),
            country: orNull(values.address.country),
          },
        }
      : {}),
    // The four numbers compare canonically rather than literally — see
    // `phoneChanged`. What is SENT is still what the user typed.
    phone: phoneChanged(values.phone, supplier.phone)
      ? orNull(values.phone)
      : undefined,
    whatsapp: phoneChanged(values.whatsapp, supplier.whatsapp)
      ? orNull(values.whatsapp)
      : undefined,
    fax: phoneChanged(values.fax, supplier.fax) ? orNull(values.fax) : undefined,
    website: textChange(values.website, supplier.website),
    email: textChange(values.email, supplier.email),
    npwp: npwp === (supplier.npwp ?? null) ? undefined : npwp,
    notes: textChange(values.notes, supplier.notes),
    paymentTermDays: term === supplier.paymentTermDays ? undefined : term,
  };
}
