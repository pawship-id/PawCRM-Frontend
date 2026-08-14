import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImportScreen } from "@/features/inventory";
import { productImportService } from "@/services/productImport.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { ImportPreview, ImportResult } from "@/types/productImport";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/productImport.service");
jest.mock("@/services/warehouse.service");

/**
 * The bulk import screen, against mocked services.
 *
 * WHAT THESE TESTS GUARD, in the order the design would regress:
 *
 *  1. THE SCREEN DECIDES NOTHING ABOUT THE DATA. `canCommit` comes from the
 *     server's preview and is passed through — a locally derived "looks fine to
 *     me" is how a client ends up enabling a button the API then refuses.
 *  2. LOCAL PROBLEMS CAN ONLY DISABLE, NEVER ENABLE. A cell the parser could not
 *     read was never sent, so the server's verdict for that row is uninformed
 *     and must not be trusted over it.
 *  3. A NEW FILE INVALIDATES THE OLD VERDICTS. Otherwise the preview of one file
 *     sits beside the row count of another.
 *  4. THE PARTIAL OUTCOMES ARE VISIBLE. `failed[]` and `openingStockPosted:
 *     false` are the two things a green tick would hide, and both are real.
 *
 * The Radix select is not driven — jsdom cannot do its pointer protocol — so the
 * warehouse is exercised through the button's disabled state instead.
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

const HEADER =
  "parent_sku,parent_nama,sku,nama,barcode,kategori,satuan,harga_jual,min_stock,has_expiry,stok_awal,hpp_awal,kode_batch,tgl_expired";

/**
 * jsdom's File has no `Blob.text()`. Polyfilled on the instance — see
 * sheet.test.ts for why this is not worked around in production code.
 */
const csvFile = (lines: string[], name = "produk.csv") => {
  const text = [HEADER, ...lines].join("\n");
  return Object.assign(new File([text], name), {
    text: () => Promise.resolve(text),
  }) as File;
};

const CLEAN_ROW = ",,SHAMPOO-001,Shampoo Anjing,,Perawatan,,45000,,,,,,";
const ROW_WITH_STOCK = ",,SHAMPOO-001,Shampoo Anjing,,Perawatan,,45000,,,12,30000,,";

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    warehouseName: null,
    canCommit: true,
    summary: {
      rows: 1,
      ok: 1,
      conflict: 0,
      duplicateInFile: 0,
      familyConflict: 0,
      invalid: 0,
      standaloneProducts: 1,
      families: 0,
      variants: 0,
    },
    rows: [
      { rowNumber: 2, sku: "SHAMPOO-001", status: "ok", problems: [] },
    ],
    ...overrides,
  };
}

function result(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    warehouseName: "Gudang Utama",
    summary: {
      ...preview().summary,
      createdCount: 1,
      failedCount: 0,
    },
    created: [
      {
        kind: "standalone",
        rowNumbers: [2],
        productId: "p1",
        sku: "SHAMPOO-001",
        name: "Shampoo Anjing",
        variantCount: 0,
        openingStockPosted: true,
        openingStockError: null,
      },
    ],
    failed: [],
    ...overrides,
  };
}

/** Picks a file through the hidden input, as the dropzone's button would. */
async function upload(file: File) {
  const input = screen.getByLabelText("Pilih file CSV atau Excel");
  await userEvent.upload(input, file);
}

