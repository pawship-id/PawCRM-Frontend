/**
 * A spreadsheet template as a formatted `.xlsx`, for any upload.
 *
 * WHY A WORKBOOK AT ALL: a CSV cannot carry a column format, and a code column
 * typed into General loses its leading zeros before anything of ours sees it.
 * See `features/inventory/utils/templateWorkbook.ts`, the product template, for
 * the two columns where that loses real data.
 */

/** How a column should behave in Excel. */
export type TemplateColumnKind = "text" | "date" | "number";

export interface TemplateOptions {
  /** `column` is trimmed and lowercased. Null leaves the column General. */
  kindOf: (column: string) => TemplateColumnKind | null;
  sheetName: string;
  preformattedRows?: number;
  /**
   * Sheets after the main one, plain text. Nothing reads them back. A hidden
   * one holds what a dropdown offers, out of the way.
   */
  extraSheets?: ExtraSheet[];
  /** A column's width in characters, past the header's own. */
  widthOf?: (column: string) => number | null;
  /** Dropdowns on the main sheet's columns. */
  lists?: TemplateList[];
}

export interface ExtraSheet {
  name: string;
  rows: string[][];
  widths?: number[];
  hidden?: boolean;
  /** Per cell, parallel to `rows`. A styled cell must exist in `rows`, even as "". */
  styles?: (SheetStyle | null)[][];
  /** Ranges such as `A1:C1`. */
  merges?: string[];
  /** Row heights in points, parallel to `rows`; a gap keeps Excel's default. */
  heights?: (number | undefined)[];
  /** False hides Excel's gridlines, for a sheet that is read rather than filled. */
  gridlines?: boolean;
  /** Before the main sheet, so the workbook opens on it — a guide read first. */
  first?: boolean;
}

/**
 * The looks a reference sheet may use, Buloo's palette in Excel's terms. A
 * closed list on purpose: a guide sheet in every template should look like one.
 */
export type SheetStyle =
  | "title"
  | "subtitle"
  | "section"
  | "head"
  | "body"
  | "key"
  | "required"
  | "optional"
  | "step"
  | "note";

export interface TemplateList {
  /** Trimmed and lowercased, as `kindOf` receives it. */
  column: string;
  /** A range on another sheet, e.g. `'Pilihan'!$A$2:$A$4`. */
  source: string;
  /** Shown when somebody types a value that is not on the list. */
  message: string;
}

/**
 * How many empty rows below the examples get their format pre-set.
 *
 * WITHOUT THESE THE FORMATTING IS DECORATION. Excel applies a column's format to
 * the cell being typed into, not to the column as a concept — so a barcode typed
 * on row 40 of an unformatted sheet is a number again, and the leading zero is
 * gone. Stub cells carry the format down the sheet, which is what makes the
 * guarantee real rather than a property of the two example rows.
 *
 * Two hundred covers an ordinary first import and costs a few KB. Past it the
 * user is pasting a block, which carries its own formatting anyway.
 */
const PREFORMATTED_ROWS = 200;

/**
 * How far down a dropdown reaches. Unlike a format it costs nothing per row,
 * so it covers the longest file any upload accepts rather than the stubs.
 */
const LIST_ROWS = 1000;

/** Excel's day zero in the 1900 date system — 1899-12-30, not the 31st. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/** `2027-08-01` → 46600. UTC throughout, so no timezone can shift the day. */
function toExcelSerial(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));

  return Math.round((utc - EXCEL_EPOCH_UTC) / MS_PER_DAY);
}

const FORMATS: Record<TemplateColumnKind, string | null> = {
  text: "@",
  date: "yyyy-mm-dd",
  number: null,
};

/**
 * Builds a template workbook from a grid: the header row, then any example rows.
 *
 * A FEATURE SAYS HOW EACH COLUMN IS FORMATTED, never which columns exist: the
 * grid is the source of those, whether it came from a CSV the server serves or
 * from a list the feature keeps itself.
 *
 * Loaded through the same dynamic import the reader uses, so a user who only
 * ever downloads the CSV never fetches the parser.
 */
