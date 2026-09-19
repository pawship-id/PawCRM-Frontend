import type {
  AccountAllocation,
  AllocationType,
  ChartOfAccount,
} from "@/types/accounting";
import { isProfitLossAccount } from "@/types/accounting";

/**
 * How allocation rules are NAMED and how the choice of them NARROWS to the shape
 * of the tenant. Pure — no React, no requests — so the screen and the panel say
 * the same words without either importing the other.
 */

/** The full names, used wherever the tenant has more than one branch. */
export const ALLOCATION_TYPE_LABEL: Record<AllocationType, string> = {
  direct: "Direct",
  shared_lokasi: "Shared-Lokasi",
  shared_overall: "Shared-Overall",
};

/** What each one does, one line, for the picker and the explanation card. */
export const ALLOCATION_TYPE_HINT: Record<AllocationType, string> = {
  direct:
    "Ke satu lini. Kosongkan cabangnya supaya dibagi sesuai porsi pendapatan tiap cabang, atau pilih satu cabang untuk menguncinya di situ.",
  shared_lokasi:
    "Dibagi otomatis ke lini-lini yang aktif di cabang tempat transaksinya dicatat.",
  shared_overall: "Dibagi ke seluruh perusahaan, sesuai porsi pendapatan.",
};

/**
 * The SHAPE OF THE TENANT, which is what decides how much of this feature is
 * even shown. Two numbers, and every rule below reads from them.
 */
export interface TenantShape {
  lineCount: number;
  branchCount: number;
}

export function tenantShape(
  lineCount: number,
  branchCount: number,
): TenantShape {
  return { lineCount, branchCount };
}

/**
 * True when there is only one place for money to go, so nothing needs
 * allocating at all.
 *
 * The screen stops offering the whole feature here rather than offering a
 * choice with one option — a control whose only possible answer is already the
 * answer is a control that teaches people to ignore controls.
 */
export function needsNoAllocation(shape: TenantShape): boolean {
  return shape.lineCount <= 1 && shape.branchCount <= 1;
}

/**
 * The allocation types worth offering, given what the tenant actually runs.
 *
 * ONE CODE PATH, A SHORTER LIST — never a different screen. Both shared kinds
 * stay storable in every case; what changes is only what is worth asking.
 *
 *   one line    → Direct is dropped. There is no other line to send anything to,
 *                 so every rule is shared by definition.
 *   one branch  → Shared-Lokasi and Shared-Overall merge into a single "Shared".
 *                 They divide exactly the same set when there is one branch, so
 *                 two names for one outcome is a question with no right answer.
 *                 The value kept is `shared_overall`, which stays correct if the
 *                 tenant opens a second branch tomorrow.
 */
export function allocationChoices(
  shape: TenantShape,
): Array<{ value: AllocationType; label: string }> {
  const multiLine = shape.lineCount > 1;
  const multiBranch = shape.branchCount > 1;
  const choices: Array<{ value: AllocationType; label: string }> = [];

  if (multiLine) {
    choices.push({ value: "direct", label: ALLOCATION_TYPE_LABEL.direct });
  }

  if (multiBranch) {
    choices.push({
      value: "shared_lokasi",
      label: ALLOCATION_TYPE_LABEL.shared_lokasi,
    });
    choices.push({
      value: "shared_overall",
      label: ALLOCATION_TYPE_LABEL.shared_overall,
    });
  } else {
    choices.push({ value: "shared_overall", label: "Shared" });
  }

  return choices;
}

/**
 * Why the choices look shorter than the documentation says, in the tenant's own
 * terms. Null when nothing is being hidden.
 *
 * SHOWN RATHER THAN LEFT TO BE NOTICED. Somebody reading a guide that names
 * three allocation types and a screen that offers one has found a bug, not a
 * simplification — unless the screen says which it is.
 */
