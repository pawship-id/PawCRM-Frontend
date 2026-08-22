import { render, screen, waitFor } from "@testing-library/react";

import { SupplierSelect } from "@/features/purchasing";
import { supplierService } from "@/services/supplier.service";
import type { PageResult, Supplier } from "@/types/api";

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    _id: "s1",
    tenantId: "t1",
    name: "PT Sumber Pangan",
    pic: { name: null, email: null, address: null, phone: null },
    phone: null,
    email: null,
    address: {
      street: null,
      city: null,
      postalCode: null,
      province: null,
      country: null,
    },
    npwp: null,
    notes: null,
    type: "beli_putus",
    paymentTermDays: 30,
    isActive: true,
    createdBy: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const page = (items: Supplier[]): PageResult<Supplier> => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

/**
 * The picker is where `isActive` earns its keep: it is what stops a vendor the
 * tenant has stopped buying from being chosen for a new delivery.
 */
describe("SupplierSelect", () => {
  afterEach(() => jest.restoreAllMocks());

  /**
   * ASKED OF THE SERVER, not filtered here — so this list and the endpoint that
   * accepts the form cannot disagree about which vendors are available.
   */
  it("asks the API for active suppliers only", async () => {
    const list = jest
      .spyOn(supplierService, "list")
      .mockResolvedValue(page([makeSupplier()]));

    render(<SupplierSelect value={null} onChange={jest.fn()} />);

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      ),
    );
  });

  it("does not fetch anything extra when nothing is selected", async () => {
    jest.spyOn(supplierService, "list").mockResolvedValue(page([makeSupplier()]));
    const getById = jest.spyOn(supplierService, "getById");

    render(<SupplierSelect value={null} onChange={jest.fn()} />);

    await waitFor(() => expect(supplierService.list).toHaveBeenCalled());
    expect(getById).not.toHaveBeenCalled();
  });

  it("does not refetch a selection the active list already contains", async () => {
    jest.spyOn(supplierService, "list").mockResolvedValue(page([makeSupplier()]));
    const getById = jest.spyOn(supplierService, "getById");

    render(<SupplierSelect value="s1" onChange={jest.fn()} />);

    await waitFor(() => expect(supplierService.list).toHaveBeenCalled());
    expect(getById).not.toHaveBeenCalled();
  });

  /**
   * THE CASE THAT MATTERS. A form editing a document raised before the vendor
   * was deactivated must still show which vendor it names. Dropping it would
   * render an empty trigger and — the moment the form was saved — silently
   * rewrite the field to something else.
   */
  it("fetches and keeps a selected supplier that is no longer active", async () => {
    jest.spyOn(supplierService, "list").mockResolvedValue(page([]));
    const getById = jest
      .spyOn(supplierService, "getById")
      .mockResolvedValue(makeSupplier({ _id: "s9", name: "CV Lama", isActive: false }));

    render(<SupplierSelect value="s9" onChange={jest.fn()} />);

    await waitFor(() => expect(getById).toHaveBeenCalledWith("s9"));
    // Flagged, not hidden: the state is legible instead of destructive.
    expect(
      await screen.findByText(/Supplier ini nonaktif/),
    ).toBeInTheDocument();
  });

  it("surfaces a load failure instead of rendering an empty picker silently", async () => {
    const { ApiError } = await import("@/services/api-error");
    jest
      .spyOn(supplierService, "list")
      .mockRejectedValue(new ApiError("Unable to reach the server", 0));

    render(<SupplierSelect value={null} onChange={jest.fn()} />);

    expect(
      await screen.findByText("Unable to reach the server"),
    ).toBeInTheDocument();
  });
});
