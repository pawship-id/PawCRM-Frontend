import { csvToTemplateWorkbook } from "@/features/inventory/utils/templateWorkbook";
import { readSheet } from "@/features/inventory/utils/sheet";

/**
 * The `.xlsx` template builder.
 *
 * WHAT IS ACTUALLY UNDER TEST is not "does it produce a file" but "does the file
 * still protect the two columns a CSV cannot". So every case here reads the
 * workbook BACK — through SheetJS for the cell formats, and through this
 * feature's own `readSheet` for the round trip a user actually performs:
 * download the template, fill it in, upload it.
 *
 * A test that only asserted the blob is non-empty would pass just as well with
 * `cellStyles` off, which is the one flag that makes the whole file pointless.
 */

/** The template the server serves, near enough for these purposes. */
const HEADER =
  "parent_sku,parent_nama,sku,nama,barcode,kategori,satuan,harga_jual,min_stock,has_expiry,stok_awal,hpp_awal,kode_batch_supplier,tgl_expired,attr_Ukuran";

const EXAMPLE =
  ",,SHAMPOO-001,Shampoo Anjing,8992700001234,Perawatan,pcs,45000,5,tidak,12,30000,,,";

const EXPIRING =
  "RC-ADULT,Royal Canin,RC-1KG,,,Makanan Kucing,pcs,120000,3,ya,10,95000,RC-2608,2027-08-01,1kg";

const TEMPLATE_CSV = [HEADER, EXAMPLE, EXPIRING].join("\n");

/** Reads a produced workbook back with SheetJS, formats intact. */
async function readBack(blob: Blob) {
  const XLSX = jest.requireActual<typeof import("xlsx")>("xlsx");
  const buffer = await blobBuffer(blob);
  const workbook = XLSX.read(buffer, {
    cellNF: true,
    cellStyles: true,
    sheetStubs: true,
  });
  return workbook.Sheets[workbook.SheetNames[0]];
}

/**
 * jsdom's Blob has no `arrayBuffer()` — but it does implement `FileReader`,
 * which is how the bytes come back here. Confined to the test rather than
 * polyfilled in production: a browser has had `Blob.arrayBuffer` since 2019, and
 * the code under test never calls it anyway.
 */
function blobBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("csvToTemplateWorkbook", () => {
  it("keeps the server's columns, in the server's order", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    expect(sheet.A1.v).toBe("parent_sku");
    expect(sheet.E1.v).toBe("barcode");
    expect(sheet.N1.v).toBe("tgl_expired");
    expect(sheet.O1.v).toBe("attr_Ukuran");
  });

  /**
   * THE REASON THIS FILE EXISTS. `0123456789012` in a General column is a
   * number, and Excel drops the leading zero before any code of ours runs — the
   * user never sees it happen and the barcode never scans again.
   */
  it("formats the barcode column as text", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    expect(sheet.E2.z).toBe("@");
    expect(sheet.E2.t).toBe("s");
  });

  it("formats sku, parent_sku and kode_batch_supplier as text too", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    expect(sheet.A3.z).toBe("@");
    expect(sheet.C2.z).toBe("@");
    expect(sheet.M3.z).toBe("@");
  });

  it("formats an attr_ column as text, whatever it is called", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    expect(sheet.O3.z).toBe("@");
  });

  /**
   * A real date cell, not a string: the serial is what makes the month
   * unambiguous, which is the one thing a CSV cannot express.
   */
  it("writes the expiry example as a date serial", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    expect(sheet.N3.t).toBe("n");
    // 2027-08-01. Asserted as the number, because the number is the point.
    expect(sheet.N3.v).toBe(46600);
    expect(sheet.N3.z).toBe("yyyy-mm-dd");
  });

  it("leaves prices numeric so a user can sum them in their own sheet", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    expect(sheet.H2.t).toBe("n");
    expect(sheet.H2.v).toBe(45000);
  });

  /**
   * WITHOUT THESE THE FORMATTING IS DECORATION. Excel formats the cell being
   * typed into, not the column as a concept — so a barcode typed on row 40 of an
   * otherwise unformatted sheet is a number again.
   */
  it("pre-formats empty rows below the examples, so later entries keep the format", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    // Row 40 is far past the two examples and well inside the stub range.
    expect(sheet.E40.z).toBe("@");
    expect(sheet.N40.z).toBe("yyyy-mm-dd");
  });

  it("leaves columns with no format rule alone", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    // `nama` is ordinary text; forcing "@" on it would be noise. Read back as
    // "General" rather than absent — SheetJS names the default format rather
    // than omitting it, which is the same thing said out loud.
    expect(sheet.D2.z === undefined || sheet.D2.z === "General").toBe(true);
  });

  it("widens columns enough to read their headers", async () => {
    const sheet = await readBack(await csvToTemplateWorkbook(TEMPLATE_CSV));

    expect(sheet["!cols"]?.[0]?.wch).toBeGreaterThanOrEqual(12);
  });

  describe("the round trip a user actually performs", () => {
    /**
     * Download the template, upload it back unchanged. This is the assertion
     * that the two halves of this feature agree — a template the reader cannot
     * read is worse than no template.
     */
    it("produces a workbook this feature's own reader accepts", async () => {
      const blob = await csvToTemplateWorkbook(TEMPLATE_CSV);
      const buffer = await blobBuffer(blob);
      const file = Object.assign(new File([buffer], "template.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      const parsed = await readSheet(file);

      expect(parsed.rows).toHaveLength(2);
      expect(parsed.rows[0].row.sku).toBe("SHAMPOO-001");
      expect(parsed.rows[0].problems).toHaveLength(0);
    });

    // The serial written on the way out is read back as the ISO date on the way
    // in — with no Date, and therefore no timezone, on either leg.
    it("round-trips the expiry date to YYYY-MM-DD", async () => {
      const blob = await csvToTemplateWorkbook(TEMPLATE_CSV);
      const buffer = await blobBuffer(blob);
      const file = Object.assign(new File([buffer], "template.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      const parsed = await readSheet(file);

      expect(parsed.rows[1].row.expiryDate).toBe("2027-08-01");
    });

    it("round-trips a barcode with a leading zero", async () => {
      const csv = [HEADER, EXAMPLE.replace("8992700001234", "0123456789012")]
        .join("\n");

      const blob = await csvToTemplateWorkbook(csv);
      const buffer = await blobBuffer(blob);
      const file = Object.assign(new File([buffer], "template.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      const parsed = await readSheet(file);

      expect(parsed.rows[0].row.barcode).toBe("0123456789012");
    });

    it("keeps the variant family intact", async () => {
      const blob = await csvToTemplateWorkbook(TEMPLATE_CSV);
      const buffer = await blobBuffer(blob);
      const file = Object.assign(new File([buffer], "template.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      const parsed = await readSheet(file);

      expect(parsed.rows[1].row.parentSku).toBe("RC-ADULT");
      expect(parsed.rows[1].row.attributes).toEqual({ Ukuran: "1kg" });
    });
  });

  it("reads a semicolon-separated template, like the rest of this feature", async () => {
    const sheet = await readBack(
      await csvToTemplateWorkbook(
        [HEADER.replace(/,/g, ";"), EXAMPLE.replace(/,/g, ";")].join("\n"),
      ),
    );

    expect(sheet.A1.v).toBe("parent_sku");
    expect(sheet.E2.z).toBe("@");
  });
});
