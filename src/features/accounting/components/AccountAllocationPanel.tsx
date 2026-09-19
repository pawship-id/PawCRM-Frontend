"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Alert, FilterSelect } from "@/components";
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
import { ApiError } from "@/services/api-error";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { swalToast } from "@/lib/swal";
import type { AccountAllocation, ChartOfAccount } from "@/types/accounting";

import {
  ALLOCATION_TYPE_HINT,
  allocationChoices,
  blankAllocation,
  type TenantShape,
} from "../allocationLabels";

/** Backend cap — ALLOCATION_NAME_MAX_LENGTH in chartOfAccounts.model.js. */
const NAME_MAX_LENGTH = 120;

/** `FilterSelect` cannot hold `""` as a value, so null is spelled out. */
const NO_BRANCH = "__all__";

/** A draft row plus a key that survives its neighbours being deleted. */
interface DraftRow {
  key: string;
  rule: AccountAllocation;
}

/**
 * React keys for rules that have no `_id` yet.
 *
 * MODULE-LEVEL, matching `blankLine` in CashLinesEditor. A saved rule keys on
 * its own id; a new one has none, and keying it by index would move every input
 * below it when one is deleted — which in a controlled table means the focus
 * jumps and the value somebody was typing lands in the wrong row.
 */
let draftSeq = 0;
function draftKey(): string {
  draftSeq += 1;
  return `alloc-draft-${draftSeq}`;
}

/**
 * The Detil Akun of one account, edited inside the row that opened it.
 *
 * A DRAFT WITH SIMPAN AND BATAL, which is the one place this departs from the BO
 * mockup: there, every keystroke writes straight through. Here the panel holds
 * the edit until somebody commits it, and one PATCH carries the whole list.
 * Three reasons, in order of how much they cost:
 *
 *   - the rules are validated AGAINST EACH OTHER (no two may aim at the same
 *     segment, no two may share a name), so a half-typed list is a list the
 *     server would rightly refuse;
 *   - a person who opens a row, types a name and changes their mind has to be
 *     able to leave without having changed the books;
 *   - one save is one request. Per-keystroke writes would put a PATCH behind
 *     every letter of "Gaji - Grooming Pusat".
 *
 * WHY REMOVING A RULE CAN FAIL. Once a journal entry has been posted to a detil,
 * the server refuses to delete it — the entry is immutable and would be left
 * naming something that no longer resolves. The remedy is the Aktif switch on
 * the same row, which takes the rule off every picker while keeping the entries
 * that used it explicable. The 409 says so, and it is shown as it arrives rather
 * than paraphrased.
 */
