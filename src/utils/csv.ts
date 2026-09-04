/**
 * Reading CSV — the scanner, and the guess about what separates its columns.
 *
 * THE MIRROR OF THE BACKEND'S `utils/csv.js`, which says the same thing about
 * writing: this is not a CSV library. It implements the whole of RFC 4180 that
 * a real spreadsheet export produces, and nothing else.
 *
 * It lives in `utils/` rather than inside the inventory feature because two
 * unrelated things now read CSV — the product import parses a file the user
 * picked, and the report exports convert a file the server streamed. A second,
 * subtly different idea of what a quoted field is would be a bug that only
 * appears on the one product name with a comma in it.
 */

/**
 * Splits CSV text into a grid.
 *
 * A hand-rolled scanner rather than `split(",")`, because a product name with a
 * comma in it — "Royal Canin Adult, 3kg" — is quoted by every spreadsheet on
 * earth, and splitting on the delimiter turns one row into two columns of
 * nonsense that still parse. The quote handling IS the parser.
 *
 * Exported for `templateWorkbook.ts`, which reads the server's CSV template with
 * the same scanner before turning it into a formatted workbook — the alternative
 * being a second, subtly different idea of what a quoted field is.
 */
export function splitCsv(text: string, delimiter: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    grid.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        // A doubled quote is a literal one — RFC 4180's only escape.
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }

    if (char === "\r" || char === "\n") {
      endRow();
      // CRLF is one line ending, not two.
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // A file that does not end in a newline still has a last row.
  if (field !== "" || row.length > 0) {
    endRow();
  }

  return grid;
}

/**
 * Whether this file separates with `,` or `;`.
 *
 * NOT A NICETY. Excel writes CSV using the system list separator, and on an
 * Indonesian or European locale that is a SEMICOLON — so the file a tenant
 * actually produces from the template is `sku;nama;barcode`. Parsed with a
 * comma it is one enormous column, every header is unknown, and the error the
 * user gets ("kolom sku tidak ditemukan") points at a column that is plainly
 * right there in front of them.
 *
 * Decided from the header line by counting, because the header is the one line
 * whose shape is known in advance: the template has more than ten columns, so
 * whichever character appears more often is the separator. A tie means one
 * column either way and the comma reading is as good as the other.
 */
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;

  return semicolons > commas ? ";" : ",";
}