export async function buildTemplateWorkbook(
  grid: string[][],
  {
    kindOf,
    sheetName,
    preformattedRows = PREFORMATTED_ROWS,
    extraSheets = [],
    widthOf = () => null,
    lists = [],
  }: TemplateOptions,
): Promise<Blob> {
  const XLSX = await import("xlsx");

  if (grid.length === 0) {
    throw new Error("Template kosong");
  }

  const headers = grid[0].map((header) => header.trim().toLowerCase());
  const sheet: Record<string, unknown> = {};
  const formatFor = (column: string) => {
    const kind = kindOf(column);
    return kind ? FORMATS[kind] : null;
  };

  grid[0].forEach((header, column) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c: column })] = {
      t: "s",
      v: header.trim(),
    };
  });

  grid.slice(1).forEach((cells, index) => {
    const row = index + 1;

    cells.forEach((raw, column) => {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const header = headers[column] ?? "";
      const value = raw.trim();
      const format = formatFor(header);

      if (value === "") {
        // A blank example cell still carries its column's format — otherwise the
        // first thing the user types into it is unformatted again.
        sheet[address] = format ? { t: "z", z: format } : { t: "z" };
        return;
      }

      if (kindOf(header) === "date") {
        const serial = toExcelSerial(value);
        sheet[address] = serial
          ? { t: "n", v: serial, z: "yyyy-mm-dd" }
          : // An example the server wrote in some other shape is left as text
            // rather than guessed at — the same rule the reader follows.
            { t: "s", v: value, z: "@" };
        return;
      }

      if (kindOf(header) === "number" && /^\d+(\.\d+)?$/.test(value)) {
        sheet[address] = { t: "n", v: Number(value) };
        return;
      }

      sheet[address] = format
        ? { t: "s", v: value, z: format }
        : { t: "s", v: value };
    });
  });

  // The stubs that carry each column's format down the sheet — see
  // PREFORMATTED_ROWS for why they are load-bearing rather than tidy.
  const firstEmptyRow = grid.length;
  for (let row = firstEmptyRow; row < firstEmptyRow + preformattedRows; row += 1) {
    headers.forEach((header, column) => {
      const format = formatFor(header);
      if (!format) return;

      sheet[XLSX.utils.encode_cell({ r: row, c: column })] = {
        t: "z",
        z: format,
      };
    });
  }

  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: firstEmptyRow + preformattedRows - 1, c: headers.length - 1 },
  });

  // Wide enough to read the header, which is what a user scans to work out what
  // the column wants. A default-width sheet shows "harga_j…" on every one.
  sheet["!cols"] = headers.map((header) => ({
    wch: Math.max(12, header.length + 2, widthOf(header) ?? 0),
  }));

  const workbook = XLSX.utils.book_new();
  const appendExtra = ({ name, rows, widths, merges, heights }: ExtraSheet) => {
    const extra = XLSX.utils.aoa_to_sheet(rows);
    if (widths) extra["!cols"] = widths.map((wch) => ({ wch }));
    if (merges) extra["!merges"] = merges.map((range) => XLSX.utils.decode_range(range));
    if (heights) extra["!rows"] = heights.map((hpt) => (hpt ? { hpt } : {}));
    XLSX.utils.book_append_sheet(workbook, extra, name);
  };
  const leading = extraSheets.filter((extra) => extra.first);
  const trailing = extraSheets.filter((extra) => !extra.first);
  const order: (ExtraSheet | null)[] = [...leading, null, ...trailing];

  order.forEach((extra) =>
    extra ? appendExtra(extra) : XLSX.utils.book_append_sheet(workbook, sheet, sheetName),
  );
  workbook.Workbook = {
    Sheets: order.map((extra) => ({
      Hidden: extra?.hidden ? (1 as const) : (0 as const),
    })),
  };
  // SheetJS names the parts by position: the n-th sheet is sheetn.xml.
  const pathAt = (index: number) => `/xl/worksheets/sheet${index + 1}.xml`;

  const written: ArrayBuffer = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    // Required for the `z` formats to be written out at all — without it every
    // cell lands as General and the whole point of this file is lost.
    cellStyles: true,
  });
  const buffer = patchWorkbook(XLSX, written, {
    lists: lists.flatMap((list) => {
      const column = headers.indexOf(list.column);
      if (column < 0) return [];

      const letter = XLSX.utils.encode_col(column);
      return [{ ...list, sqref: `${letter}2:${letter}${LIST_ROWS + 1}` }];
    }),
    mainPath: pathAt(leading.length),
    styled: order.flatMap((extra, index) =>
      extra && (extra.styles || extra.gridlines === false)
        ? [{ ...extra, path: pathAt(index) }]
        : [],
    ),
  });

  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Before these, in the order the sheet schema fixes; Excel calls a file that breaks it corrupt. */
