import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WarehouseCreateForm } from "@/features/warehouses";
import { warehouseService } from "@/services/warehouse.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { Branch, PageResult } from "@/types/api";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// The success popup is a SweetAlert2 modal; mock the library so it resolves
// immediately and the redirect-after-success assertion does not wait on a real
// dialog.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function branchPage(): PageResult<Branch> {
  return {
    items: [
      {
        _id: "b1",
        tenantId: "t1",
        name: "Jakarta",
        address: null,
        phone: null,
        location: { lat: null, lng: null, source: "manual" },
        isActive: true,
        deletedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  };
}

describe("WarehouseCreateForm", () => {
  beforeEach(() => {
    push.mockClear();
    // Every mount loads the branch picker (GET /branches) — the API returns
    // `defaultBranchId` unpopulated, so the form resolves names itself.
    jest.spyOn(branchService, "list").mockResolvedValue(branchPage());
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(warehouseService, "create");
    render(<WarehouseCreateForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /create warehouse/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/warehouse name is required/i)).toBeInTheDocument();
  });

  it("rejects a PIC phone with letters before calling create", async () => {
    const create = jest.spyOn(warehouseService, "create");
    render(<WarehouseCreateForm />);

    await userEvent.type(screen.getByLabelText(/warehouse name/i), "Gudang A");
    await userEvent.type(screen.getByLabelText(/pic phone/i), "0812-abc");
    await userEvent.click(
      screen.getByRole("button", { name: /create warehouse/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/only digits, spaces/i)).toBeInTheDocument();
  });

  it("creates the warehouse and redirects on success", async () => {
    const create = jest
      .spyOn(warehouseService, "create")
      .mockResolvedValue({} as never);
    render(<WarehouseCreateForm />);

    await userEvent.type(screen.getByLabelText(/warehouse name/i), "Gudang A");
    await userEvent.type(screen.getByLabelText(/pic name/i), "Budi");
    await userEvent.click(
      screen.getByRole("button", { name: /create warehouse/i }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: "Gudang A",
        // No branch chosen: a central warehouse, sent as an explicit null
        // rather than omitted.
        defaultBranchId: null,
        address: null,
        // Both coordinate fields left blank, which is one pin-less state, not
        // two nulls — see toGeoLocation.
        location: null,
        picName: "Budi",
        picPhone: null,
        isActive: true,
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/warehouses");
  });

  it("surfaces a duplicate-name conflict as an alert", async () => {
    jest
      .spyOn(warehouseService, "create")
      .mockRejectedValue(
        new ApiError("Warehouse 'Gudang A' already exists", 409),
      );
    render(<WarehouseCreateForm />);

    await userEvent.type(screen.getByLabelText(/warehouse name/i), "Gudang A");
    await userEvent.click(
      screen.getByRole("button", { name: /create warehouse/i }),
    );

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("maps a backend field error onto the matching input", async () => {
    jest.spyOn(warehouseService, "create").mockRejectedValue(
      new ApiError("Validation failed", 400, {
        details: [
          { field: "body.picPhone", message: "must contain only digits" },
        ],
      }),
    );
    render(<WarehouseCreateForm />);

    await userEvent.type(screen.getByLabelText(/warehouse name/i), "Gudang A");
    await userEvent.click(
      screen.getByRole("button", { name: /create warehouse/i }),
    );

    expect(
      await screen.findByText(/must contain only digits/i),
    ).toBeInTheDocument();
  });
});