export function AccountAllocationPanel({
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
  onSaved: () => void;
  onClose: () => void;
}) {
  const seed = () =>
    (account.allocations ?? []).map((rule) => ({
      key: rule._id ?? draftKey(),
      // Copied rather than referenced: the draft must not mutate the account the
      // table behind it is still rendering from.
      rule: { ...rule },
    }));

  const [rows, setRows] = useState<DraftRow[]>(seed);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choices = allocationChoices(shape);
  const lineOptions = businessLines.map((line) => ({
    value: line._id,
    label: line.name,
  }));
  const branchOptions = [
    { value: NO_BRANCH, label: "Semua cabang lini ini" },
    ...branches.map((branch) => ({ value: branch._id, label: branch.name })),
  ];

  function patchRow(key: string, patch: Partial<AccountAllocation>) {
    setRows((previous) =>
      previous.map((row) =>
        row.key === key ? { ...row, rule: { ...row.rule, ...patch } } : row,
      ),
    );
  }

  async function handleSave() {
    const cleaned: AccountAllocation[] = [];

    for (const [index, { rule }] of rows.entries()) {
      const name = rule.name.trim();

      if (name === "") {
        setError(`Baris ${index + 1}: nama detil wajib diisi.`);
        return;
      }
      if (name.length > NAME_MAX_LENGTH) {
        setError(`Baris ${index + 1}: nama maksimal ${NAME_MAX_LENGTH} karakter.`);
        return;
      }
      if (rule.allocationType === "direct" && !rule.businessLineId) {
        setError(`Baris ${index + 1}: pilih lini usahanya dulu.`);
        return;
      }

      cleaned.push({
        // Kept when it exists: it is how the server tells a rename from a
        // delete-and-recreate, and a rule with journal entries cannot be
        // recreated. See the type.
        ...(rule._id ? { _id: rule._id } : {}),
        name,
        allocationType: rule.allocationType,
        // Forced null off `direct` rather than merely left alone — the API
        // refuses a shared rule that names a line, and a stale id could survive
        // a type change otherwise.
        businessLineId:
          rule.allocationType === "direct" ? rule.businessLineId : null,
        branchId: rule.allocationType === "direct" ? rule.branchId : null,
        isActive: rule.isActive,
      });
    }

    setBusy(true);
    setError(null);

    try {
      await chartOfAccountsService.update(account._id, {
        allocations: cleaned,
      });
      swalToast(
        cleaned.length === 0
          ? `Aturan alokasi ${account.code} dikosongkan.`
          : `Aturan alokasi ${account.code} tersimpan.`,
      );
      onSaved();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Gagal menyimpan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <p className="text-sm text-muted">
        Detil Akun untuk{" "}
        <span className="font-medium text-foreground">
          {account.code} {account.name}
        </span>
        . Saat mencatat beban atau pendapatan, yang dipilih adalah detilnya —
        itulah yang menentukan segmen mana yang menanggungnya.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          Belum ada detil. Tambah satu supaya akun ini bisa dibaca per lini.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-52">Nama detil</TableHead>
                <TableHead className="min-w-44">Tipe alokasi</TableHead>
                <TableHead className="min-w-44">Lini usaha</TableHead>
                <TableHead className="min-w-48">Cabang</TableHead>
                <TableHead className="w-20">Aktif</TableHead>
                {editable && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ key, rule }, index) => {
                const isDirect = rule.allocationType === "direct";

                return (
                  <TableRow key={key}>
                    <TableCell className="px-4 py-2">
                      <Input
                        value={rule.name}
                        disabled={!editable || busy}
                        placeholder="cth. Gaji - Grooming Pusat"
                        aria-label={`Nama detil baris ${index + 1}`}
                        onChange={(event) =>
                          patchRow(key, { name: event.target.value })
                        }
                      />
                    </TableCell>

                    <TableCell className="px-4 py-2">
                      <FilterSelect
                        layout="field"
                        label=""
                        ariaLabel={`Tipe alokasi baris ${index + 1}`}
                        value={rule.allocationType}
                        active={false}
                        disabled={!editable || busy}
                        options={choices}
                        onChange={(allocationType) =>
                          // The line and the branch are cleared with the type:
                          // they mean nothing off `direct`, and a leftover id
                          // would be sent to an API that refuses it.
                          patchRow(key, {
                            allocationType,
                            businessLineId: null,
                            branchId: null,
                          })
                        }
                      />
                    </TableCell>

                    <TableCell className="px-4 py-2">
                      {isDirect ? (
                        <FilterSelect
                          layout="field"
                          label=""
                          ariaLabel={`Lini usaha baris ${index + 1}`}
                          value={rule.businessLineId ?? ""}
                          active={false}
                          placeholder="Pilih lini…"
                          disabled={!editable || busy}
                          options={lineOptions}
                          onChange={(businessLineId) =>
                            patchRow(key, { businessLineId })
                          }
                        />
                      ) : (
                        // Said rather than left blank: an empty cell under
                        // "Lini usaha" reads as one nobody filled in.
                        <span className="text-sm text-muted">
                          {rule.allocationType === "shared_lokasi"
                            ? "Ikut cabang transaksi"
                            : "Semua lini"}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="px-4 py-2">
                      {isDirect ? (
                        <FilterSelect
                          layout="field"
                          label=""
                          ariaLabel={`Cabang baris ${index + 1}`}
                          value={rule.branchId ?? NO_BRANCH}
                          active={false}
                          disabled={!editable || busy}
                          options={branchOptions}
                          onChange={(branchId) =>
                            patchRow(key, {
                              branchId: branchId === NO_BRANCH ? null : branchId,
                            })
                          }
                        />
                      ) : (
                        <span className="text-sm text-muted">Otomatis</span>
                      )}
                    </TableCell>

                    <TableCell className="px-4 py-2">
                      <Switch
                        checked={rule.isActive}
                        disabled={!editable || busy}
                        aria-label={`Aktifkan detil baris ${index + 1}`}
                        onCheckedChange={(isActive) =>
                          patchRow(key, { isActive })
                        }
                      />
                    </TableCell>

                    {editable && (
                      <TableCell className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`Hapus detil ${rule.name || index + 1}`}
                          onClick={() =>
                            setRows((previous) =>
                              previous.filter((row) => row.key !== key),
                            )
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              setRows((previous) => [
                ...previous,
                { key: draftKey(), rule: blankAllocation(shape) },
              ])
            }
          >
            <Plus className="size-4" />
            Tambah detil
          </Button>

          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
              Batal
            </Button>
            <Button size="sm" disabled={busy} onClick={handleSave}>
              Simpan aturan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
