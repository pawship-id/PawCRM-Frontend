import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OpnameImportDialog } from "@/features/inventory/components/OpnameImportDialog";
import { useOpnameSheet } from "@/features/inventory/hooks/useOpnameSheet";
import {
  OPNAME_TEMPLATE_COLUMNS,
  readOpnameSheet,
  saveOpnameTemplate,
} from "@/features/inventory/utils/opnameImport";
import { actionLabel } from "@/features/audit-logs/constants";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { Opname } from "@/types/inventory";
import type {
  OpnameImportPreview,
  OpnameImportVerdict,
} from "@/types/opnameImport";
import { saveFile } from "@/utils/saveFile";
import { SheetError } from "@/utils/sheetReader";

import { renderWithAuth as render } from "./helpers/renderWithAuth";

/**
 * Filling a count sheet from a spreadsheet.
 *
 * WHAT THESE GUARD: a blank `stok_fisik` never reaches the API as a number; the
 * file's `stok_sistem` never reaches it at all; a file with one bad row writes
 * nothing; and the auto-save and the import cannot overwrite each other.
 */
jest.mock("@/utils/saveFile", () => ({ saveFile: jest.fn() }));
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const HEADER = OPNAME_TEMPLATE_COLUMNS.join(",");
const ID_FIELD = "Pilih file CSV atau Excel";

const csvFile = (text: string, name = "opname.csv") =>
  Object.assign(new File([text], name), {
    text: () => Promise.resolve(text),
  });
const csvOf = (...lines: string[]) => [HEADER, ...lines].join("\n");

const verdict = (
  overrides: Partial<OpnameImportVerdict> = {},
): OpnameImportVerdict => ({
  rowNumber: 2,
  sku: "RC-1KG",
  status: "ok",
  problems: [],
  productId: "p1",
  productName: "Royal Canin",
  action: "fill",
  batchCode: null,
  expiryDate: null,
  systemQty: "10.0000",
  physicalQty: "8.0000",
  diffQty: "-2.0000",
  notes: null,
  ...overrides,
});

const previewOf = (
  rows: OpnameImportVerdict[],
  overrides: Partial<OpnameImportPreview> = {},
): OpnameImportPreview => ({
  opnameNumber: "OPN-1",
  summary: {
    rows: rows.length,
    ok: rows.filter((row) => row.status === "ok").length,
    problems: rows.filter((row) => row.status !== "ok").length,
    filled: rows.filter((row) => row.action !== "skip").length,
    added: 0,
    skipped: rows.filter((row) => row.action === "skip").length,
  },
  canCommit: rows.every((row) => row.status === "ok"),
  rows,
  ...overrides,
});

const sheet = (physicalQty = "8") =>
  ({
    _id: "op1",
    status: "draft",
    warehouseId: "wh1",
    items: [
      {
        productId: "p1",
        systemQty: "10",
        physicalQty,
        diffQty: "0",
        hppAtOpname: "1000",
        diffValue: "0",
        countedAt: null,
        notes: null,
      },
    ],
    totalDiffValue: "0",
  }) as unknown as Opname;

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the audit log", () => {
  it("knows the import", () => {
    expect(actionLabel("stock_opname_import")).toBe(
      "Stok opname diisi dari file",
    );
  });
});

describe("readOpnameSheet", () => {
  it("sends the count and drops what the file only prints", async () => {
    const { rows } = await readOpnameSheet(
      csvFile(
        csvOf("RC-1KG,Royal Canin,LOT-1,2027-03-01,999,8,2 rusak"),
      ),
    );

    expect(rows[0].row).toEqual({
      rowNumber: 2,
      sku: "RC-1KG",
      batchCode: "LOT-1",
      expiryDate: "2027-03-01",
      physicalQty: "8",
      notes: "2 rusak",
    });
  });

  it("keeps zero, and leaves a blank count out altogether", async () => {
    const { rows } = await readOpnameSheet(
      csvFile(csvOf("A,,,,10,0,", "B,,,,10,,")),
    );

    expect(rows[0].row.physicalQty).toBe("0");
    expect(rows[1].row).not.toHaveProperty("physicalQty");
  });

  it("passes what is not a number across for the server to refuse by row", async () => {
    const { rows } = await readOpnameSheet(csvFile(csvOf("A,,,,10,-3,")));

    expect(rows[0].row.physicalQty).toBe("-3");
    expect(rows[0].problems).toEqual([]);
  });

  it("refuses more than 1000 rows, pointing at the Kategori filter", async () => {
    const lines = Array.from({ length: 1001 }, (_, at) => `S${at},,,,1,1,`);

    await expect(readOpnameSheet(csvFile(csvOf(...lines)))).rejects.toThrow(
      SheetError,
    );
    await expect(readOpnameSheet(csvFile(csvOf(...lines)))).rejects.toThrow(
      /filter Kategori/,
    );
  });
});

