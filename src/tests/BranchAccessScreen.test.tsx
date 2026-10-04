import { screen } from "@testing-library/react";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { BranchAccessScreen } from "@/features/users";
import { branchService } from "@/services/branch.service";
import { roleService } from "@/services/role.service";
import { userService } from "@/services/user.service";
import { warehouseService } from "@/services/warehouse.service";
import type { Branch, Role, User } from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

function page<T>(items: T[]) {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

function makeUser(overrides: Partial<User>): User {
  return {
    _id: "u1",
    email: "ana@paw.com",
    fullName: "Ana Diaz",
    roleId: "r1",
    allBranches: false,
    branchAccess: [],
    warehouseAccess: [],
    status: "active",
    deletedAt: null,
    ...overrides,
  } as User;
}

/**
 * Pengaturan › Akses cabang (22 September 2026). The user list already says HOW
 * MANY branches somebody sees; this page is worth having only because it says
 * WHICH, so that is what is pinned — plus the three shapes a scope can take.
 */
describe("BranchAccessScreen", () => {
  beforeEach(() => {
    jest.spyOn(userService, "list").mockResolvedValue(
      page([
        makeUser({ _id: "u1", fullName: "Hendra", allBranches: true }),
        makeUser({
          _id: "u2",
          fullName: "Jess",
          branchAccess: ["br-1", "br-2"],
        }),
        makeUser({ _id: "u3", fullName: "Rian", branchAccess: ["br-gone"] }),
        makeUser({ _id: "u4", fullName: "Sari", branchAccess: [] }),
      ]),
    );
    jest
      .spyOn(roleService, "list")
      .mockResolvedValue(page([{ _id: "r1", name: "Manager" } as Role]));
    jest.spyOn(branchService, "list").mockResolvedValue(
      page([
        { _id: "br-1", name: "Pusat" },
        { _id: "br-2", name: "Pawship Barat" },
      ] as Branch[]),
    );
    jest.spyOn(warehouseService, "list").mockResolvedValue(page([]));
  });
  afterEach(() => jest.restoreAllMocks());

  it("names the branches each person can see", async () => {
    renderWithAuth(<BranchAccessScreen />);

    expect(await screen.findByText("Pusat, Pawship Barat")).toBeInTheDocument();
    expect(screen.getByText("Semua cabang")).toBeInTheDocument();
    expect(screen.getByText("Cabang terhapus")).toBeInTheDocument();
    expect(screen.getByText("Belum ada cabang")).toBeInTheDocument();
    expect(screen.getAllByText("Manager")).toHaveLength(4);
  });

  it("sends Ubah to the person's own form, where access is set", async () => {
    renderWithAuth(<BranchAccessScreen />);

    const edits = await screen.findAllByRole("link", { name: "Ubah" });
    expect(edits[1]).toHaveAttribute("href", "/dashboard/pengaturan/pengguna/u2");
  });

  it("offers no Ubah to a role that may only read users", async () => {
    renderWithAuth(<BranchAccessScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }],
    });

    await screen.findByText("Pusat, Pawship Barat");
    expect(screen.queryByRole("link", { name: "Ubah" })).not.toBeInTheDocument();
  });
});
