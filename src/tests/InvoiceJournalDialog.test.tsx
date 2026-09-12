import { screen } from "@testing-library/react";

import { InvoiceJournalDialog } from "@/features/sales/components/InvoiceJournalDialog";
import type { CustomerInvoiceDetail, InvoiceJournalEntry } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * THE POSTINGS, behind the ⋮ on the Rincian card — moved from a card of their own
 * with the September 2026 layout. What these guard did not move with them: the
 * accounts are named, the entry number stays beside them, and a retired account
 * still prints its figures.
 */
const entry = (overrides: Partial<InvoiceJournalEntry> = {}): InvoiceJournalEntry => ({
  _id: "je1",
  entryNumber: "JE-2026-08-0411",
  date: "2026-08-27T00:00:00.000Z",
  description: "Penerbitan faktur",
  sourceType: "invoice",
  isReversal: false,
  belongsToSale: false,
  lines: [
    {
      accountId: "a1",
      code: "1103",
      name: "Piutang Usaha",
      debit: "1119130.0000",
      credit: "0.0000",
      memo: null,
    },
    {
      accountId: "a2",
      code: "4101",
      name: "Penjualan",
      debit: "0.0000",
      credit: "1119130.0000",
      memo: null,
    },
  ],
  ...overrides,
});

const invoice = (overrides: Partial<CustomerInvoiceDetail> = {}) =>
  ({
    _id: "inv1",
    invoiceNumber: "INV-2026-0042",
    posTransactionId: null,
    journalEntries: [entry()],
    ...overrides,
  }) as CustomerInvoiceDetail;

const renderDialog = (
  value = invoice(),
  options?: Parameters<typeof renderWithAuth>[1],
) =>
  renderWithAuth(
    <InvoiceJournalDialog invoice={value} open onOpenChange={jest.fn()} />,
    options,
  );

describe("InvoiceJournalDialog", () => {
  it("names the accounts it debited and credited", () => {
    renderDialog();

    expect(screen.getAllByText(/Piutang Usaha/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Penjualan/).length).toBeGreaterThan(0);
    expect(screen.getByText("1103")).toBeInTheDocument();
  });

  it("keeps the entry number beside them, linked for a reader of the ledger", () => {
    renderDialog();

    expect(
      screen.getByRole("link", { name: "JE-2026-08-0411" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/je1");
  });

  it("shows the number as plain text without `journalEntries:read`", () => {
    renderDialog(invoice(), {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    expect(screen.getByText("JE-2026-08-0411")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("still prints a line whose account was deleted", () => {
    const base = entry();
    renderDialog(
      invoice({
        journalEntries: [
          entry({
            lines: [{ ...base.lines[0], code: null, name: null }, base.lines[1]],
          }),
        ],
      }),
    );

    expect(screen.getByText("Akun terhapus")).toBeInTheDocument();
  });

  /*
    AN EDITED INVOICE shows every version: the issue, its reversal, and the
    re-issue — labelled, so nobody has to work out which is which.
  */
  it("labels an edit's reversal apart from the issue it undoes", () => {
    renderDialog(
      invoice({
        journalEntries: [
          entry(),
          entry({ _id: "je2", entryNumber: "JE-2026-08-0420", isReversal: true }),
        ],
      }),
    );

    expect(screen.getByText(/^Penerbitan/)).toBeInTheDocument();
    expect(screen.getByText(/^Pembalik penerbitan/)).toBeInTheDocument();
  });

  it("warns that a till sale's entries cover the whole sale", () => {
    renderDialog(invoice({ posTransactionId: "pos1" }));

    expect(screen.getByText(/seluruh penjualan/)).toBeInTheDocument();
  });
});
