import { render, screen } from "@testing-library/react";

import { PaymentReceipt } from "@/features/sales/components/PaymentReceipt";
import type {
  CustomerInvoiceDetail,
  CustomerInvoicePayment,
  Tenant,
} from "@/types/api";

const payment = {
  paymentId: "pay1",
  paymentNumber: "PMT-2026-0001",
  at: "2026-08-27T00:00:00.000Z",
  amount: "100000.0000",
  method: "transfer",
  channelName: "BCA",
  isVoided: false,
} as unknown as CustomerInvoicePayment;

const invoice = (over: Partial<CustomerInvoiceDetail> = {}) =>
  ({
    invoiceNumber: "INV-2026-0042",
    customerName: "Bu Sari",
    branchName: "Cabang Pusat",
    total: "300000.0000",
    paidAmount: "100000.0000",
    outstandingAmount: "200000.0000",
    payments: [payment],
    ...over,
  }) as unknown as CustomerInvoiceDetail;

const tenant = { _id: "t1", name: "Buloo Petshop" } as Tenant;

/*
  THE KWITANSI FOLLOWS THE BRANCH'S HEADER SETTINGS (20 Oktober 2026), the same
  ones its struk and faktur do — read off the invoice's `printHeader`.
*/
describe("PaymentReceipt — the header", () => {
  it("prints the tenant and branch as before when the API sends no settings", () => {
    render(
      <PaymentReceipt
        invoice={invoice()}
        payment={payment}
        tenant={tenant}
        branchName="Cabang Pusat"
      />,
    );

    expect(screen.getByText("Buloo Petshop")).toBeInTheDocument();
    expect(screen.getByText("Cabang Pusat")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("prints the branch's logo, its own names and its header line", () => {
    render(
      <PaymentReceipt
        invoice={invoice({
          printHeader: {
            showTenantName: true,
            tenantName: "Buloo Pet Care",
            branchName: "Buloo Bintaro",
            logoUrl: "https://cdn.test/logo.webp",
            headerText: "Grooming & Petshop",
          },
        })}
        payment={payment}
        tenant={tenant}
        branchName="Cabang Pusat"
      />,
    );

    expect(screen.getByText("Buloo Pet Care")).toBeInTheDocument();
    expect(screen.getByText("Buloo Bintaro")).toBeInTheDocument();
    expect(screen.queryByText("Cabang Pusat")).not.toBeInTheDocument();
    expect(screen.getByText("Grooming & Petshop")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Logo Buloo Pet Care" }),
    ).toHaveAttribute("src", "https://cdn.test/logo.webp");
  });

  it("falls back to the trading name, and prints no name switched off", () => {
    const { rerender } = render(
      <PaymentReceipt
        invoice={invoice({
          printHeader: {
            showTenantName: true,
            tenantName: null,
            branchName: "",
            logoUrl: "",
            headerText: "",
          },
        })}
        payment={payment}
        tenant={tenant}
        branchName="Cabang Pusat"
      />,
    );

    expect(screen.getByText("Buloo Petshop")).toBeInTheDocument();
    expect(screen.queryByText("Cabang Pusat")).not.toBeInTheDocument();

    rerender(
      <PaymentReceipt
        invoice={invoice({
          printHeader: {
            showTenantName: false,
            tenantName: "Buloo Pet Care",
            branchName: "",
            logoUrl: "",
            headerText: "",
          },
        })}
        payment={payment}
        tenant={tenant}
        branchName="Cabang Pusat"
      />,
    );

    expect(screen.queryByText("Buloo Petshop")).not.toBeInTheDocument();
    expect(screen.queryByText("Buloo Pet Care")).not.toBeInTheDocument();
  });
});