describe("saveOpnameTemplate", () => {
  it("writes the server's rows under the agreed columns", async () => {
    jest.spyOn(stockOpnameService, "template").mockResolvedValue({
      opnameNumber: "OPN-1",
      columns: [...OPNAME_TEMPLATE_COLUMNS],
      rows: [
        {
          sku: "A",
          nama: 'Sampo, "wangi"',
          kode_batch: "L1",
          tgl_expired: "2027-03-01",
          stok_sistem: "10",
          stok_fisik: "",
          catatan: "",
        },
      ],
    });
    let text = "";
    (saveFile as jest.Mock).mockImplementation((blob: Blob, name: string) => {
      expect(name).toBe("template-opname-OPN-1.csv");
      text = (blob as unknown as { parts?: string[] }).parts?.join("") ?? "";
    });
    const RealBlob = global.Blob;
    global.Blob = class extends RealBlob {
      parts: string[];
      constructor(parts: string[], options?: BlobPropertyBag) {
        super(parts, options);
        this.parts = parts;
      }
    } as unknown as typeof Blob;

    await saveOpnameTemplate("op1", "csv");
    global.Blob = RealBlob;

    expect(text).toContain(HEADER);
    expect(text).toContain('A,"Sampo, ""wangi""",L1,2027-03-01,10,,');
  });
});

