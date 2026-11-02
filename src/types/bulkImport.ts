/**
 * What every spreadsheet upload's verdicts look like, whatever the upload is for.
 *
 * The backend half is `utils/bulkImport.js`. A feature's own contract (the fields
 * a row carries, the counters a preview adds) stays in that feature's types and
 * extends these.
 */

/** One problem, addressed to the COLUMN a user can see. */
export interface ImportProblem {
  field: string;
  message: string;
}

/** A row's verdict. `ok` is the only status that passes. */
export interface ImportRowVerdict<Status extends string = string> {
  /** The spreadsheet's own row number — what a person navigates by. */
  rowNumber: number;
  sku?: string;
  status: Status;
  /** All of them, so one pass over the file shows everything that is wrong. */
  problems: ImportProblem[];
}