const AFTER_DATA_VALIDATIONS =
  /<(?:hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>/;

const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/*
  Buloo's tokens (styles/globals.css) as Excel's ARGB, which a stylesheet cannot
  reference: navy-800 text, navy-700 brand, navy-600, navy-100, navy-50,
  tint-success with success ink, tint-neutral, orange-100, slate-500.
*/
const INK = "FF14284B";
const BRAND = "FF1E3A6B";
const BRAND_SOFT = "FF2B4E8C";
const SKY = "FFE9EFF9";
const MIST = "FFF6F8FC";
const SUCCESS_FILL = "FFE4F3EC";
const SUCCESS_INK = "FF0F6B49";
const NEUTRAL_FILL = "FFEEF1F6";
const WARM_FILL = "FFFFF6EA";
const SLATE = "FF667691";
const WHITE = "FFFFFFFF";
const RULE = "FFD5DCE8";

const font = (color: string, size: number, extra = "") =>
  `<font>${extra}<sz val="${size}"/><color rgb="${color}"/><name val="Calibri"/><family val="2"/></font>`;

const FONTS = [
  font(WHITE, 16, "<b/>"),
  font(SLATE, 11, "<i/>"),
  font(INK, 12, "<b/>"),
  font(WHITE, 11, "<b/>"),
  font(INK, 11),
  font(INK, 11, "<b/>"),
  font(SUCCESS_INK, 11, "<b/>"),
];
const [F_TITLE, F_SUBTITLE, F_SECTION, F_HEAD, F_BODY, F_KEY, F_REQUIRED] =
  FONTS.map((_, index) => index);

const FILLS = [BRAND, SKY, BRAND_SOFT, MIST, SUCCESS_FILL, NEUTRAL_FILL, WARM_FILL];
const [P_BRAND, P_SKY, P_HEAD, P_MIST, P_SUCCESS, P_NEUTRAL, P_WARM] = FILLS.map(
  (_, index) => index,
);

const XF: Record<
  SheetStyle,
  { font: number; fill?: number; ruled?: boolean; align: string }
> = {
  title: { font: F_TITLE, fill: P_BRAND, align: `vertical="center" indent="1"` },
  subtitle: { font: F_SUBTITLE, align: `vertical="center" wrapText="1" indent="1"` },
  section: { font: F_SECTION, fill: P_SKY, align: `vertical="center" indent="1"` },
  head: { font: F_HEAD, fill: P_HEAD, ruled: true, align: `vertical="center" indent="1"` },
  body: { font: F_BODY, ruled: true, align: `vertical="top" wrapText="1" indent="1"` },
  key: { font: F_KEY, fill: P_MIST, ruled: true, align: `vertical="top" wrapText="1" indent="1"` },
  required: { font: F_REQUIRED, fill: P_SUCCESS, ruled: true, align: `horizontal="center" vertical="top"` },
  optional: { font: F_BODY, fill: P_NEUTRAL, ruled: true, align: `horizontal="center" vertical="top"` },
  step: { font: F_SECTION, fill: P_SKY, ruled: true, align: `horizontal="center" vertical="top"` },
  note: { font: F_KEY, fill: P_WARM, ruled: true, align: `vertical="top" wrapText="1" indent="1"` },
};

/** Appends to one of styles.xml's lists, fixing its count; the index of the first added. */
function appendTo(xml: string, tag: string, items: string[]): [string, number] {
  const open = new RegExp(`<${tag} count="(\\d+)">`);
  const match = open.exec(xml);
  if (!match) throw new Error(`styles.xml has no <${tag}>`);

  const first = Number(match[1]);
  const close = `</${tag}>`;
  const end = xml.indexOf(close, match.index);

  return [
    xml.slice(0, match.index) +
      `<${tag} count="${first + items.length}">` +
      xml.slice(match.index + match[0].length, end) +
      items.join("") +
      xml.slice(end),
    first,
  ];
}

/** Adds the SheetStyle looks to styles.xml; the cellXfs index of each. */
function addStyles(xml: string): [string, Record<SheetStyle, number>] {
  const [withFonts, fontBase] = appendTo(xml, "fonts", FONTS);
  const [withFills, fillBase] = appendTo(
    withFonts,
    "fills",
    FILLS.map(
      (rgb) =>
        `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`,
    ),
  );
  const side = (name: string) =>
    `<${name} style="thin"><color rgb="${RULE}"/></${name}>`;
  const [withBorders, borderId] = appendTo(withFills, "borders", [
    `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`,
  ]);

  const names = Object.keys(XF) as SheetStyle[];
  const [done, xfBase] = appendTo(
    withBorders,
    "cellXfs",
    names.map((name) => {
      const { font: fontId, fill, ruled, align } = XF[name];

      return (
        `<xf numFmtId="0" fontId="${fontBase + fontId}" fillId="${fill === undefined ? 0 : fillBase + fill}" ` +
        `borderId="${ruled ? borderId : 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
        `<alignment ${align}/></xf>`
      );
    }),
  );

  return [
    done,
    Object.fromEntries(names.map((name, index) => [name, xfBase + index])) as Record<
      SheetStyle,
      number
    >,
  ];
}

interface Patches {
  /** Where the main sheet landed, which the dropdowns go on. */
  mainPath: string;
  lists: (TemplateList & { sqref: string })[];
  styled: (ExtraSheet & { path: string })[];
}

/**
 * Dropdowns on the main sheet, and the looks of the reference sheets.
 *
 * THE FREE SHEETJS WRITES NEITHER, so they go into the finished file: the
 * workbook is a zip of XML, a `<dataValidations>` block is spliced in where the
 * schema wants it, styles are appended to styles.xml and named on their cells.
 * A dropdown warns rather than stops on a value off its list: a typed code is
 * still read, and so is a pasted Jubelio file.
 */
function patchWorkbook(
  XLSX: typeof import("xlsx"),
  buffer: ArrayBuffer,
  { mainPath, lists, styled }: Patches,
): ArrayBuffer | Uint8Array<ArrayBuffer> {
  if (lists.length === 0 && styled.length === 0) return buffer;

  const zip = XLSX.CFB.read(new Uint8Array(buffer), { type: "array" });
  const edit = (path: string, change: (xml: string) => string) => {
    const entry = XLSX.CFB.find(zip, path);
    if (!entry?.content) throw new Error(`${path} missing from the workbook`);

    const content = new TextEncoder().encode(
      change(new TextDecoder().decode(entry.content as Uint8Array)),
    );
    entry.content = content;
    entry.size = content.length;
  };

  if (lists.length > 0) {
    edit(mainPath, (xml) => {
      const at = xml.search(AFTER_DATA_VALIDATIONS);
      const block =
        `<dataValidations count="${lists.length}">` +
        lists
          .map(
            ({ sqref, source, message }) =>
              `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="warning" ` +
              `errorTitle="Tidak ada di daftar" error="${escapeXml(message)}" sqref="${sqref}">` +
              `<formula1>${escapeXml(source)}</formula1></dataValidation>`,
          )
          .join("") +
        `</dataValidations>`;

      return xml.slice(0, at) + block + xml.slice(at);
    });
  }

  if (styled.some((sheet) => sheet.styles)) {
    let xfOf = {} as Record<SheetStyle, number>;
    edit("/xl/styles.xml", (xml) => {
      const [next, ids] = addStyles(xml);
      xfOf = ids;
      return next;
    });

    styled.forEach(({ path, styles = [], gridlines }) =>
      edit(path, (xml) => {
        let next =
          gridlines === false
            ? xml.replace("<sheetView ", `<sheetView showGridLines="0" `)
            : xml;

        styles.forEach((cells, row) =>
          cells.forEach((style, column) => {
            if (!style) return;

            const ref = XLSX.utils.encode_cell({ r: row, c: column });
            next = next.replace(
              new RegExp(`<c r="${ref}"(?: s="\\d+")?`),
              `<c r="${ref}" s="${xfOf[style]}"`,
            );
          }),
        );

        return next;
      }),
    );
  } else {
    styled.forEach(({ path }) =>
      edit(path, (xml) => xml.replace("<sheetView ", `<sheetView showGridLines="0" `)),
    );
  }

  return XLSX.CFB.write(zip, {
    fileType: "zip",
    type: "array",
    compression: true,
  }) as Uint8Array<ArrayBuffer>;
}
