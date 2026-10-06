"use client";

import { useState } from "react";
import { History, Pencil, Plus, Trash2 } from "lucide-react";

import { Alert, ConfirmDialog, FilterSelect } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { subAccountService } from "@/services/subAccount.service";
import type {
  AllocationType,
  ChartOfAccount,
  SubAccount,
  SubAccountInput,
} from "@/types/accounting";

import {
  ALLOCATION_TYPE_HINT,
  ALLOCATION_TYPE_LABEL,
  allocationChoices,
  blankAllocation,
  type TenantShape,
} from "../allocationLabels";
import { SubAccountRemapDialog } from "./SubAccountRemapDialog";

/** Backend caps — SUB_CODE_MAX_LENGTH and ALLOCATION_NAME_MAX_LENGTH. */
const CODE_MAX_LENGTH = 30;
const NAME_MAX_LENGTH = 120;
/** What the suffix may hold; the prefix is the parent's own, already valid. */
const SUFFIX_PATTERN = /^[A-Z0-9-]+$/;

/** `FilterSelect` cannot hold `""` as a value, so null is spelled out. */
const NO_BRANCH = "__all__";

/** The row being typed — a new sub akun, or one being changed. */
interface Draft {
  /** Null for a sub akun that does not exist yet. */
  id: string | null;
  /** Only what follows `<parent code>-`; the prefix is never typed. */
  suffix: string;
  name: string;
  allocationType: AllocationType;
  businessLineId: string | null;
  branchId: string | null;
  isActive: boolean;
}

/**
 * The Sub Akun of one account, edited inside the row that opened it.
 *
 * ONE REQUEST PER ACT, which is where this departs from the Detil Akun panel it
 * replaced. A detil was an entry in an array that one PATCH carried whole, so
 * the panel held a draft of the entire list; a sub akun is a record with its own
 * endpoints, so adding, changing and removing each happen when its own row is
 * saved. What is still held as a draft is the ONE row being typed — Simpan and
 * Batal belong to it, and leaving without saving changes nothing.
 *
 * THE KODE IS HALF TYPED. `4101-` is the parent's code and is shown, not
 * entered: the server refuses any code that does not start with it, so a field
 * that let somebody type the whole thing would be a field whose commonest
 * mistake is a 400. They type "01" and read "4101-01".
 *
 * BRANCHES ARE THE ACCOUNT'S OWN. A Direct sub akun may pin a branch only where
 * its parent may post, so the picker offers those and no others — the server
 * checks the same thing, but a list that never offers the refused branch is a
 * rule nobody runs into.
 *
 * "HAPUS" HAS TWO ENDINGS. Nothing refers to the sub akun: it is deleted. A
 * journal entry, cash transaction or fixed cost names it: it is DEACTIVATED
 * instead, because those records are immutable and would be left pointing at
 * nothing. The server decides which and says so; so does the toast, because a
 * "Hapus" that leaves the row on screen reads as a failure.
 */
