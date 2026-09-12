"use client";

import { Plus, Trash2 } from "lucide-react";

import { FilterSelect, namedOptions } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SHARED_LINE_LABEL } from "@/features/accounting";
import type { BusinessLine } from "@/services/businessLine.service";
import type { ChartOfAccount } from "@/types/accounting";
import type {
  CashTransactionLine,
  CashTransactionLineInput,
} from "@/types/api";
import {
  formatMoney,
  isDecimal,
  toDecimalString,
  toMinor,
  trimDecimal,
} from "@/utils/decimal";

/** The server's caps (`MAX_LINES`, `NOTE_MAX_LENGTH`). */
export const MAX_LINES = 20;
const MEMO_MAX_LENGTH = 500;

/** One line as the form holds it. `businessLineId: ""` is Bersama. */
export interface DraftLine {
  /** Local key — an index is not stable across a removal. */
  key: string;
  accountId: string;
  amount: string;
  businessLineId: string;
  memo: string;
}

let lineSeq = 0;
export function blankLine(): DraftLine {
  lineSeq += 1;
  return {
    key: `cash-line-${lineSeq}`,
    accountId: "",
    amount: "",
    businessLineId: "",
    memo: "",
  };
}

/** A saved transaction's lines, as editable drafts. */
export function draftLinesFrom(
  lines: CashTransactionLine[] | null | undefined,
): DraftLine[] {
  if (!lines?.length) return [blankLine()];
  return lines.map((line) => ({
    ...blankLine(),
    accountId: line.accountId,
    amount: trimDecimal(line.amount),
    businessLineId: line.businessLineId ?? "",
    memo: line.memo ?? "",
  }));
}

function positiveMinor(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "" || !isDecimal(trimmed)) return null;
  const minor = toMinor(trimmed);
  return minor !== null && minor > 0n ? minor : null;
}

/** Σ of the lines that parse — rendered on every keystroke, so never throws. */
export function linesTotal(lines: DraftLine[]): bigint {
  return lines.reduce((sum, line) => sum + (positiveMinor(line.amount) ?? 0n), 0n);
}

/** The first thing stopping the lines from being saved, in a phrase — or null. */
export function linesProblem(lines: DraftLine[]): string | null {
  for (const [index, line] of lines.entries()) {
    const row = index + 1;
    if (!line.accountId) return `Akun di baris ${row} belum dipilih`;
    if (line.amount.trim() === "") return `Jumlah di baris ${row} belum diisi`;
    if (positiveMinor(line.amount) === null) {
      return `Jumlah di baris ${row} harus angka lebih dari nol`;
    }
  }
  return null;
}

export function toLineInputs(lines: DraftLine[]): CashTransactionLineInput[] {
  return lines.map((line) => ({
    accountId: line.accountId,
    amount: line.amount.trim(),
    businessLineId: line.businessLineId || null,
    ...(line.memo.trim() ? { memo: line.memo.trim() } : {}),
  }));
}

/**
 * A comparable fingerprint of a set of lines — amounts in minor units, so
 * "150000" and "150000.0000" are the same line and an untouched editor does not
 * count as a change.
 */
export function linesSignature(
  lines: Array<{
    accountId: string;
    amount: string;
    businessLineId?: string | null;
    memo?: string | null;
  }>,
): string {
  return JSON.stringify(
    lines.map((line) => [
      line.accountId,
      String(toMinor(line.amount.trim()) ?? line.amount),
      line.businessLineId || null,
      (line.memo ?? "").trim(),
    ]),
  );
}

/**
 * The ROW TABLE of an expense or other income (§16 Form Transaksi): Akun · Lini
 * bisnis · Jumlah · Memo, Tambah baris, and the running total — which IS the
 * transaction's amount, so there is no separate Jumlah field to disagree with it.
 *
 * Controls in a table cell stay at field height (`layout="field"`, `h-10`
 * inputs), per §16's "three things that look like form fields and are not".
 *
 * `accounts` arrive already narrowed to the kind — see `accountsForKind`.
 */
export function CashLinesEditor({
  kind,
  lines,
  onChange,
  accounts,
  businessLines,
  disabled = false,
}: {
  kind: "expense" | "other_income";
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  accounts: ChartOfAccount[];
  businessLines: BusinessLine[];
  disabled?: boolean;
}) {
  const accountOptions = accounts.map((account) => ({
    value: account._id,
    label: `${account.code} · ${account.name}`,
  }));
  const lineOptions = [
    { value: "", label: SHARED_LINE_LABEL },
    ...namedOptions(businessLines),
  ];
  const total = linesTotal(lines);

  function patch(key: string, change: Partial<DraftLine>) {
    onChange(
      lines.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-60">
                {kind === "expense" ? "Akun beban" : "Akun pendapatan"}
              </TableHead>
              <TableHead className="min-w-44">Lini bisnis</TableHead>
              <TableHead className="min-w-36 text-right">Jumlah</TableHead>
              <TableHead className="min-w-44">Memo</TableHead>
              <TableHead>
                <span className="sr-only">Hapus</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const row = index + 1;
              const badAmount =
                line.amount.trim() !== "" && positiveMinor(line.amount) === null;

              return (
                <TableRow key={line.key} className="align-top hover:bg-transparent">
                  <TableCell>
                    <FilterSelect
                      layout="field"
                      label=""
                      ariaLabel={`Akun baris ${row}`}
                      value={line.accountId}
                      active={false}
                      placeholder="Pilih akun"
                      searchable
                      disabled={disabled}
                      options={accountOptions}
                      onChange={(accountId) => {
                        // The chart already knows which line "5102 HPP Grooming"
                        // belongs to — take it, unless one was picked by hand.
                        const account = accounts.find((a) => a._id === accountId);
                        patch(line.key, {
                          accountId,
                          ...(line.businessLineId === "" && account?.businessLineId
                            ? { businessLineId: account.businessLineId }
                            : {}),
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <FilterSelect
                      layout="field"
                      label=""
                      ariaLabel={`Lini bisnis baris ${row}`}
                      value={line.businessLineId}
                      active={false}
                      placeholder={SHARED_LINE_LABEL}
                      disabled={disabled}
                      options={lineOptions}
                      onChange={(businessLineId) =>
                        patch(line.key, { businessLineId })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Jumlah baris ${row}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={line.amount}
                      disabled={disabled}
                      aria-invalid={badAmount || undefined}
                      className="mt-1.5 h-10 text-right tabular-nums"
                      onChange={(event) =>
                        patch(line.key, { amount: event.target.value })
                      }
                    />
                    {badAmount && (
                      <p role="alert" className="mt-1 text-xs font-semibold text-danger">
                        Isi angka lebih dari nol.
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Memo baris ${row}`}
                      value={line.memo}
                      maxLength={MEMO_MAX_LENGTH}
                      disabled={disabled}
                      className="mt-1.5 h-10"
                      onChange={(event) =>
                        patch(line.key, { memo: event.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {lines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1.5 size-10"
                        aria-label={`Hapus baris ${row}`}
                        disabled={disabled}
                        onClick={() =>
                          onChange(lines.filter((item) => item.key !== line.key))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {lines.length < MAX_LINES && (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange([...lines, blankLine()])}
          >
            <Plus className="size-4" />
            Tambah baris
          </Button>
        )}
        <p className="ml-auto text-sm text-muted">
          Total{" "}
          <b className="text-base font-bold text-foreground tabular-nums">
            {formatMoney(toDecimalString(total))}
          </b>
        </p>
      </div>
    </div>
  );
}
