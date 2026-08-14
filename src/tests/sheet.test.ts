import {
  parseSheet,
  readSheet,
  SheetError,
} from "@/features/inventory/utils/sheet";

/**
 * Unit tests for the import sheet parser.
 *
 * The parser is the only place in this feature that makes a JUDGEMENT nobody
 * asked it to make — it decides what a cell meant. So these tests are mostly
 * about the readings it must NOT invent (a date, a price with currency on it)
 * and the ones a real spreadsheet forces it to handle (semicolons, quotes,
 * grouped thousands, a BOM).
 *
 * What is deliberately NOT tested here: whether a SKU is free, whether a family
 * agrees with itself, whether a category exists. None of that is the parser's —
 * it belongs to the server and is tested there, once.
 */

const HEADER =
  "parent_sku,parent_nama,sku,nama,barcode,kategori,satuan,harga_jual,min_stock,has_expiry,stok_awal,hpp_awal,kode_batch,tgl_expired";

const sheet = (...lines: string[]) => [HEADER, ...lines].join("\n");

describe("parseSheet", () => {
  describe("the shape of the file", () => {
    it("reads a plain row into API field names", () => {
      const result = parseSheet(
        sheet(",,SHAMPOO-001,Shampoo Anjing,899270,Perawatan,pcs,45000,5,tidak,,,,"),
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].row).toMatchObject({
        rowNumber: 2,
        sku: "SHAMPOO-001",
        name: "Shampoo Anjing",
        barcode: "899270",
        categoryName: "Perawatan",
        unit: "pcs",
        sellPrice: "45000",
        minStock: 5,
      });
    });

    /**
     * The row number is what makes a five-hundred-row file fixable, and it is
     * Excel's own gutter number — the header is row 1.
     */
    it("numbers rows the way Excel does", () => {
      const result = parseSheet(
        sheet(",,A,A,,K,,1,,,,,,", ",,B,B,,K,,1,,,,,,"),
      );

      expect(result.rows.map((r) => r.row.rowNumber)).toEqual([2, 3]);
    });

    it("skips blank lines without spending a row number on them", () => {
      const result = parseSheet(
        sheet(",,A,A,,K,,1,,,,,,", ",,,,,,,,,,,,,", ",,B,B,,K,,1,,,,,,"),
      );

      // The empty line is row 3 in Excel; B is row 4 and says so.
      expect(result.rows.map((r) => r.row.rowNumber)).toEqual([2, 4]);
    });

    it("strips the BOM the backend's own template carries", () => {
      const result = parseSheet(`﻿${sheet(",,A,A,,K,,1,,,,,,")}`);

      expect(result.rows[0].row.sku).toBe("A");
    });

    it("reads CRLF, which is what Excel on Windows writes", () => {
      const result = parseSheet(
        `${HEADER}\r\n,,A,A,,K,,1,,,,,,\r\n,,B,B,,K,,1,,,,,,\r\n`,
      );

      expect(result.rows).toHaveLength(2);
    });

    /**
     * Excel writes CSV with the SYSTEM list separator, and on an Indonesian
     * locale that is a semicolon. Parsed as commas the whole file is one column,
     * every header is unknown, and the error names a column the user can see
     * perfectly well in front of them.
     */
    it("reads a semicolon-separated file, which Indonesian Excel produces", () => {
      const result = parseSheet(
        [
          HEADER.replace(/,/g, ";"),
          ";;SHAMPOO;Shampoo;;Perawatan;pcs;45000;;;;;;",
        ].join("\n"),
      );

      expect(result.rows[0].row.sku).toBe("SHAMPOO");
      expect(result.rows[0].row.sellPrice).toBe("45000");
    });

    // A product name with a comma in it is quoted by every spreadsheet on earth,
    // and splitting on the delimiter turns one row into two columns of nonsense
    // that still parse.
    it("keeps a quoted field containing the delimiter in one piece", () => {
      const result = parseSheet(
        sheet(`,,RC,"Royal Canin, Adult",,Makanan,,120000,,,,,,`),
      );

      expect(result.rows[0].row.name).toBe("Royal Canin, Adult");
    });

    it("unescapes a doubled quote", () => {
      const result = parseSheet(
        sheet(`,,RC,"Kemasan 3"" besar",,Makanan,,120000,,,,,,`),
      );

      expect(result.rows[0].row.name).toBe('Kemasan 3" besar');
    });

    it("keeps a newline inside a quoted field", () => {
      const result = parseSheet(
        sheet(`,,RC,"Baris satu\nBaris dua",,Makanan,,120000,,,,,,`),
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].row.name).toBe("Baris satu\nBaris dua");
    });

    it("matches headers case-insensitively and ignores padding", () => {
      const result = parseSheet(
        [" SKU , Nama , Harga_Jual ", "A,Produk A,1000"].join("\n"),
      );

      expect(result.rows[0].row.sku).toBe("A");
      expect(result.rows[0].row.sellPrice).toBe("1000");
    });
  });

  describe("blank cells", () => {
    /**
     * The API distinguishes "not filled in" from "cleared", and an import only
     * ever means the first. Sending `""` would be asserting something the sheet
     * never said.
     */
    it("omits a key rather than sending an empty string", () => {
      const result = parseSheet(sheet(",,A,Produk A,,Kategori,,1000,,,,,,"));
      const { row } = result.rows[0];

      expect(row).not.toHaveProperty("barcode");
      expect(row).not.toHaveProperty("openingQty");
      expect(row).not.toHaveProperty("unit");
    });
  });

  describe("attr_* columns", () => {
    it("strips the prefix and keeps the header's own case", () => {
      const result = parseSheet(
        [
          `${HEADER},attr_Ukuran,attr_Rasa`,
          "RC-ADULT,Royal Canin,RC-1KG,,,Makanan,,120000,,,,,,,1kg,Chicken",
        ].join("\n"),
      );

      // Cased as the HEADER wrote it: the axis name becomes a stored attribute
      // and a POS label, so `attr_Ukuran` must not arrive as "ukuran".
      expect(result.rows[0].row.attributes).toEqual({
        Ukuran: "1kg",
        Rasa: "Chicken",
      });
    });

    it("leaves attributes absent when no attr_ cell is filled in", () => {
      const result = parseSheet(
        [`${HEADER},attr_Ukuran`, ",,A,Produk A,,K,,1000,,,,,,,"].join("\n"),
      );

      expect(result.rows[0].row).not.toHaveProperty("attributes");
    });
  });

  describe("numbers", () => {
    it("accepts a plain decimal", () => {
      const result = parseSheet(sheet(",,A,A,,K,,45000.50,,,,,,"));

      expect(result.rows[0].row.sellPrice).toBe("45000.50");
      expect(result.rows[0].problems).toHaveLength(0);
    });

    /**
     * Excel adds these on its own, in whichever style the locale uses. A user
     * who typed a perfectly good price should not be refused over punctuation
     * their spreadsheet inserted.
     */
    it.each(["1.250.000", "1,250,000"])(
      "strips grouped thousands from %s",
      (value) => {
        const result = parseSheet(
          sheet(`,,A,A,,K,,"${value}",,,,,,`),
        );

        expect(result.rows[0].row.sellPrice).toBe("1250000");
      },
    );

    it("reads a single comma as a decimal point", () => {
      const result = parseSheet(sheet(`,,A,A,,K,,"45000,50",,,,,,`));

      expect(result.rows[0].row.sellPrice).toBe("45000.50");
    });

    /**
     * Refused rather than repaired. Stripping "Rp" and the trailing dash would
     * be inventing a price, and this is the number every invoice is built from.
     */
    it("refuses a price with currency on it, naming the column", () => {
      const result = parseSheet(sheet(`,,A,A,,K,,"Rp 45.000,-",,,,,,`));

      expect(result.rows[0].problems[0].field).toBe("harga_jual");
      expect(result.rows[0].row).not.toHaveProperty("sellPrice");
    });

    it("refuses a non-integer min_stock", () => {
      const result = parseSheet(sheet(",,A,A,,K,,1000,banyak,,,,,"));

      expect(result.rows[0].problems[0].field).toBe("min_stock");
    });
  });

  describe("dates", () => {
    it("accepts YYYY-MM-DD", () => {
      const result = parseSheet(sheet(",,A,A,,K,,1000,,ya,5,3000,B1,2027-08-01"));

      expect(result.rows[0].row.expiryDate).toBe("2027-08-01");
      expect(result.rows[0].problems).toHaveLength(0);
    });

    /**
     * THE ONE PLACE THE PARSER REFUSES TO GUESS. 01/08/2027 is the 1st of August
     * in Jakarta and the 8th of January in New York, and this cell decides when a
     * batch of cat food comes off the shelf. A parser that picks a reading will
     * eventually pick the wrong one silently.
     */
    it.each(["01/08/2027", "8/1/27", "1 Agustus 2027"])(
      "refuses %s rather than guessing which number is the month",
      (value) => {
        const result = parseSheet(
          sheet(`,,A,A,,K,,1000,,ya,5,3000,B1,${value}`),
        );

        expect(result.rows[0].problems[0].field).toBe("tgl_expired");
        expect(result.rows[0].row).not.toHaveProperty("expiryDate");
      },
    );

    it("tells the user how to stop Excel reformatting the column", () => {
      const result = parseSheet(sheet(",,A,A,,K,,1000,,ya,5,3000,B1,01/08/2027"));

      expect(result.rows[0].problems[0].message).toContain("Teks");
    });
  });

  describe("units", () => {
    it("lowercases a unit so PCS is accepted", () => {
      const result = parseSheet(sheet(",,A,A,,K,PCS,1000,,,,,,"));

      expect(result.rows[0].row.unit).toBe("pcs");
    });

    it("refuses an unknown unit and names the three that work", () => {
      const result = parseSheet(sheet(",,A,A,,K,botol,1000,,,,,,"));

      expect(result.rows[0].problems[0].field).toBe("satuan");
      expect(result.rows[0].problems[0].message).toContain("pcs");
    });
  });

  describe("has_expiry", () => {
    // Passed through as written: the API accepts every spelling a sheet
    // produces, so translating here would add a second opinion about "Y".
    it.each(["ya", "Y", "1", "tidak", "0"])("passes %s through as written", (value) => {
      const result = parseSheet(sheet(`,,A,A,,K,,1000,,${value},,,,`));

      expect(result.rows[0].row.hasExpiry).toBe(value);
    });
  });

  describe("what the sheet tells the screen", () => {
    it("reports needsWarehouse when some row carries opening stock", () => {
      const withStock = parseSheet(sheet(",,A,A,,K,,1000,,,12,3000,,"));
      const without = parseSheet(sheet(",,A,A,,K,,1000,,,,,,"));

      expect(withStock.needsWarehouse).toBe(true);
      expect(without.needsWarehouse).toBe(false);
    });

    /**
     * A silently-ignored column is how `hpp_awl` becomes an import with no cost
     * basis: every row passes, the products are created, and the balance sheet
     * is wrong in a way nobody looks for.
     */
    it("names a column it did not recognise instead of dropping it", () => {
      const result = parseSheet(
        [`${HEADER},hpp_awl`, ",,A,A,,K,,1000,,,,,,,3000"].join("\n"),
      );

      expect(result.unknownColumns).toEqual(["hpp_awl"]);
    });

    it("does not report attr_ columns as unknown", () => {
      const result = parseSheet(
        [`${HEADER},attr_Ukuran`, ",,A,A,,K,,1000,,,,,,,1kg"].join("\n"),
      );

      expect(result.unknownColumns).toEqual([]);
    });
  });

  describe("files it refuses outright", () => {
    it("names the required columns that are missing", () => {
      expect(() => parseSheet("nama,kategori\nProduk A,Kategori")).toThrow(
        /sku/,
      );
    });

    it("refuses a header with no data under it", () => {
      expect(() => parseSheet(HEADER)).toThrow(SheetError);
    });

    it("refuses an empty file", () => {
      expect(() => parseSheet("")).toThrow(SheetError);
    });
  });
});

