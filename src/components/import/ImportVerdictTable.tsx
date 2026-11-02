"use client";

import { SkuText } from "@/components/SkuText";
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
import type { ImportRowVerdict } from "@/types/bulkImport";

/**
 * Every problem in a file at once, addressed by row number.
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
 *
 * Every non-`ok` verdict is red, and none is a softer colour: there is no
 * "warning" tier because there is no verdict the user may leave alone. Amber
 * would suggest a row they could skip, and the whole design says they cannot.
 *
 * `statusLabels` is the feature's own wording; a status it does not list falls
 * back to "Perlu diperbaiki" rather than an API word.
 */
export function ImportVerdictTable({
  rows,
  statusLabels,
  identityHeader = "SKU",
}: {
  rows: ImportRowVerdict[];
  statusLabels: Record<string, string>;
  identityHeader?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Baris</TableHead>
            <TableHead className="w-48">{identityHeader}</TableHead>
            <TableHead className="w-44">Status</TableHead>
            <TableHead>Yang perlu diperbaiki</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.rowNumber}
              className={cn(row.status !== "ok" && "bg-danger/5")}
            >
              <TableCell className="tabular-nums">{row.rowNumber}</TableCell>
              <TableCell className="tabular-nums text-xs">
                <SkuText value={row.sku} fallback="—" />
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    row.status === "ok"
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-danger/30 bg-danger/10 text-danger"
                  }
                >
                  {statusLabels[row.status] ?? "Perlu diperbaiki"}
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
                        <code className="rounded bg-muted/20 px-1 py-0.5 tabular-nums">
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