describe("OpnameImportDialog", () => {
  const settle = jest.fn();
  const importFile = jest.fn();
  const onClose = jest.fn();

  const open = async (
    preview: OpnameImportPreview,
    file = csvOf("RC-1KG,,,,10,8,"),
  ) => {
    settle.mockResolvedValue(true);
    importFile.mockResolvedValue(sheet());
    jest.spyOn(stockOpnameService, "previewImport").mockResolvedValue(preview);

    const user = userEvent.setup();
    render(
      <OpnameImportDialog
        opnameId="op1"
        settle={settle}
        importFile={importFile}
        onClose={onClose}
      />,
    );
    await user.upload(screen.getByLabelText(ID_FIELD), csvFile(file));
    return user;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("settles the sheet before asking for a verdict", async () => {
    await open(previewOf([verdict()]));

    await screen.findByText("Isi baris");
    expect(settle.mock.invocationCallOrder[0]).toBeLessThan(
      (stockOpnameService.previewImport as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it("stops when the sheet could not be saved", async () => {
    settle.mockResolvedValue(false);
    jest.spyOn(stockOpnameService, "previewImport");
    const user = userEvent.setup();
    render(
      <OpnameImportDialog
        opnameId="op1"
        settle={settle}
        importFile={importFile}
        onClose={onClose}
      />,
    );
    await user.upload(
      screen.getByLabelText(ID_FIELD),
      csvFile(csvOf("RC-1KG,,,,10,8,")),
    );

    expect(await screen.findByText(/belum tersimpan/)).toBeInTheDocument();
    expect(stockOpnameService.previewImport).not.toHaveBeenCalled();
  });

  it("shows every row, the blank one as not counted", async () => {
    await open(
      previewOf([
        verdict(),
        verdict({
          rowNumber: 3,
          sku: "B",
          action: "skip",
          systemQty: null,
          physicalQty: null,
          diffQty: null,
        }),
      ]),
      csvOf("RC-1KG,,,,10,8,", "B,,,,10,,"),
    );

    expect(await screen.findByText("Isi baris")).toBeInTheDocument();
    expect(screen.getByText("Belum dihitung")).toBeInTheDocument();
    expect(screen.getByText(/1 baris kosong dilewati/)).toBeInTheDocument();
  });

  it("writes the file, then closes", async () => {
    const user = await open(previewOf([verdict()]));

    await user.click(
      await screen.findByRole("button", { name: "Isi 1 baris ke lembar" }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(importFile).toHaveBeenCalledWith({
      rows: [{ rowNumber: 2, sku: "RC-1KG", physicalQty: "8" }],
      fileName: "opname.csv",
    });
  });

  it("keeps the button off while any row has a problem", async () => {
    await open(
      previewOf([
        verdict({
          status: "not_found",
          problems: [{ field: "sku", message: "SKU tidak ditemukan" }],
        }),
      ]),
    );

    expect(await screen.findByText("SKU tidak ditemukan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Isi ke lembar" })).toBeDisabled();
  });

  it("says so when the file carries no count at all", async () => {
    await open(
      previewOf([verdict({ action: "skip" })], { canCommit: false }),
    );

    expect(await screen.findByText(/yang terisi di file ini/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Isi ke lembar" })).toBeDisabled();
  });

  it("stays open with the server's words when the write is refused", async () => {
    const user = await open(previewOf([verdict()]));
    importFile.mockRejectedValue(new ApiError("Lembar ini baru saja berubah", 409));

    await user.click(
      await screen.findByRole("button", { name: "Isi 1 baris ke lembar" }),
    );

    expect(
      await screen.findByText("Lembar ini baru saja berubah"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("the auto-save and the import", () => {
  const input = { rows: [{ rowNumber: 2, sku: "A", physicalQty: "3" }] };

  beforeEach(() => {
    jest.spyOn(stockOpnameService, "getById").mockResolvedValue(sheet());
  });

  const mountSheet = async () => {
    const hook = renderHook(() => useOpnameSheet("op1"));
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    return hook;
  };

  it("flushes a typed count before the file, and takes the file's sheet after", async () => {
    const order: string[] = [];
    jest.spyOn(stockOpnameService, "update").mockImplementation(async () => {
      order.push("save");
      return sheet("12");
    });
    jest.spyOn(stockOpnameService, "importFile").mockImplementation(async () => {
      order.push("import");
      return sheet("3");
    });

    const { result } = await mountSheet();
    act(() => result.current.editLine(0, { physicalQty: "12" }));

    await act(async () => {
      await result.current.importFile(input);
    });

    expect(order).toEqual(["save", "import"]);
    expect(result.current.items[0].physicalQty).toBe("3");
  });

  it("outlasts a save already on its way", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    let finishSave: (value: Opname) => void = () => {};
    const order: string[] = [];
    jest.spyOn(stockOpnameService, "update").mockImplementation(
      () =>
        new Promise((resolve) => {
          order.push("save sent");
          finishSave = (value) => {
            order.push("save done");
            resolve(value);
          };
        }),
    );
    jest.spyOn(stockOpnameService, "importFile").mockImplementation(async () => {
      order.push("import");
      return sheet("3");
    });

    const { result } = await mountSheet();
    act(() => result.current.editLine(0, { physicalQty: "12" }));
    await act(async () => {
      jest.advanceTimersByTime(900);
    });

    let importing = Promise.resolve();
    act(() => {
      importing = result.current.importFile(input).then(() => undefined);
    });
    await act(async () => {
      finishSave(sheet("12"));
      await importing;
    });
    jest.useRealTimers();

    expect(order).toEqual(["save sent", "save done", "import"]);
  });

  it("refuses the file while a count cannot be saved", async () => {
    jest
      .spyOn(stockOpnameService, "update")
      .mockRejectedValue(new ApiError("Gagal", 500));
    const write = jest.spyOn(stockOpnameService, "importFile");

    const { result } = await mountSheet();
    act(() => result.current.editLine(0, { physicalQty: "12" }));

    await act(async () => {
      await expect(result.current.importFile(input)).rejects.toThrow(
        /belum tersimpan/,
      );
    });

    expect(write).not.toHaveBeenCalled();
    expect(result.current.items[0].physicalQty).toBe("12");
  });

  it("does not let the timer save old lines over a file being written", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const update = jest
      .spyOn(stockOpnameService, "update")
      .mockResolvedValue(sheet("12"));
    let finishImport: (value: Opname) => void = () => {};
    jest.spyOn(stockOpnameService, "importFile").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishImport = resolve;
        }),
    );

    const { result } = await mountSheet();

    let importing = Promise.resolve();
    await act(async () => {
      importing = result.current.importFile(input).then(() => undefined);
    });
    // What the sheet's own one-lot effect can do behind the dialog.
    act(() => result.current.setCounted(0, true));
    await act(async () => {
      jest.advanceTimersByTime(900);
    });
    await act(async () => {
      finishImport(sheet("3"));
      await importing;
    });
    jest.useRealTimers();

    expect(update).not.toHaveBeenCalled();
    expect(result.current.items[0].physicalQty).toBe("3");
  });

  it("re-reads the sheet when somebody else wrote first", async () => {
    jest
      .spyOn(stockOpnameService, "importFile")
      .mockRejectedValue(new ApiError("baru saja berubah", 409));

    const { result } = await mountSheet();
    (stockOpnameService.getById as jest.Mock).mockResolvedValue(sheet("6"));

    await act(async () => {
      await expect(result.current.importFile(input)).rejects.toThrow(
        "baru saja berubah",
      );
    });

    expect(result.current.items[0].physicalQty).toBe("6");
  });
});
