import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserCreateForm } from "@/features/users";
import { userService } from "@/services/user.service";
import { roleService } from "@/services/role.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, Role, Branch, Warehouse } from "@/types/api";

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

function page<T>(items: T[]): PageResult<T> {
  return { items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } };
}

const ROLES: Role[] = [{ _id: "r1", name: "Manager", permissions: [] }];
function branch(_id: string, name: string): Branch {
  return {
    _id,
    tenantId: "t1",
    name,
    address: null,
    phone: null,
    receiptFooter: null,
    location: { lat: null, lng: null, source: "manual" },
    isActive: true,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function warehouse(
  _id: string,
  name: string,
  defaultBranchId: string | null,
): Warehouse {
  return {
    _id,
    tenantId: "t1",
    name,
    defaultBranchId,
    address: null,
    location: { lat: null, lng: null, source: "manual" },
    picName: null,
    picPhone: null,
    isActive: true,
    isDefault: false,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const BRANCHES: Branch[] = [branch("b1", "Jakarta"), branch("b2", "Bandung")];

// Two shelves in Jakarta, one in Bandung, and the central warehouse that
// belongs to no branch and therefore serves every one of them.
const WAREHOUSES: Warehouse[] = [
  warehouse("w1", "Gudang Jakarta Depan", "b1"),
  warehouse("w2", "Gudang Jakarta Belakang", "b1"),
  warehouse("w3", "Gudang Bandung", "b2"),
  warehouse("w0", "Gudang Pusat", null),
];

async function renderForm() {
  jest.spyOn(roleService, "list").mockResolvedValue(page(ROLES));
  jest.spyOn(branchService, "list").mockResolvedValue(page(BRANCHES));
  jest.spyOn(warehouseService, "list").mockResolvedValue(page(WAREHOUSES));
  render(<UserCreateForm />);
  // Wait for the lookups spinner to disappear (form is ready).
  await waitForElementToBeRemoved(() =>
    screen.queryByText(/loading form create user/i),
  );
}

describe("UserCreateForm", () => {
  beforeEach(() => {
    push.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(userService, "create");
    await renderForm();

    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
  });

  it("creates the user and redirects on success", async () => {
    const create = jest
      .spyOn(userService, "create")
      .mockResolvedValue({} as never);
    await renderForm();

    await userEvent.type(screen.getByLabelText(/full name/i), "Ana Diaz");
    await userEvent.type(screen.getByLabelText(/email/i), "ana@paw.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "secret123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "secret123");
    await userEvent.click(screen.getByLabelText(/semua cabang/i));
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ana@paw.com",
        fullName: "Ana Diaz",
        allBranches: true,
        branchAccess: [],
        warehouseAccess: [],
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/users");
  });

  describe("warehouse scope", () => {
    async function fillIdentity() {
      await userEvent.type(screen.getByLabelText(/full name/i), "Ana Diaz");
      await userEvent.type(screen.getByLabelText(/email/i), "ana@paw.com");
      await userEvent.type(screen.getByLabelText(/^password/i), "secret123");
      await userEvent.type(
        screen.getByLabelText(/confirm password/i),
        "secret123",
      );
    }

    it("offers no warehouse question until a branch is granted", async () => {
      await renderForm();
      await userEvent.click(screen.getByLabelText(/cabang tertentu/i));

      // There are no shelves to choose in books the user cannot reach.
      expect(
        screen.queryByLabelText(/semua gudang di cabang ini/i),
      ).not.toBeInTheDocument();
    });

    it("starts a newly granted branch at every one of its warehouses", async () => {
      const create = jest
        .spyOn(userService, "create")
        .mockResolvedValue({} as never);
      await renderForm();
      await fillIdentity();

      await userEvent.click(screen.getByLabelText(/cabang tertentu/i));
      await userEvent.click(screen.getByLabelText("Jakarta"));
      await userEvent.click(screen.getByRole("button", { name: /create user/i }));

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          branchAccess: ["b1"],
          warehouseAccess: [
            { branchId: "b1", allWarehouses: true, warehouseIds: [] },
          ],
        }),
      );
    });

    it("sends the shelves picked for a branch", async () => {
      const create = jest
        .spyOn(userService, "create")
        .mockResolvedValue({} as never);
      await renderForm();
      await fillIdentity();

      await userEvent.click(screen.getByLabelText(/cabang tertentu/i));
      await userEvent.click(screen.getByLabelText("Jakarta"));
      await userEvent.click(screen.getByLabelText(/gudang tertentu/i));
      await userEvent.click(screen.getByLabelText("Gudang Jakarta Depan"));
      await userEvent.click(screen.getByRole("button", { name: /create user/i }));

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouseAccess: [
            { branchId: "b1", allWarehouses: false, warehouseIds: ["w1"] },
          ],
        }),
      );
    });

    it("refuses a branch narrowed to no warehouse at all", async () => {
      const create = jest.spyOn(userService, "create");
      await renderForm();
      await fillIdentity();

      await userEvent.click(screen.getByLabelText(/cabang tertentu/i));
      await userEvent.click(screen.getByLabelText("Jakarta"));
      await userEvent.click(screen.getByLabelText(/gudang tertentu/i));
      await userEvent.click(screen.getByRole("button", { name: /create user/i }));

      expect(create).not.toHaveBeenCalled();
      expect(
        screen.getByText(/pilih minimal satu gudang/i),
      ).toBeInTheDocument();
    });

    it("drops a branch's shelves when the branch is unticked", async () => {
      const create = jest
        .spyOn(userService, "create")
        .mockResolvedValue({} as never);
      await renderForm();
      await fillIdentity();

      await userEvent.click(screen.getByLabelText(/cabang tertentu/i));
      await userEvent.click(screen.getByLabelText("Jakarta"));
      await userEvent.click(screen.getByLabelText("Bandung"));
      // Unticking is how access is revoked; a leftover row would take effect
      // again the day the branch is granted back.
      await userEvent.click(screen.getByLabelText("Jakarta"));
      await userEvent.click(screen.getByRole("button", { name: /create user/i }));

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          branchAccess: ["b2"],
          warehouseAccess: [
            { branchId: "b2", allWarehouses: true, warehouseIds: [] },
          ],
        }),
      );
    });

    it("names the shared warehouses rather than offering them", async () => {
      await renderForm();
      await userEvent.click(screen.getByLabelText(/cabang tertentu/i));
      await userEvent.click(screen.getByLabelText("Jakarta"));

      // Automatic with any branch, so a checkbox would offer a choice that
      // does not exist — the backend refuses one sent in warehouseIds.
      expect(
        screen.getByText(/gudang bersama selalu ikut terakses/i),
      ).toHaveTextContent("Gudang Pusat");
      expect(screen.queryByLabelText("Gudang Pusat")).not.toBeInTheDocument();
    });

    it("clears every warehouse row when all branches is chosen", async () => {
      const create = jest
        .spyOn(userService, "create")
        .mockResolvedValue({} as never);
      await renderForm();
      await fillIdentity();

      await userEvent.click(screen.getByLabelText(/cabang tertentu/i));
      await userEvent.click(screen.getByLabelText("Jakarta"));
      await userEvent.click(screen.getByLabelText(/semua cabang/i));
      await userEvent.click(screen.getByRole("button", { name: /create user/i }));

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          allBranches: true,
          branchAccess: [],
          warehouseAccess: [],
        }),
      );
    });
  });

  it("surfaces a duplicate-email conflict as an alert", async () => {
    jest
      .spyOn(userService, "create")
      .mockRejectedValue(new ApiError("Email already in use", 409));
    await renderForm();

    await userEvent.type(screen.getByLabelText(/full name/i), "Ana Diaz");
    await userEvent.type(screen.getByLabelText(/email/i), "ana@paw.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "secret123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "secret123");
    await userEvent.click(screen.getByLabelText(/semua cabang/i));
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    expect(
      await screen.findByText(/email already in use/i),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
