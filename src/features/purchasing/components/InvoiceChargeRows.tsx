"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { FilterSelect, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/utils/decimal";
import type { ChartOfAccount } from "@/types/accounting";
import type { PurchaseChargeAllocation } from "@/types/api";

/** One "biaya lain" row as typed — ongkir, biaya kemasan. */
export interface ChargeDraft {
  key: string;
  label: string;
  amount: string;
  allocation: PurchaseChargeAllocation;
  /** The expense account — "" until picked; only read on an `expense` row. */
  accountId: string;
}

/** "6107 Beban Ongkos Kirim" — the account as the recap names it. */
export function accountLabel(
  accountId: string,
  accounts: ChartOfAccount[],
): string | null {
  const account = accounts.find((one) => one._id === accountId);
  return account ? `${account.code} ${account.name}` : null;
}

type ChargeFields = Omit<ChargeDraft, "key">;

/**
 * The "biaya lain" of a purchase invoice, READ LIKE THE REST OF THE RECAP
 * (16 October 2026, on request — inline inputs, a toggle and a picker per row
 * were too busy): each charge is one row, name left and amount right, with
 * where it goes underneath. Adding or changing one opens a small dialog:
 * name, amount, and a "Masuk akun beban" switch —
 *
 *   off — ke barang: split over the lines by value and folded into HPP.
 *   on  — the account is asked for there, and the charge is posted straight to
 *         it, added to the bill AFTER PPN (BO).
 *
 * `expenseOnly` is the invoice made from receipts: its goods are already
 * valued at the receipts' prices, so the switch is fixed on.
 */
export function InvoiceChargeRows({
  charges,
  onAdd,
  onPatch,
  onRemove,
  expenseOnly,
  accounts,
  accountsLoading,
  errors,
  disabled,
}: {
  charges: ChargeDraft[];
  onAdd: (fields: ChargeFields) => void;
  onPatch: (key: string, patch: Partial<ChargeDraft>) => void;
  onRemove: (key: string) => void;
  expenseOnly: boolean;
  accounts: ChartOfAccount[];
  accountsLoading: boolean;
  errors: Record<string, string>;
  disabled: boolean;
}) {
  // null = closed; "" = adding; a key = changing that charge.
  const [editing, setEditing] = useState<string | null>(null);
  const current = charges.find((charge) => charge.key === editing) ?? null;

  return (
    <>
      {charges.map((charge, index) => {
        const n = index + 1;
        const expense = expenseOnly || charge.allocation === "expense";
        const account = accountLabel(charge.accountId, accounts);
        return (
          <div key={charge.key} className="flex flex-col gap-0.5">
            <div className="flex items-start justify-between gap-2">
              <dt className="min-w-0">
                <span className="block truncate">
                  {charge.label || `Biaya lain ${n}`}
                </span>
                <span
                  className={
                    expense && !account
                      ? "block text-xs font-semibold text-danger"
                      : "block text-xs text-muted"
                  }
                >
                  {expense
                    ? (account ? `Beban · ${account}` : "Akun beban belum dipilih")
                    : "Ke barang (masuk HPP)"}
                </span>
              </dt>
              <dd className="flex shrink-0 items-center gap-0.5">
                <span className="mr-1 tabular-nums">
                  {formatMoney(charge.amount || "0")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`Ubah biaya lain ${n}`}
                  disabled={disabled}
                  onClick={() => setEditing(charge.key)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={`Hapus biaya lain ${n}`}
                  disabled={disabled}
                  onClick={() => onRemove(charge.key)}
                >
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </dd>
            </div>
            {errors[charge.key] && (
              <p className="text-xs font-semibold text-danger">
                {errors[charge.key]}
              </p>
            )}
          </div>
        );
      })}

      <div className="flex justify-end">
        <dt className="sr-only">Biaya lain</dt>
        <dd>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setEditing("")}
          >
            + Tambah biaya lain
          </Button>
        </dd>
      </div>

      {editing !== null && (
        <ChargeDialog
          initial={
            current ?? {
              label: "",
              amount: "",
              allocation: expenseOnly ? "expense" : "goods",
              accountId: "",
            }
          }
          adding={current === null}
          expenseOnly={expenseOnly}
          accounts={accounts}
          accountsLoading={accountsLoading}
          onClose={() => setEditing(null)}
          onSave={(fields) => {
            if (current) onPatch(current.key, fields);
            else onAdd(fields);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/** One charge, typed in a dialog — nothing reaches the form until Simpan. */
function ChargeDialog({
  initial,
  adding,
  expenseOnly,
  accounts,
  accountsLoading,
  onClose,
  onSave,
}: {
  initial: ChargeFields;
  adding: boolean;
  expenseOnly: boolean;
  accounts: ChartOfAccount[];
  accountsLoading: boolean;
  onClose: () => void;
  onSave: (fields: ChargeFields) => void;
}) {
  const [draft, setDraft] = useState<ChargeFields>(initial);
  const [tried, setTried] = useState(false);
  const expense = expenseOnly || draft.allocation === "expense";

  const problems = {
    label: draft.label.trim() === "" ? "Nama biaya wajib diisi." : undefined,
    amount:
      draft.amount === "" || Number(draft.amount) <= 0
        ? "Nominal harus lebih dari 0."
        : undefined,
    accountId:
      expense && draft.accountId === "" ? "Pilih akun bebannya." : undefined,
  };
  const valid = !problems.label && !problems.amount && !problems.accountId;

  function save() {
    setTried(true);
    if (!valid) return;
    onSave({
      ...draft,
      label: draft.label.trim(),
      allocation: expense ? "expense" : "goods",
      accountId: expense ? draft.accountId : "",
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{adding ? "Tambah biaya lain" : "Ubah biaya lain"}</DialogTitle>
          <DialogDescription>
            {expenseOnly
              ? "Dicatat ke akun beban — barang dari penerimaan sudah dinilai dengan harganya."
              : "Ongkir, biaya kemasan, dan sejenisnya."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <TextField
            label="Nama biaya"
            required
            placeholder="Ongkos kirim"
            value={draft.label}
            error={tried ? problems.label : undefined}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, label: event.target.value }))
            }
          />
          <TextField
            label="Nominal"
            required
            inputMode="numeric"
            placeholder="10000"
            className="text-right tabular-nums"
            value={draft.amount}
            error={tried ? problems.amount : undefined}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                // DIGITS ONLY: "10.000" is ten thousand in Indonesian.
                amount: event.target.value.replace(/\D/g, ""),
              }))
            }
          />

          {!expenseOnly && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <span>
                <span className="block font-medium">Masuk akun beban</span>
                <span className="block text-xs text-muted">
                  {expense
                    ? "Tidak masuk HPP — dicatat ke akun di bawah."
                    : "Mati: dibagi ke barang dan masuk HPP."}
                </span>
              </span>
              <Switch
                aria-label="Masuk akun beban"
                checked={expense}
                onCheckedChange={(on) =>
                  setDraft((prev) => ({
                    ...prev,
                    allocation: on ? "expense" : "goods",
                  }))
                }
              />
            </label>
          )}

          {expense && (
            <FilterSelect
              layout="form"
              label="Akun beban"
              value={draft.accountId}
              options={accounts.map((account) => ({
                value: account._id,
                label: `${account.code} ${account.name}`,
              }))}
              active={false}
              required
              searchable
              error={tried ? problems.accountId : undefined}
              placeholder={accountsLoading ? "Memuat akun…" : "Pilih akun beban"}
              onChange={(value) =>
                setDraft((prev) => ({ ...prev, accountId: value }))
              }
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="button" onClick={save}>
            Simpan biaya
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
