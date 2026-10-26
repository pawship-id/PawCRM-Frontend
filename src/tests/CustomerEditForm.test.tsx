import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomerEditForm } from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { customerTypeService } from "@/services/customerType.service";
import { petService } from "@/services/pet.service";
import type { Customer } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");
jest.mock("@/services/customerType.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/petOption.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/customers/x/edit",
}));

const mockedCustomers = jest.mocked(customerService);
const mockedTypes = jest.mocked(customerTypeService);
const mockedPets = jest.mocked(petService);

const customer: Customer = {
  _id: "5a7f1f77bcf86cd799439022",
  tenantId: "507f1f77bcf86cd799439011",
  code: "CUST-0001",
  name: "Rina Wijaya",
  email: null,
  phone: "0812-1111-2222",
  address: null,
  kind: "individual",
  customerTypeId: null,
  customerTypeName: null,
  taxId: null,
  picName: null,
  notes: null,
  tags: ["pelanggan-lama", "reseller"],
  notifications: { bookingReminder: true, membershipRenewal: true, promo: false },
  isActive: true,
  deletedAt: null,
  createdAt: "2025-01-12T00:00:00.000Z",
  updatedAt: "2025-01-12T00:00:00.000Z",
};

const emptyPage = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

/**
 * The edit side of customer tags (26 October 2026). The whole form is PATCHed,
 * so the stored tags have to come back into the form and go out again — a
 * field that is not seeded from the record is one an edit silently clears.
 */
describe("CustomerEditForm — tags", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCustomers.getById.mockResolvedValue(customer);
    mockedCustomers.update.mockImplementation(async (_id, input) => ({
      ...customer,
      ...(input as Partial<Customer>),
    }));
    mockedCustomers.tags.mockResolvedValue(["reseller", "grosir"]);
    mockedTypes.list.mockResolvedValue(emptyPage as never);
    mockedPets.list.mockResolvedValue(emptyPage as never);
  });

  it("starts from the stored tags and sends them back unchanged", async () => {
    renderWithAuth(<CustomerEditForm id={customer._id} />);

    expect(
      await screen.findByRole("button", { name: "Hapus tag pelanggan-lama" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Hapus tag reseller" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));

    expect(mockedCustomers.update).toHaveBeenCalledWith(
      customer._id,
      expect.objectContaining({ tags: ["pelanggan-lama", "reseller"] }),
    );
  });

  it("offers only the tenant's tags this customer does not already carry", async () => {
    renderWithAuth(<CustomerEditForm id={customer._id} />);

    expect(await screen.findByRole("button", { name: "#grosir" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "#reseller" })).not.toBeInTheDocument();
  });

  it("sends an emptied list as [] so the tags are cleared", async () => {
    renderWithAuth(<CustomerEditForm id={customer._id} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Hapus tag pelanggan-lama" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Hapus tag reseller" }));
    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));

    expect(mockedCustomers.update).toHaveBeenCalledWith(
      customer._id,
      expect.objectContaining({ tags: [] }),
    );
  });

  it("adds a picked suggestion to the saved tags", async () => {
    renderWithAuth(<CustomerEditForm id={customer._id} />);

    await userEvent.click(await screen.findByRole("button", { name: "#grosir" }));
    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));

    expect(mockedCustomers.update).toHaveBeenCalledWith(
      customer._id,
      expect.objectContaining({ tags: ["pelanggan-lama", "reseller", "grosir"] }),
    );
  });
});
