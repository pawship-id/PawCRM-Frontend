import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RoleCreateForm } from "@/features/roles";
import { roleService } from "@/services/role.service";
import { ApiError } from "@/services/api-error";
import type { PermissionCatalog } from "@/types/api";

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

const CATALOG: PermissionCatalog = {
  features: [
    { feature: "users", actions: ["read", "create"] },
    { feature: "roles", actions: ["delete"] },
  ],
};

async function renderForm() {
  jest.spyOn(roleService, "catalog").mockResolvedValue(CATALOG);
  render(<RoleCreateForm />);
  await waitForElementToBeRemoved(() =>
    screen.queryByText(/memuat formulir/i),
  );
}

describe("RoleCreateForm", () => {
  beforeEach(() => {
    push.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(roleService, "create");
    await renderForm();

    await userEvent.click(screen.getByRole("button", { name: /simpan peran/i }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/nama peran wajib diisi/i)).toBeInTheDocument();
  });

  it("sends the selected permissions and redirects on success", async () => {
    const create = jest
      .spyOn(roleService, "create")
      .mockResolvedValue({} as never);
    await renderForm();

    await userEvent.type(screen.getByLabelText(/nama peran/i), "Cashier");
    // Tick a single action checkbox (users → Read).
    await userEvent.click(screen.getByLabelText(/^lihat$/i));
    await userEvent.click(screen.getByRole("button", { name: /simpan peran/i }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Cashier",
        description: null,
        permissions: [{ feature: "users", actions: ["read"] }],
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/settings/roles");
  });

  it("surfaces a duplicate-name conflict as an alert", async () => {
    jest
      .spyOn(roleService, "create")
      .mockRejectedValue(new ApiError("Nama peran Cashier sudah dipakai.", 409));
    await renderForm();

    await userEvent.type(screen.getByLabelText(/nama peran/i), "Cashier");
    await userEvent.click(screen.getByRole("button", { name: /simpan peran/i }));

    expect(await screen.findByText(/sudah dipakai/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
