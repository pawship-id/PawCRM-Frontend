"use client";

import { useMemo, useState } from "react";

import { ApiError } from "@/services/api-error";
import type { ImportProblem, ImportRowVerdict } from "@/types/bulkImport";
import { SheetError, type ParsedGrid } from "@/utils/sheetReader";

/**
 * Any spreadsheet upload's state machine: pick a file, check it, use it.
 *
 * THREE STEPS, AND THE STEP IS DERIVED rather than stored. A `step` in state
 * alongside `sheet`, `preview` and `result` is four variables that can disagree
 * — a screen showing step 3 with no result is a blank panel nobody can explain.
 * Here the step IS the data: no sheet means step 1, a sheet with no result means
 * step 2, a result means step 3.
 *
 * THE CLIENT NEVER DECIDES WHETHER A FILE MAY GO THROUGH. `canCommitOf` reads the
 * server's own answer, and the local problems below can only make the button MORE
 * disabled, never less.
 *
 * WHAT A NEW UPLOAD PROVIDES is the config: how to read its file, the calls that
 * check and commit it, and how to read the preview. An upload with no write of
 * its own (a transfer fills a form) leaves `commit` out and uses `rows` and
 * `canCommit`. `autoCheck` asks the server as soon as a file is read, for an
 * upload with nothing left to choose first.
 *
 * The config is read on each call, so its functions may close over the caller's
 * state — a warehouse picked after the file — and need no memoising.
 */

export type ImportStep = "pick" | "check" | "done";

export interface SheetImportConfig<
  Row,
  Verdict extends ImportRowVerdict,
  Preview,
  Result,
  Sheet extends ParsedGrid<Row>,
> {
  read: (file: File) => Promise<Sheet>;
  preview: (sheet: Sheet) => Promise<Preview>;
  commit?: (sheet: Sheet) => Promise<Result>;
  verdictsOf: (preview: Preview) => Verdict[];
  canCommitOf: (preview: Preview) => boolean;
  rowNumberOf: (row: Row) => number;
  /** A row's verdict when the server's is absent or does not count. */
  localVerdict: (row: Row, problems: ImportProblem[]) => Verdict;
  autoCheck?: boolean;
  messages: {
    /** A file that failed for a reason other than a `SheetError`. */
    unreadable: string;
    checkFailed: string;
    commitFailed?: string;
  };
}

export function useSheetImport<
  Row,
  Verdict extends ImportRowVerdict,
  Preview,
  Result,
  Sheet extends ParsedGrid<Row>,
>(config: SheetImportConfig<Row, Verdict, Preview, Result, Sheet>) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step: ImportStep = result ? "done" : sheet ? "check" : "pick";

  const { verdictsOf, rowNumberOf, localVerdict } = config;

  /**
   * Rows the screen renders: the server's verdicts, with the parser's own
   * problems folded in.
   *
   * MERGED RATHER THAN SHOWN SEPARATELY, because they are the same thing to the
   * person fixing them — "baris 12 salah, ini kenapa" — and two tables of
   * problems is two places to look for a file that has both. A row carrying a
   * local problem is `invalid` whatever the server said about it, since the
   * server was never sent the cell that is wrong.
   *
   * Before a preview exists the local problems stand alone, so a file with a
   * mistyped price shows what is wrong with it before any request is made.
   */
  const rows = useMemo<Verdict[]>(() => {
    if (!sheet) return [];

    const byRow = new Map(
      (preview ? verdictsOf(preview) : []).map((verdict) => [
        verdict.rowNumber,
        verdict,
      ]),
    );

    return sheet.rows.map(({ row, problems }) => {
      const verdict = byRow.get(rowNumberOf(row));

      if (problems.length === 0) {
        return verdict ?? localVerdict(row, []);
      }

      return localVerdict(row, [...problems, ...(verdict?.problems ?? [])]);
    });
    // The three readers are pure descriptions of a row, redefined each render by
    // a caller that has no reason to memoise them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, preview]);

  const hasLocalProblems = (sheet?.rows ?? []).some(
    ({ problems }) => problems.length > 0,
  );

  const canCommit =
    preview !== null && config.canCommitOf(preview) && !hasLocalProblems;

  const clear = () => {
    setSheet(null);
    setFileName(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const runCheck = async (target: Sheet) => {
    setLoading(true);
    setError(null);

    try {
      setPreview(await config.preview(target));
    } catch (err) {
      setPreview(null);
      setError(
        err instanceof ApiError ? err.message : config.messages.checkFailed,
      );
    } finally {
      setLoading(false);
    }
  };

  const pickFile = async (file: File) => {
    setLoading(true);
    setError(null);
    // A new file invalidates the old verdicts. Keeping them would show a preview
    // of one file next to the row count of another.
    setPreview(null);
    setResult(null);

    let parsed: Sheet;
    try {
      parsed = await config.read(file);
      setSheet(parsed);
      setFileName(file.name);
    } catch (err) {
      setSheet(null);
      setFileName(null);
      setError(
        err instanceof SheetError ? err.message : config.messages.unreadable,
      );
      setLoading(false);
      return;
    }

    if (config.autoCheck) {
      await runCheck(parsed);
    } else {
      setLoading(false);
    }
  };

  const check = async () => {
    if (sheet) await runCheck(sheet);
  };

  const commit = async () => {
    if (!sheet || !config.commit) return;

    setLoading(true);
    setError(null);

    try {
      setResult(await config.commit(sheet));
    } catch (err) {
      /**
       * A refused commit sends the user back to the check step rather than
       * forward, and the preview is CLEARED — the data moved between the two
       * screens, so the verdicts on screen are the stale reading that let the
       * commit be attempted. Leaving them up would show green rows beside a
       * refusal.
       */
      setPreview(null);
      setError(
        err instanceof ApiError
          ? err.message
          : (config.messages.commitFailed ?? config.messages.checkFailed),
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    step,
    /** The parsed file, or null before one is picked. */
    sheet,
    fileName,
    preview,
    result,
    /** Server verdicts merged with the parser's own problems. */
    rows,
    /** True when nothing at all stands in the way of committing. */
    canCommit,
    loading,
    error,
    setError,
    pickFile,
    check,
    commit,
    reset: clear,
  };
}
