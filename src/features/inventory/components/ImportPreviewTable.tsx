"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  ImportVerdict,
  ImportVerdictStatus,
} from "@/types/productImport";

/**
 * Step 2: every problem in the file at once, addressed by row number.
 *
 * THE ROW NUMBER IS THE POINT OF THIS TABLE. It is the number in Excel's own
 * gutter, so a user reads "baris 287", switches windows, and is looking at the
 * cell. Anything less — an index, a SKU, a position within the valid rows — is a
 * problem the user has to go and find.
 *
 * PROBLEM ROWS FIRST is deliberately NOT done. The rows stay in the file's own
 * order, because the user is going to work down the spreadsheet fixing them, and
 * a table sorted by severity means jumping around a document they are editing in
 * another window. The counters above say how many there are; the order stays
 * theirs.
 */

const LABELS: Record<ImportVerdictStatus, string> = {
  ok: "Siap",
  conflict: "Sudah ada",
  duplicate_in_file: "Ganda di file",
  family_conflict: "Beda dengan saudaranya",
  invalid: "Belum lengkap",
};

/**
 * Every non-`ok` verdict is red, and none is a softer colour.
 *
 * There is no "warning" tier because there is no verdict the user may leave
 * alone: the commit is refused while any row is not `ok`. Amber would suggest a
 * row they could skip, and the whole design says they cannot.
 */
const TONES: Record<ImportVerdictStatus, string> = {
  ok: "border-success/30 bg-success/10 text-success",
  conflict: "border-destructive/30 bg-destructive/10 text-destructive",
  duplicate_in_file:
    "border-destructive/30 bg-destructive/10 text-destructive",
  family_conflict: "border-destructive/30 bg-destructive/10 text-destructive",
  invalid: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function ImportPreviewTable({ rows }: { rows: ImportVerdict[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Baris</TableHead>
            <TableHead className="w-48">SKU</TableHead>
            <TableHead className="w-44">Status</TableHead>
            <TableHead>Yang perlu diperbaiki</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.rowNumber}
              className={cn(row.status !== "ok" && "bg-destructive/5")}
            >
              <TableCell className="font-mono tabular-nums">
                {row.rowNumber}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.sku || "—"}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={TONES[row.status]}>
                  {LABELS[row.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">
                {row.problems.length === 0 ? (
                  <span className="text-muted">—</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {row.problems.map((problem, index) => (
                      <li key={`${problem.field}-${index}`}>
                        {/*
                          The column name is set apart because it is the half the
                          user acts on: they are looking for a cell, and the
                          sentence explains it once they have found it.
                        */}
                        <code className="rounded bg-muted/20 px-1 py-0.5 font-mono">
                          {problem.field}
                        </code>{" "}
                        {problem.message}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