describe("readSheet", () => {
  /**
   * jsdom's `File` implements neither `Blob.text()` nor `Blob.arrayBuffer()`,
   * both of which browsers have had since 2019 (Chrome 76, Firefox 69, Safari
   * 14). Polyfilled on the instance rather than worked around in `sheet.ts`: a
   * `FileReader` dance in production code to satisfy a test environment is the
   * test dictating the design.
   */
  const csvFile = (text: string, name: string) =>
    Object.assign(new File([text], name), {
      text: () => Promise.resolve(text),
    }) as File;

  /**
   * A REAL workbook, built by the same library that reads it back.
   *
   * Not a mock and not a checked-in binary fixture. A mock would assert that the
   * code calls SheetJS, which is not in doubt; what IS in doubt is what SheetJS
   * hands back for a date, a currency-formatted price and a boolean — the three
   * cell types `cellText` exists to handle. Round-tripping through the real
   * encoder is the only way to find that out, and it keeps the fixture readable
   * as source instead of opaque as bytes.
   */
  const xlsxFile = (
    aoa: unknown[][],
    { name = "produk.xlsx", sheets = 1 } = {},
  ) => {
    const XLSX = jest.requireActual<typeof import("xlsx")>("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(aoa),
      "Produk",
    );
    for (let i = 1; i < sheets; i += 1) {
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([["kosong"]]),
        `Lain${i}`,
      );
    }

    const buffer: ArrayBuffer = XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
    });

    return Object.assign(new File([buffer], name), {
      arrayBuffer: () => Promise.resolve(buffer),
    }) as File;
  };

  /** The header, as a workbook row. */
  const HEADER_ROW = HEADER.split(",");

  /**
   * Refused BY NAME rather than allowed to fail as mojibake. A CSV parser fed a
   * binary .xlsx produces a grid of noise, every header is unknown, and the
   * message the user gets is about columns rather than about the format they
   * chose.
   */
  it("reads a .csv file", async () => {
    const file = csvFile(sheet(",,A,Produk A,,K,,1000,,,,,,"), "produk.csv");

    const result = await readSheet(file);
    expect(result.rows[0].row.sku).toBe("A");
  });

  describe("workbooks", () => {
    it("reads an .xlsx into the same shape a .csv produces", async () => {
      const file = xlsxFile([
        HEADER_ROW,
        ["", "", "SHAMPOO-001", "Shampoo Anjing", "", "Perawatan", "pcs", 45000],
      ]);

      const result = await readSheet(file);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].row).toMatchObject({
        rowNumber: 2,
        sku: "SHAMPOO-001",
        name: "Shampoo Anjing",
        sellPrice: "45000",
      });
      expect(result.rows[0].problems).toHaveLength(0);
    });

    /**
     * THE REASON .xlsx IS WORTH SUPPORTING AT ALL.
     *
     * Excel stores a date as a serial number, so the workbook knows which part
     * is the month — the DD/MM ambiguity that forces the CSV reader to refuse
     * `01/08/2027` does not exist here. This asserts the serial comes back
     * canonical AND that no `Date` was built on the way, since every route
     * through one is a route through the runtime's timezone.
     */
    it("reads a real date cell as YYYY-MM-DD, with no timezone in the path", async () => {
      const XLSX = jest.requireActual<typeof import("xlsx")>("xlsx");
      const sheetData = XLSX.utils.aoa_to_sheet([
        HEADER_ROW,
        ["", "", "A", "Produk A", "", "K", "", 1000, "", "ya", 5, 3000, "B1", null],
      ]);
      // Serial 46600 is 2027-08-01, formatted the way Excel's own date cells are.
      sheetData.N2 = { t: "n", v: 46600, z: "m/d/yy" };

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheetData, "Produk");
      const buffer: ArrayBuffer = XLSX.write(workbook, {
        type: "array",
        bookType: "xlsx",
      });
      const file = Object.assign(new File([buffer], "produk.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      const result = await readSheet(file);

      expect(result.rows[0].row.expiryDate).toBe("2027-08-01");
      expect(result.rows[0].problems).toHaveLength(0);
    });

    /**
     * The raw value, never the displayed one. `cell.w` for this cell is
     * "Rp45.000,00", which the decimal reader would refuse — a user rejected for
     * formatting their own spreadsheet.
     */
    it("reads a currency-formatted price as its raw number", async () => {
      const XLSX = jest.requireActual<typeof import("xlsx")>("xlsx");
      const sheetData = XLSX.utils.aoa_to_sheet([
        HEADER_ROW,
        ["", "", "A", "Produk A", "", "K", "", 45000],
      ]);
      sheetData.H2 = { t: "n", v: 45000, z: '"Rp"#,##0.00' };

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheetData, "Produk");
      const buffer: ArrayBuffer = XLSX.write(workbook, {
        type: "array",
        bookType: "xlsx",
      });
      const file = Object.assign(new File([buffer], "produk.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      const result = await readSheet(file);

      expect(result.rows[0].row.sellPrice).toBe("45000");
      expect(result.rows[0].problems).toHaveLength(0);
    });

    it("reads a TRUE cell as something the API accepts for has_expiry", async () => {
      const file = xlsxFile([
        HEADER_ROW,
        ["", "", "A", "Produk A", "", "K", "", 1000, "", true],
      ]);

      const result = await readSheet(file);

      expect(result.rows[0].row.hasExpiry).toBe("true");
    });

    it("keeps attr_ columns and their case", async () => {
      const file = xlsxFile([
        [...HEADER_ROW, "attr_Ukuran"],
        [
          "RC-ADULT",
          "Royal Canin",
          "RC-1KG",
          "",
          "",
          "Makanan",
          "",
          120000,
          "",
          "",
          "",
          "",
          "",
          "",
          "1kg",
        ],
      ]);

      const result = await readSheet(file);

      expect(result.rows[0].row.attributes).toEqual({ Ukuran: "1kg" });
    });

    /**
     * A workbook whose used range starts at A3 — two blank rows the user left at
     * the top. Without aligning the grid to the sheet's own gutter, every row
     * number this feature reports would be off by two, and the row number is the
     * one thing the user navigates by.
     */
    it("numbers rows by Excel's gutter even when the header is not on row 1", async () => {
      const file = xlsxFile([
        [],
        [],
        HEADER_ROW,
        ["", "", "A", "Produk A", "", "K", "", 1000],
      ]);

      const result = await readSheet(file);

      expect(result.rows[0].row.rowNumber).toBe(4);
    });

    it("names the sheet it read when the workbook has more than one", async () => {
      const file = xlsxFile(
        [HEADER_ROW, ["", "", "A", "Produk A", "", "K", "", 1000]],
        { sheets: 2 },
      );

      const result = await readSheet(file);

      expect(result.sheetName).toBe("Produk");
    });

    // Saying which sheet was read is only useful when there was a choice.
    it("stays quiet about the sheet name on a single-sheet workbook", async () => {
      const file = xlsxFile([
        HEADER_ROW,
        ["", "", "A", "Produk A", "", "K", "", 1000],
      ]);

      const result = await readSheet(file);

      expect(result.sheetName).toBeNull();
    });

    /**
     * SHEETJS DOES NOT REJECT GARBAGE, and this test exists to record that
     * rather than to assert a guard that does not fire.
     *
     * Handed bytes that are not a workbook at all, 0.20.3 returns a sheet made
     * of nonsense instead of throwing — so the `catch` around `XLSX.read` is not
     * what protects this path. The required-column check is, and the message the
     * user gets is the useful one either way: it names the columns and points at
     * the template. If a future version starts throwing, the catch is already
     * there and the message changes; both are acceptable, which is why this
     * asserts a `SheetError` and the two sentences it can be.
     */
    it("turns an unreadable file into an actionable error, not a crash", async () => {
      // Byte-built rather than via TextEncoder, which jsdom does not expose.
      const buffer = Uint8Array.from(
        [..."not a workbook"].map((char) => char.charCodeAt(0)),
      ).buffer;
      const file = Object.assign(new File([buffer], "produk.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      await expect(readSheet(file)).rejects.toThrow(
        /Kolom wajib tidak ditemukan|tidak bisa dibaca|kosong/,
      );
      await expect(readSheet(file)).rejects.toThrow(SheetError);
    });

    it("still applies the required-column check to a workbook", async () => {
      const file = xlsxFile([
        ["nama", "kategori"],
        ["Produk A", "Kategori"],
      ]);

      await expect(readSheet(file)).rejects.toThrow(/sku/);
    });
  });
});
