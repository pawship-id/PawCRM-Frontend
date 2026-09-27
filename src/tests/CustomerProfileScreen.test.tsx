import { screen, waitFor, within } from "@testing-library/react";

import { CustomerProfileScreen } from "@/features/customers";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { posService } from "@/services/pos.service";
import type { Customer } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");
jest.mock("@/services/customerInvoice.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/pos.service");
jest.mock("@/services/petOption.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockedCustomers = customerService as jest.Mocked<typeof customerService>;
const mockedInvoices = customerInvoiceService as jest.Mocked<
  typeof customerInvoiceService
>;
const mockedPets = petService as jest.Mocked<typeof petService>;
const mockedPos = posService as jest.Mocked<typeof posService>;

const customer: Customer = {
  _id: "5a7f1f77bcf86cd799439022",
  tenantId: "507f1f77bcf86cd799439011",
  name: "Rina Wijaya",
  email: "rina@email.com",
  phone: "0812-1111-2222",
  address: "Jl. Puncak Permai III/22, Surabaya",
  location: { lat: null, lng: null, source: "manual" },
  vipTier: "gold",
  deletedAt: null,
  createdAt: "2025-01-12T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function page<T>(items: T[], total = items.length) {
  return { items, pagination: { page: 1, limit: 20, total, totalPages: 1 } };
}

/**
 * The customer profile — the read side of `/master/customers/:id`, which used to
 * be the edit form.
 *
 * WHAT THIS SUITE IS FOR. Three of the screen's decisions are the kind that a
 * later tidy-up quietly undoes, and each one costs something real:
 *
 *   IT IS GATED ON `read`, so a groomer who may not edit a customer can still see
 *   whose animals these are and which number to ring. A profile that mounted a
 *   form again would put that behind `update`.
 *
 *   THE FIELDS THE DATABASE HAS NOT GOT SAY SO. Jenis, Kategori, NPWP and catatan
 *   are drawn with a "Segera" badge rather than left out — a missing row is a field
 *   somebody hunts for in the form.
 *
 *   THE FIGURES ARE ASKED FOR PER CUSTOMER, not summed in the browser. Both the
 *   invoice summary and the till's list carry this customer's id.
 */
describe("customer profile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCustomers.getById.mockResolvedValue(customer);
    mockedPets.list.mockResolvedValue(page([]));
    mockedPos.listTransactions.mockResolvedValue(page([]));
    mockedInvoices.summary.mockResolvedValue({
      asOf: "2026-09-26T00:00:00.000Z",
      period: null,
      revenue: { amount: "4820000.0000", invoiceCount: 6 },
      collected: { amount: "4000000.0000", invoiceCount: 5 },
      outstanding: { amount: "820000.0000", invoiceCount: 1 },
      overdue: { amount: "0.0000", invoiceCount: 0 },
    });
  });

  it("shows who the customer is without asking to edit them", async () => {
    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Rina Wijaya" }),
    ).toBeVisible();
    // Twice on purpose: once on the heading line, once as a field in Identitas.
    expect(screen.getAllByText(/0812-1111-2222/).length).toBe(2);
    expect(screen.getByText(/Jl\. Puncak Permai/)).toBeVisible();
    // The name is a heading, not an input — this is the whole reason the route split.
    expect(screen.queryByLabelText(/Nama pelanggan/i)).not.toBeInTheDocument();
  });

  it("offers a WhatsApp chat built from the stored number", async () => {
    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    const chat = await screen.findByRole("link", { name: /Chat WhatsApp/i });
    expect(chat).toHaveAttribute("href", "https://wa.me/6281211112222");
  });

  it("hides the chat button when the number cannot be dialled", async () => {
    mockedCustomers.getById.mockResolvedValue({ ...customer, phone: null });

    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    await screen.findByRole("heading", { level: 1, name: "Rina Wijaya" });
    expect(
      screen.queryByRole("link", { name: /Chat WhatsApp/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Ubah from a reader who may not edit", async () => {
    renderWithAuth(<CustomerProfileScreen id={customer._id} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customers", actions: ["read"] }],
    });

    await screen.findByRole("heading", { level: 1, name: "Rina Wijaya" });
    expect(screen.queryByRole("link", { name: /^Ubah$/ })).not.toBeInTheDocument();
  });

  it("marks the mockup's missing fields as coming rather than leaving them out", async () => {
    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    await screen.findByRole("heading", { level: 1, name: "Rina Wijaya" });
    expect(screen.getByText("Jenis pelanggan")).toBeVisible();
    expect(screen.getByText("Kategori pelanggan")).toBeVisible();
    expect(screen.getByText("NPWP & PIC")).toBeVisible();
    // Said in words, not by styling alone — ui-rules §1.3.
    expect(screen.getAllByText("Segera").length).toBeGreaterThan(0);
  });

  it("says when an address has no pin, because a zone-priced service needs one", async () => {
    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    expect(
      await screen.findByText(/Belum ditandai — layanan berzona/i),
    ).toBeVisible();
  });

  it("asks the server for THIS customer's figures", async () => {
    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    await waitFor(() =>
      expect(mockedInvoices.summary).toHaveBeenCalledWith({
        customerId: customer._id,
      }),
    );
    // Settled sales only, and the page size is the section's, not the server's.
    await waitFor(() =>
      expect(mockedPos.listTransactions).toHaveBeenCalledWith({
        customerId: customer._id,
        status: "paid",
        page: 1,
        limit: 5,
      }),
    );
  });

  it("shows the invoice figures, and says they are only the invoiced part", async () => {
    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    const value = await screen.findByText("Nilai faktur");
    const section = value.closest("dl");
    expect(within(section as HTMLElement).getByText("Rp 4.820.000")).toBeVisible();
    expect(
      screen.getByText(/Transaksi kasir yang langsung lunas tidak menerbitkan/i),
    ).toBeVisible();
  });

  it("counts every settled sale, not just the rows it draws", async () => {
    mockedPos.listTransactions.mockResolvedValue(
      page(
        [
          {
            _id: "tx1",
            transactionNumber: "TRX-4821",
            paidAt: "2026-09-03T07:02:00.000Z",
            items: [{ name: "Basic Grooming" }, { name: "Potong kuku" }],
            totals: { grandTotal: "289000.0000" },
          },
        ] as never[],
        18,
      ),
    );

    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    expect(await screen.findByText(/18 transaksi kasir/)).toBeVisible();
    expect(screen.getByText("TRX-4821")).toBeVisible();
    expect(screen.getByText("Basic Grooming")).toBeVisible();
    // One line, with the rest counted rather than listed.
    expect(screen.getByText(/\+ 1 item lain/)).toBeVisible();
    expect(screen.getByText("Rp 289.000")).toBeVisible();
  });

  it("keeps the receivables and till sections behind their own grants", async () => {
    renderWithAuth(<CustomerProfileScreen id={customer._id} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customers", actions: ["read"] }],
    });

    await screen.findByRole("heading", { level: 1, name: "Rina Wijaya" });
    expect(screen.queryByText("Nilai pelanggan")).not.toBeInTheDocument();
    expect(screen.queryByText("Riwayat")).not.toBeInTheDocument();
    expect(mockedInvoices.summary).not.toHaveBeenCalled();
    expect(mockedPos.listTransactions).not.toHaveBeenCalled();
  });

  it("says a deleted customer is deleted, and where to undo it", async () => {
    mockedCustomers.getById.mockResolvedValue({
      ...customer,
      deletedAt: "2026-09-20T00:00:00.000Z",
    });

    renderWithAuth(<CustomerProfileScreen id={customer._id} />);

    expect(await screen.findByText(/sudah dihapus/i)).toBeVisible();
  });
});