beforeEach(() => {
  jest.clearAllMocks();

  asMock(warehouseService.list).mockResolvedValue({
    items: [
      {
        _id: "wh1",
        name: "Gudang Utama",
        isActive: true,
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as Awaited<ReturnType<typeof warehouseService.list>>);

  asMock(productImportService.preview).mockResolvedValue(preview());
  asMock(productImportService.commit).mockResolvedValue(result());
});

describe("ImportScreen", () => {
  describe("step 1 — picking a file", () => {
    it("offers the template before anything else", async () => {
      renderWithAuth(<ImportScreen />);

      expect(
        await screen.findByRole("button", { name: /unduh template/i }),
      ).toBeInTheDocument();
      // The warehouse list loads on mount and resolves after this assertion
      // would otherwise have ended the test — awaited so React settles inside
      // the test rather than warning about an update outside act().
      await waitFor(() => expect(warehouseService.list).toHaveBeenCalled());
    });

    /**
     * BOTH FORMATS ARE REACHABLE, and the menu says which to pick. Two
     * equal-looking buttons would have left the user choosing on the strength of
     * the extension alone, and the .xlsx is the one whose barcode column cannot
     * silently drop a leading zero.
     */
    it("puts both formats behind the one button, xlsx recommended", async () => {
      renderWithAuth(<ImportScreen />);
      await userEvent.click(
        await screen.findByRole("button", { name: /unduh template/i }),
      );

      const xlsx = await screen.findByRole("menuitem", { name: /excel/i });
      expect(xlsx).toHaveTextContent(/disarankan/i);
      expect(
        screen.getByRole("menuitem", { name: /csv/i }),
      ).toBeInTheDocument();
    });

    /**
     * ONE SOURCE, TWO FILES. The server serves CSV and only CSV; the workbook is
     * built in the browser from it, so a column added server-side appears in both
     * downloads with no change on this side.
     */
    it("builds both downloads from the one template the server serves", async () => {
      asMock(productImportService.template).mockResolvedValue({
        blob: new Blob(["sku,nama,harga_jual\nA,Produk A,1000"]),
        filename: "template-import-produk.csv",
      });

      renderWithAuth(<ImportScreen />);

      for (const format of [/excel/i, /csv/i]) {
        await userEvent.click(
          screen.getByRole("button", { name: /unduh template/i }),
        );
        await userEvent.click(
          await screen.findByRole("menuitem", { name: format }),
        );
      }

      await waitFor(() =>
        expect(productImportService.template).toHaveBeenCalledTimes(2),
      );
    });

    it("shows the parsed row count once a file is read", async () => {
      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));

      expect(await screen.findByText(/1 baris terbaca/)).toBeInTheDocument();
    });

    /**
     * A file the parser cannot make sense of must SAY so. The screen's whole
     * value is that problems are visible, and the first thing that can go wrong
     * is the file itself — a dropzone that silently stays empty is the one
     * failure the user cannot act on.
     *
     * Dropped rather than picked, because drag-and-drop bypasses the input's
     * `accept` filter and is therefore the path that actually admits anything.
     */
    it("reports a file it cannot read instead of staying silently empty", async () => {
      renderWithAuth(<ImportScreen />);

      /*
        Named .xlsx so it takes the workbook path, and genuinely not a workbook.
        An EMPTY buffer is not enough — SheetJS reads it as a blank sheet and the
        run gets as far as the missing-columns check, which is a different (and
        also correct) message. These bytes are what makes the reader itself fail.
      */
      const buffer = Uint8Array.from(
        [..."not a workbook"].map((char) => char.charCodeAt(0)),
      ).buffer;
      const file = Object.assign(new File([buffer], "produk.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      fireEvent.drop(screen.getByText(/tarik file ke sini/i).parentElement!, {
        dataTransfer: { files: [file] },
      });

      /*
        The message is about the COLUMNS, not about the format, and that is the
        real behaviour rather than a compromise: SheetJS reads garbage into a
        garbage sheet instead of throwing, so what catches this is the
        required-column check — and "isi pakai templatenya" is the right next
        step for a user who uploaded the wrong file anyway.
      */
      expect(
        await screen.findByText(/Kolom wajib tidak ditemukan/i),
      ).toBeInTheDocument();
    });

    it("reads a workbook the same way it reads a CSV", async () => {
      const XLSX = jest.requireActual<typeof import("xlsx")>("xlsx");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          HEADER.split(","),
          ["", "", "SHAMPOO-001", "Shampoo Anjing", "", "Perawatan", "", 45000],
        ]),
        "Produk",
      );
      const buffer: ArrayBuffer = XLSX.write(workbook, {
        type: "array",
        bookType: "xlsx",
      });
      const file = Object.assign(new File([buffer], "produk.xlsx"), {
        arrayBuffer: () => Promise.resolve(buffer),
      }) as File;

      renderWithAuth(<ImportScreen />);
      await upload(file);

      expect(await screen.findByText(/1 baris terbaca/)).toBeInTheDocument();
    });

    // A misspelled `hpp_awl` would otherwise import a whole catalogue with no
    // cost basis, and nothing on screen would have said so.
    it("names a column it did not recognise", async () => {
      const file = Object.assign(
        new File([""], "produk.csv"),
        {
          text: () =>
            Promise.resolve(
              [`${HEADER},hpp_awl`, `${CLEAN_ROW},3000`].join("\n"),
            ),
        },
      ) as File;

      renderWithAuth(<ImportScreen />);
      await upload(file);

      expect(await screen.findByText(/hpp_awl/)).toBeInTheDocument();
    });
  });

  describe("the warehouse", () => {
    it("is not asked for when no row carries opening stock", async () => {
      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));

      await screen.findByText(/1 baris terbaca/);
      expect(
        screen.queryByLabelText(/gudang untuk stok awal/i),
      ).not.toBeInTheDocument();
    });

    it("is asked for, and blocks the check, when a row does", async () => {
      renderWithAuth(<ImportScreen />);
      await upload(csvFile([ROW_WITH_STOCK]));

      expect(
        await screen.findByText(/pilih gudang dulu/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /periksa file/i })).toBeDisabled();
    });
  });

  describe("step 2 — checking", () => {
    it("sends the parsed rows and renders the server's counters", async () => {
      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );

      await waitFor(() =>
        expect(productImportService.preview).toHaveBeenCalledWith({
          rows: [
            expect.objectContaining({ rowNumber: 2, sku: "SHAMPOO-001" }),
          ],
        }),
      );
      expect(await screen.findByText("1 / 1")).toBeInTheDocument();
    });

    it("renders a server verdict against its own row number", async () => {
      asMock(productImportService.preview).mockResolvedValue(
        preview({
          canCommit: false,
          summary: { ...preview().summary, ok: 0, conflict: 1 },
          rows: [
            {
              rowNumber: 2,
              sku: "SHAMPOO-001",
              status: "conflict",
              problems: [
                { field: "sku", message: "SKU sudah ada di katalog" },
              ],
            },
          ],
        }),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );

      expect(await screen.findByText("Sudah ada")).toBeInTheDocument();
      expect(
        screen.getByText(/SKU sudah ada di katalog/),
      ).toBeInTheDocument();
    });

    /**
     * The parser's own problems have no server verdict behind them: the cell was
     * never sent, so the server's opinion of that row is uninformed. Shown in the
     * same table because they are the same thing to the person fixing them.
     */
    it("shows a cell the parser rejected without waiting for the server", async () => {
      renderWithAuth(<ImportScreen />);
      await upload(
        csvFile([",,A,Produk A,,Kategori,,Rp 45.000,-,,,,,,"]),
      );

      expect(await screen.findByText(/harga_jual/)).toBeInTheDocument();
      expect(productImportService.preview).not.toHaveBeenCalled();
    });

    it("reports a failed check instead of leaving stale counters up", async () => {
      asMock(productImportService.preview).mockRejectedValue(
        new ApiError("Validation failed", 400),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );

      expect(await screen.findByText("Validation failed")).toBeInTheDocument();
    });

    // Otherwise the preview of one file sits beside the row count of another.
    it("drops the previous verdicts when a new file is picked", async () => {
      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );
      await screen.findByText("1 / 1");

      await upload(csvFile([CLEAN_ROW, CLEAN_ROW.replace("001", "002")]));

      await waitFor(() =>
        expect(screen.queryByText("1 / 1")).not.toBeInTheDocument(),
      );
      expect(await screen.findByText(/2 baris terbaca/)).toBeInTheDocument();
    });
  });

  describe("step 3 — the gate", () => {
    it("keeps commit disabled until the file has been checked", async () => {
      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));

      expect(
        await screen.findByRole("button", { name: /buat semua produk/i }),
      ).toBeDisabled();
      expect(screen.getByText(/periksa filenya dulu/i)).toBeInTheDocument();
    });

    // The server said no. The client does not get a second opinion.
    it("respects canCommit: false even when every row looks fine locally", async () => {
      asMock(productImportService.preview).mockResolvedValue(
        preview({ canCommit: false }),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );
      await screen.findByText("1 / 1");

      expect(
        screen.getByRole("button", { name: /buat semua produk/i }),
      ).toBeDisabled();
    });

    /**
     * The server said yes about rows it was given — but a row whose price the
     * parser could not read was never among them, so its `ok` is uninformed.
     * Local problems may only ever tighten the gate.
     */
    it("stays disabled on a local problem even when the server says canCommit", async () => {
      asMock(productImportService.preview).mockResolvedValue(
        preview({ canCommit: true }),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([",,A,Produk A,,Kategori,botol,45000,,,,,,"]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /buat semua produk/i }),
        ).toBeDisabled(),
      );
    });

    it("commits and shows the report", async () => {
      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );
      await screen.findByText("1 / 1");
      await userEvent.click(
        screen.getByRole("button", { name: /buat semua produk/i }),
      );

      expect(await screen.findByText(/selesai/i)).toBeInTheDocument();
      expect(screen.getByText("Shampoo Anjing")).toBeInTheDocument();
    });

    /**
     * The catalogue moved between the two screens, so the green rows on screen
     * are the stale reading that let the commit be attempted. Leaving them up
     * would show a refusal beside a table saying everything is fine.
     */
    it("clears the stale preview when the commit is refused", async () => {
      asMock(productImportService.commit).mockRejectedValue(
        new ApiError("Import refused: 1 of 1 rows still have problems", 400),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );
      await screen.findByText("1 / 1");
      await userEvent.click(
        screen.getByRole("button", { name: /buat semua produk/i }),
      );

      expect(await screen.findByText(/import refused/i)).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText("1 / 1")).not.toBeInTheDocument(),
      );
    });
  });

  describe("the report", () => {
    // The two outcomes a green tick would hide.
    it("names what failed, and says the rest is already in", async () => {
      asMock(productImportService.commit).mockResolvedValue(
        result({
          summary: { ...result().summary, createdCount: 1, failedCount: 1 },
          failed: [
            {
              kind: "standalone",
              rowNumbers: [3],
              sku: "DUP-1",
              message: "SKU already exists",
            },
          ],
        }),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );
      await screen.findByText("1 / 1");
      await userEvent.click(
        screen.getByRole("button", { name: /buat semua produk/i }),
      );

      expect(await screen.findByText(/selesai sebagian/i)).toBeInTheDocument();
      expect(screen.getByText(/DUP-1/)).toBeInTheDocument();
      expect(screen.getByText(/yang sudah masuk tetap ada/i)).toBeInTheDocument();
    });

    /**
     * THREE OUTCOMES, NOT TWO. Collapsing "nothing failed but some stock did not
     * post" into the failure message produced "selesai sebagian … 0 gagal" — a
     * sentence that contradicts itself and points the user at a failure that
     * never happened. This is the regression guard.
     */
    it("does not call a run with zero failures 'selesai sebagian'", async () => {
      asMock(productImportService.commit).mockResolvedValue(
        result({
          created: [
            {
              ...result().created[0],
              openingStockPosted: false,
              openingStockError:
                "Chart of accounts is missing account 3101; cannot post this movement",
            },
          ],
        }),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );
      await screen.findByText("1 / 1");
      await userEvent.click(
        screen.getByRole("button", { name: /buat semua produk/i }),
      );

      expect(
        await screen.findByText(/produk berhasil dibuat/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/selesai sebagian/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/0.*gagal/i)).not.toBeInTheDocument();
    });

    /**
     * A manual adjustment credits 4901 Pendapatan Lain-lain — right for stock
     * found in a count, wrong for stock the owner already had, which is capital
     * against 3101. So when the ledger refused over a missing account, the screen
     * must not send the user to the adjustment form as if it were equivalent.
     */
    it("points a missing-account failure at the chart of accounts, not at an adjustment", async () => {
      asMock(productImportService.commit).mockResolvedValue(
        result({
          created: [
            {
              ...result().created[0],
              openingStockPosted: false,
              openingStockError:
                "Chart of accounts is missing account 3101; cannot post this movement",
            },
          ],
        }),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );
      await screen.findByText("1 / 1");
      await userEvent.click(
        screen.getByRole("button", { name: /buat semua produk/i }),
      );

      expect(
        await screen.findByRole("link", { name: /chart of accounts/i }),
      ).toBeInTheDocument();
      // And says why the adjustment screen is the wrong instrument here.
      expect(screen.getByText(/pendapatan lain-lain/i)).toBeInTheDocument();
    });

    it("surfaces a product whose opening stock never posted", async () => {
      asMock(productImportService.commit).mockResolvedValue(
        result({
          created: [
            {
              ...result().created[0],
              openingStockPosted: false,
              openingStockError: "Ledger refused",
            },
          ],
        }),
      );

      renderWithAuth(<ImportScreen />);
      await upload(csvFile([CLEAN_ROW]));
      await userEvent.click(
        await screen.findByRole("button", { name: /periksa file/i }),
      );
      await screen.findByText("1 / 1");
      await userEvent.click(
        screen.getByRole("button", { name: /buat semua produk/i }),
      );

      expect(
        await screen.findByText(/stok awal belum tercatat/i),
      ).toBeInTheDocument();
      expect(screen.getByText("Ledger refused")).toBeInTheDocument();
      // Re-importing would collide on the SKU, so the way out is an adjustment.
      expect(
        screen.getByRole("link", { name: /penyesuaian stok/i }),
      ).toBeInTheDocument();
    });
  });
});