export function SubAccountPanel({
  account,
  shape,
  businessLines,
  branches,
  editable,
  onSaved,
  onClose,
}: {
  account: ChartOfAccount;
  shape: TenantShape;
  businessLines: Array<{ _id: string; name: string }>;
  branches: Array<{ _id: string; name: string }>;
  /** False for a reader without `chartOfAccounts:update` — the panel goes read-only. */
  editable: boolean;
  /** Called after every write, so the chart behind the panel is re-read. */
  onSaved: () => void;
  onClose: () => void;
}) {
  const subAccounts = account.subAccounts ?? [];
  const prefix = `${account.code}-`;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<SubAccount | null>(null);
  // "Terapkan ke data lama": the dialog offered when an edit moves the rule
  // (`save`, nothing persisted yet) or opened from the row action (`standalone`).
  const [remap, setRemap] = useState<
    | {
        mode: "save";
        sub: SubAccount;
        code: string;
        patch: Partial<SubAccountInput>;
        rule: {
          allocationType: AllocationType;
          businessLineId: string | null;
          branchId: string | null;
        };
      }
    | { mode: "standalone"; sub: SubAccount }
    | null
  >(null);
  const { can } = usePermissions();
  const canRemap = can("chartOfAccounts", "remapHistory");

  const choices = allocationChoices(shape);
  const lineNames = new Map(businessLines.map((line) => [line._id, line.name]));
  const branchNames = new Map(branches.map((branch) => [branch._id, branch.name]));
  const lineOptions = businessLines.map((line) => ({
    value: line._id,
    label: line.name,
  }));
  // Only the account's own branches. Absent `branchIds` is a chart the backfill
  // has not reached; everything is offered then, and the server has the last word.
  const accountBranchIds = account.branchIds;
  const branchOptions = [
    { value: NO_BRANCH, label: "Semua cabang lini ini" },
    ...branches
      .filter(
        (branch) => !accountBranchIds || accountBranchIds.includes(branch._id),
      )
      .map((branch) => ({ value: branch._id, label: branch.name })),
  ];

  function patchDraft(patch: Partial<Draft>) {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));
  }

  function startNew() {
    setError(null);
    setDraft({ id: null, suffix: "", name: "", ...blankAllocation(shape) });
  }

  function startEdit(sub: SubAccount) {
    setError(null);
    setDraft({
      id: sub._id,
      // Whatever follows the prefix. A code that does not start with it (it
      // cannot, once the server has checked) is shown whole rather than cut.
      suffix: sub.code.startsWith(prefix) ? sub.code.slice(prefix.length) : sub.code,
      name: sub.name,
      allocationType: sub.allocationType,
      businessLineId: sub.businessLineId,
      branchId: sub.branchId,
      isActive: sub.isActive,
    });
  }

  async function handleSave() {
    if (!draft) return;

    const suffix = draft.suffix.trim().toUpperCase();
    const name = draft.name.trim();
    const code = `${prefix}${suffix}`;

    if (suffix === "") {
      setError(`Kode wajib diisi — lanjutkan setelah ${prefix}`);
      return;
    }
    if (!SUFFIX_PATTERN.test(suffix)) {
      setError("Kode hanya boleh huruf, angka, dan tanda hubung.");
      return;
    }
    if (code.length > CODE_MAX_LENGTH) {
      setError(`Kode maksimal ${CODE_MAX_LENGTH} karakter, termasuk ${prefix}`);
      return;
    }
    if (name === "") {
      setError("Nama sub akun wajib diisi.");
      return;
    }
    if (name.length > NAME_MAX_LENGTH) {
      setError(`Nama maksimal ${NAME_MAX_LENGTH} karakter.`);
      return;
    }
    if (draft.allocationType === "direct" && !draft.businessLineId) {
      setError("Pilih lini usahanya dulu.");
      return;
    }

    const next: SubAccountInput = {
      code,
      name,
      allocationType: draft.allocationType,
      // Forced null off `direct` rather than merely left alone — the API refuses
      // a shared sub akun that names a line, and a stale id could survive a type
      // change otherwise.
      businessLineId:
        draft.allocationType === "direct" ? draft.businessLineId : null,
      branchId: draft.allocationType === "direct" ? draft.branchId : null,
      isActive: draft.isActive,
    };

    setBusy(true);
    setError(null);

    try {
      if (draft.id === null) {
        await subAccountService.create(account._id, next);
        swalToast(`Sub akun ${code} dibuat.`);
      } else {
        const saved = subAccounts.find((sub) => sub._id === draft.id);
        // ONLY WHAT MOVED: an empty body is a 400, and a code sent unchanged
        // would run the uniqueness check against the sub akun's own code.
        const patch: Partial<SubAccountInput> = {};
        if (saved) {
          (Object.keys(next) as Array<keyof SubAccountInput>).forEach((key) => {
            if (next[key] !== saved[key]) {
              (patch as Record<string, unknown>)[key] = next[key];
            }
          });
        }
        // A moved rule (type, line or branch) asks first whether the old data
        // follows: the dialog saves it, so nothing is sent from here.
        if (
          saved &&
          ("allocationType" in patch ||
            "businessLineId" in patch ||
            "branchId" in patch)
        ) {
          setRemap({
            mode: "save",
            sub: saved,
            code,
            patch,
            rule: {
              allocationType: next.allocationType,
              businessLineId: next.businessLineId,
              branchId: next.branchId,
            },
          });
          return;
        }
        if (Object.keys(patch).length > 0) {
          await subAccountService.update(account._id, draft.id, patch);
          swalToast(`Sub akun ${code} diperbarui.`);
        }
      }

      setDraft(null);
      onSaved();
    } catch (caught) {
      void swalToast(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Gagal menyimpan sub akun. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!removing) return;

    setBusy(true);

    try {
      const result = await subAccountService.remove(account._id, removing._id);
      swalToast(
        result.outcome === "deactivated"
          ? `Sub akun ${removing.code} sudah dipakai di jurnal atau transaksi, jadi dinonaktifkan — tidak dihapus.`
          : `Sub akun ${removing.code} dihapus.`,
      );
      setRemoving(null);
      onSaved();
    } catch (caught) {
      setRemoving(null);
      void swalToast(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Gagal menghapus sub akun. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  /** The cells that hold an allocation rule, for a row being typed. */
  function editCells(current: Draft) {
    const isDirect = current.allocationType === "direct";

    return (
      <>
        <TableCell className="px-4 py-2">
          <Input
            value={current.name}
            disabled={busy}
            placeholder="cth. Gaji - Grooming Pusat"
            aria-label="Nama sub akun"
            maxLength={NAME_MAX_LENGTH}
            onChange={(event) => patchDraft({ name: event.target.value })}
          />
        </TableCell>

        <TableCell className="px-4 py-2">
          <FilterSelect
            layout="field"
            label=""
            ariaLabel="Tipe alokasi"
            value={current.allocationType}
            active={false}
            disabled={busy}
            options={choices}
            onChange={(allocationType) =>
              // The line and the branch are cleared with the type: they mean
              // nothing off `direct`, and a leftover id would be sent to an API
              // that refuses it.
              patchDraft({ allocationType, businessLineId: null, branchId: null })
            }
          />
        </TableCell>

        <TableCell className="px-4 py-2">
          {isDirect ? (
            <FilterSelect
              layout="field"
              label=""
              ariaLabel="Lini usaha"
              value={current.businessLineId ?? ""}
              active={false}
              placeholder="Pilih lini…"
              disabled={busy}
              options={lineOptions}
              onChange={(businessLineId) => patchDraft({ businessLineId })}
            />
          ) : (
            <span className="text-sm text-muted">{sharedLineNote(current)}</span>
          )}
        </TableCell>

        <TableCell className="px-4 py-2">
          {isDirect ? (
            <FilterSelect
              layout="field"
              label=""
              ariaLabel="Cabang"
              value={current.branchId ?? NO_BRANCH}
              active={false}
              disabled={busy}
              options={branchOptions}
              onChange={(branchId) =>
                patchDraft({ branchId: branchId === NO_BRANCH ? null : branchId })
              }
            />
          ) : (
            <span className="text-sm text-muted">Otomatis</span>
          )}
        </TableCell>

        <TableCell className="px-4 py-2">
          <Switch
            checked={current.isActive}
            disabled={busy}
            aria-label="Aktifkan sub akun"
            onCheckedChange={(isActive) => patchDraft({ isActive })}
          />
        </TableCell>

        <TableCell className="px-4 py-2">
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Batal
            </Button>
            <Button size="sm" disabled={busy} onClick={handleSave}>
              Simpan
            </Button>
          </div>
        </TableCell>
      </>
    );
  }

  const codeCell = (current: Draft) => (
    <TableCell className="px-4 py-2">
      {/* THE PREFIX IS TEXT, NOT PART OF THE INPUT — locked by construction. */}
      <div className="flex items-center gap-1">
        <span className="text-sm tabular-nums text-muted">{prefix}</span>
        <Input
          value={current.suffix}
          disabled={busy}
          placeholder="01"
          aria-label={`Kode sub akun setelah ${prefix}`}
          maxLength={CODE_MAX_LENGTH - prefix.length}
          className="w-20 tabular-nums"
          autoFocus={current.id === null}
          onChange={(event) =>
            patchDraft({ suffix: event.target.value.toUpperCase() })
          }
        />
      </div>
    </TableCell>
  );

  const showTable = subAccounts.length > 0 || draft !== null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <p className="text-sm text-muted">
        Sub akun untuk{" "}
        <span className="font-medium text-foreground">
          {account.code} {account.name}
        </span>
        . Saat mencatat beban atau pendapatan, yang dipilih adalah sub akunnya —
        itulah yang menentukan segmen mana yang menanggungnya.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      {!showTable ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          Belum ada sub akun. Tambah satu supaya akun ini bisa dibaca per lini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-40">Kode</TableHead>
                <TableHead className="min-w-52">Nama sub akun</TableHead>
                <TableHead className="min-w-44">Tipe alokasi</TableHead>
                <TableHead className="min-w-44">Lini usaha</TableHead>
                <TableHead className="min-w-48">Cabang</TableHead>
                <TableHead className="w-24">Aktif</TableHead>
                {(editable || canRemap) && <TableHead className="w-28" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subAccounts.map((sub) => {
                if (draft && draft.id === sub._id) {
                  return (
                    <TableRow key={sub._id} className="hover:bg-transparent">
                      {codeCell(draft)}
                      {editCells(draft)}
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={sub._id}>
                    <TableCell className="px-4 py-2.5 text-sm tabular-nums">
                      {sub.code}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm font-medium">
                      {sub.name}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm">
                      {shape.branchCount <= 1 && sub.allocationType !== "direct"
                        ? "Shared"
                        : ALLOCATION_TYPE_LABEL[sub.allocationType]}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm">
                      {sub.allocationType === "direct" ? (
                        (lineNames.get(sub.businessLineId ?? "") ?? "—")
                      ) : (
                        <span className="text-muted">{sharedLineNote(sub)}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm">
                      {sub.allocationType === "direct" ? (
                        sub.branchId ? (
                          (branchNames.get(sub.branchId) ?? "—")
                        ) : (
                          <span className="text-muted">Semua cabang lini ini</span>
                        )
                      ) : (
                        <span className="text-muted">Otomatis</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          sub.isActive
                            ? "bg-tint-success text-success"
                            : "bg-tint-neutral text-muted",
                        )}
                      >
                        {sub.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </TableCell>
                    {(editable || canRemap) && (
                      <TableCell className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {editable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy || draft !== null}
                              aria-label={`Ubah sub akun ${sub.code}`}
                              onClick={() => startEdit(sub)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          )}
                          {canRemap && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy || draft !== null}
                              aria-label={`Terapkan ke data lama ${sub.code}`}
                              title="Terapkan ke data lama…"
                              onClick={() => setRemap({ mode: "standalone", sub })}
                            >
                              <History className="size-4" />
                            </Button>
                          )}
                          {editable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy || draft !== null}
                              aria-label={`Hapus sub akun ${sub.code}`}
                              onClick={() => setRemoving(sub)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              {draft && draft.id === null && (
                <TableRow className="hover:bg-transparent">
                  {codeCell(draft)}
                  {editCells(draft)}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Foto aturan (6 Okt 2026): every transaction keeps the rule it was
          recorded under, so editing one here only reaches what is recorded
          next. Said where the edit happens; applying it to old data is the dialog
          offered on Simpan (SubAccountRemapDialog), not this text. */}
      {draft && draft.id !== null && (
        <p className="text-xs text-muted">
          Perubahan berlaku untuk transaksi yang dicatat setelah ini. Transaksi
          lama tetap memakai aturan saat dicatat.
        </p>
      )}

      {/* The hint for whatever types this tenant can actually pick — three
          sentences where all three are offered, one where only Shared is. */}
      <ul className="flex flex-col gap-1 text-xs text-muted">
        {choices.map((choice) => (
          <li key={choice.value}>
            <span className="font-medium text-foreground">{choice.label}</span> —{" "}
            {ALLOCATION_TYPE_HINT[choice.value]}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || draft !== null}
            onClick={startNew}
          >
            <Plus className="size-4" />
            Tambah sub akun
          </Button>
        )}

        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={onClose}
        >
          Tutup
        </Button>
      </div>

      {remap && (
        <SubAccountRemapDialog
          accountId={account._id}
          sub={remap.sub}
          mode={remap.mode}
          proposedRule={remap.mode === "save" ? remap.rule : undefined}
          canRemap={canRemap}
          onPersist={
            remap.mode === "save"
              ? async () => {
                  await subAccountService.update(
                    account._id,
                    remap.sub._id,
                    remap.patch,
                  );
                  swalToast(`Sub akun ${remap.code} diperbarui.`);
                }
              : undefined
          }
          onDone={() => {
            setRemap(null);
            setDraft(null);
            onSaved();
          }}
          onCancel={() => setRemap(null)}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Hapus sub akun ${removing.code}?`}
          confirmLabel="Hapus"
          destructive
          busy={busy}
          onConfirm={handleRemove}
          onCancel={() => setRemoving(null)}
        >
          {removing.name} akan dihapus. Kalau sudah dipakai di jurnal, transaksi
          kas, atau biaya tetap, sub akun ini hanya dinonaktifkan supaya riwayat
          lamanya tetap terbaca.
        </ConfirmDialog>
      )}
    </div>
  );
}

/** What the Lini usaha cell says for a sub akun that names none. */
function sharedLineNote(rule: { allocationType: AllocationType }): string {
  // Said rather than left blank: an empty cell under "Lini usaha" reads as one
  // nobody filled in.
  return rule.allocationType === "shared_lokasi"
    ? "Ikut cabang transaksi"
    : "Semua lini";
}
