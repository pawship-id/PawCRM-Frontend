import { render, screen, within } from "@testing-library/react";

import { ImportVerdictTable } from "@/components";
import {
  CashBankAccountsTable,
  entrySourceLabel,
  type CashBankAccountRow,
} from "@/features/accounting";
import { TransferImportDialog } from "@/features/inventory/components/TransferImportDialog";
import type { ChartOfAccount, JournalEntry } from "@/types/accounting";

import { renderWithAuth } from "./helpers/renderWithAuth";

/** Found by driving the screens in a real browser, 2 November 2026. */

const row = (code: string, masuk: string, keluar: string): CashBankAccountRow => ({
  account: { _id: code, code, name: code, isActive: true } as ChartOfAccount,
  masuk,
  keluar,
  saldo: "0",
});

describe("the Kas & Bank footer", () => {
  it("counts a transfer between own accounts on neither side, and leaves the rows alone", () => {
    renderWithAuth(
      <CashBankAccountsTable
        rows={[row("1110", "1000000", "1500000"), row("1111", "1500000", "0")]}
        internalTransfer="1500000"
        loading={false}
      />,
    );

    const cells = within(
      screen.getByText("Total").closest("tr") as HTMLElement,
    ).getAllByRole("cell");

    expect(cells[1]).toHaveTextContent("Rp 1.000.000");
    expect(cells[2]).toHaveTextContent("Rp 0");
    expect(screen.getAllByText("Rp 1.500.000").length).toBeGreaterThanOrEqual(2);
  });
});

describe("a transfer in the journal", () => {
  const entry = (isCashTransfer: boolean) =>
    ({ isCashTransfer, source: { type: "expense" } }) as JournalEntry;

  it("is not called Pengeluaran", () => {
    expect(entrySourceLabel(entry(true))).toBe("Transfer antar rekening");
    expect(entrySourceLabel(entry(false))).toBe("Pengeluaran");
  });
});

describe("import dialogs", () => {
  it("keep a wide table inside the dialog", () => {
    render(
      <TransferImportDialog
        fromWarehouseId="a"
        fromWarehouseName="Gudang"
        hasLines={false}
        onApply={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByRole("dialog").className).toContain(
      "grid-cols-[minmax(0,1fr)]",
    );
  });

  it("wrap the message instead of running it off the table", () => {
    render(
      <ImportVerdictTable
        rows={[
          {
            rowNumber: 2,
            sku: "A",
            status: "invalid",
            problems: [{ field: "sku", message: "pesan panjang" }],
          },
        ]}
        statusLabels={{}}
      />,
    );

    expect(screen.getByText("pesan panjang").closest("td")?.className).toContain(
      "whitespace-normal",
    );
  });
});