export function shapeNote(shape: TenantShape): string | null {
  const multiLine = shape.lineCount > 1;
  const multiBranch = shape.branchCount > 1;

  if (multiLine && multiBranch) return null;

  if (needsNoAllocation(shape)) {
    return "Tenant ini baru punya satu lini usaha dan satu cabang, jadi tidak ada yang perlu dibagi — semua pendapatan dan beban otomatis masuk ke satu-satunya segmen yang ada. Aturan alokasi muncul begitu lini atau cabang keduanya bertambah.";
  }

  if (!multiLine) {
    return "Tenant ini baru punya satu lini usaha, jadi pilihan Direct disembunyikan — tidak ada lini lain yang bisa dituju. Shared-Lokasi dan Shared-Overall tetap dua pilihan berbeda karena cabangnya lebih dari satu.";
  }

  return 'Tenant ini baru punya satu cabang, jadi Shared-Lokasi dan Shared-Overall digabung jadi satu pilihan "Shared" — hasil pembagiannya persis sama.';
}

/**
 * One rule as a sentence: "Direct → Grooming (Pusat)".
 *
 * Takes the name lookups rather than the ids, because a rule that renders an
 * ObjectId is a rule nobody can check. An id that resolves to nothing falls back
 * to a dash instead of the raw value — `businessLines:read` is its own grant,
 * and a row of hex is worse than a row of dashes.
 */
export function describeAllocation(
  rule: AccountAllocation,
  lineNames: Map<string, string>,
  branchNames: Map<string, string>,
  shape: TenantShape,
): string {
  if (rule.allocationType === "direct") {
    const line = lineNames.get(rule.businessLineId ?? "") ?? "—";
    const branch = rule.branchId ? branchNames.get(rule.branchId) : null;
    return branch ? `Direct → ${line} (${branch})` : `Direct → ${line}`;
  }

  // With one branch the two shared kinds are one thing, and the row says so.
  if (shape.branchCount <= 1) return "Shared";

  return ALLOCATION_TYPE_LABEL[rule.allocationType];
}

/** How many rules of each type an account carries, for the ">1 rule" summary. */
export function countByType(
  allocations: AccountAllocation[],
): Array<{ type: AllocationType; count: number }> {
  const counts = new Map<AllocationType, number>();

  for (const rule of allocations) {
    counts.set(rule.allocationType, (counts.get(rule.allocationType) ?? 0) + 1);
  }

  return [...counts.entries()].map(([type, count]) => ({ type, count }));
}

/** What the Aturan Alokasi cell is showing — one enum, so the screen never re-derives it. */
export type AllocationState =
  /** Not a laba rugi account. Cash has no line and never will. */
  | { kind: "notApplicable" }
  /** One line, one branch: nothing to divide. */
  | { kind: "notNeeded" }
  /** A P&L account nobody has mapped. The one state somebody must act on. */
  | { kind: "unmapped" }
  | { kind: "single"; rule: AccountAllocation }
  | { kind: "several"; allocations: AccountAllocation[] };

/**
 * Which of the five things a row's allocation cell is.
 *
 * ONE FUNCTION rather than a chain of ternaries at the call site, because the
 * first two states look identical on screen (a grey phrase, no chevron) and are
 * completely different facts — "this account can never have a line" versus "this
 * tenant does not need lines yet". Blurring them is how "Tidak berlaku" ends up
 * on a Beban account.
 */
export function allocationState(
  account: ChartOfAccount,
  shape: TenantShape,
): AllocationState {
  if (!isProfitLossAccount(account.accountCategory)) {
    return { kind: "notApplicable" };
  }
  if (needsNoAllocation(shape)) {
    return { kind: "notNeeded" };
  }

  const allocations = account.allocations ?? [];

  if (allocations.length === 0) return { kind: "unmapped" };
  if (allocations.length === 1) return { kind: "single", rule: allocations[0] };

  return { kind: "several", allocations };
}

/** Whether a row can be opened to edit its rules. */
export function canEditAllocations(state: AllocationState): boolean {
  return state.kind !== "notApplicable" && state.kind !== "notNeeded";
}

/**
 * A blank rule, for "+ Tambah Detil".
 *
 * Opens on the FIRST type the tenant can actually pick rather than always
 * `direct`: a single-line tenant has no Direct in its list, and a row that
 * starts on a value its own select does not offer reads as a broken control.
 *
 * The name is left EMPTY rather than pre-filled with the account's, so the field
 * shows its placeholder and the save says it is required. A pre-filled name is a
 * name nobody reads, and this one is what a person will later pick from when
 * recording a cost.
 */
export function blankAllocation(shape: TenantShape): AccountAllocation {
  return {
    name: "",
    allocationType: allocationChoices(shape)[0].value,
    businessLineId: null,
    branchId: null,
    isActive: true,
  };
}
