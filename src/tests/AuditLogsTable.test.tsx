import { render, screen } from "@testing-library/react";

import { AuditLogsTable } from "@/features/audit-logs/components/AuditLogsTable";
import { categoryActions } from "@/features/audit-logs/constants";
import type { AuditLog } from "@/types/api";

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    _id: "a1",
    tenantId: "t1",
    userId: { _id: "u1", fullName: "Ana Diaz", email: "ana@paw.com" },
    branchId: { _id: "b1", name: "Cabang Bazar" },
    action: "invoice_update",
    entityType: "customer_invoice",
    entityId: "inv1",
    ipAddress: null,
    userAgent: null,
    metadata: {
      invoiceNumber: "INV-0042",
      previousTotal: "300000",
      total: "250000",
    },
    createdAt: "2026-01-01T09:30:00.000Z",
    updatedAt: "2026-01-01T09:30:00.000Z",
    ...overrides,
  };
}

describe("AuditLogsTable", () => {
  it("renders who, the labelled act, the linked document and the change", () => {
    render(<AuditLogsTable logs={[makeLog()]} loading={false} />);

    expect(screen.getByText("Ana Diaz")).toBeInTheDocument();
    expect(screen.getByText("Cabang Bazar")).toBeInTheDocument();
    expect(screen.getByText("Faktur diubah")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "INV-0042" })).toHaveAttribute(
      "href",
      "/dashboard/sales/invoice/inv1",
    );
    expect(
      screen.getByText(/Total Rp\s?300\.000 → Rp\s?250\.000/),
    ).toBeInTheDocument();
  });

  it("names the payment beside its invoice, with the amount and reason", () => {
    render(
      <AuditLogsTable
        logs={[
          makeLog({
            action: "invoice_payment_void",
            metadata: {
              invoiceNumber: "INV-0042",
              paymentNumber: "BKM/0007",
              amount: "50000",
              reason: "salah input",
            },
          }),
        ]}
        loading={false}
      />,
    );

    expect(
      screen.getByText("Pembayaran faktur dibatalkan"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/BKM\/0007 · Rp\s?50\.000 — Alasan: salah input/),
    ).toBeInTheDocument();
  });

  it("degrades gracefully without an actor, a document or a page to link", () => {
    render(
      <AuditLogsTable
        logs={[
          makeLog({
            userId: null,
            action: "booking_session_claim",
            entityType: "booking",
            metadata: {},
          }),
        ]}
        loading={false}
      />,
    );

    expect(screen.getByText("Pengguna terhapus")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBe(2);
  });

  it("humanizes an action it has no label for", () => {
    render(
      <AuditLogsTable
        logs={[makeLog({ action: "something_new", metadata: {} })]}
        loading={false}
      />,
    );

    expect(screen.getByText("Something new")).toBeInTheDocument();
  });

  it("highlights the searched document number", () => {
    render(<AuditLogsTable logs={[makeLog()]} loading={false} search="0042" />);

    expect(screen.getByText("0042").tagName).toBe("MARK");
  });

  it("shows the empty state when there are no logs", () => {
    render(<AuditLogsTable logs={[]} loading={false} />);

    expect(
      screen.getByText("Belum ada perubahan yang cocok dengan filter ini."),
    ).toBeInTheDocument();
  });
});

describe("categoryActions", () => {
  it("lists a module's actions and never an auth one", () => {
    expect(categoryActions("penjualan")).toEqual(
      expect.arrayContaining(["invoice_void", "invoice_payment_record"]),
    );
    expect(categoryActions("penjualan")).not.toContain(
      "purchase_invoice_payment",
    );
    expect(
      ["penjualan", "pembelian", "kas", "stok"].flatMap((c) =>
        categoryActions(c as "penjualan"),
      ),
    ).not.toContain("failed_login");
  });
});
