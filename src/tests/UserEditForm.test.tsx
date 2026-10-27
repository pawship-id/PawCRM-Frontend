import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FULL_REACH_USER, renderWithAuth } from "./helpers/renderWithAuth";
import { UserEditForm } from "@/features/users";
import { userService } from "@/services/user.service";
import type { User } from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("@/services/user.service");
// The pickers' reference lists — not what this suite is about.
jest.mock("@/features/users/hooks/useLookups", () => ({
  useLookups: () => ({
    roles: [],
    branches: [],
    warehouses: [],
    loading: false,
    error: null,
  }),
}));

const mocked = userService as jest.Mocked<typeof userService>;

const RINA: User = {
  ...FULL_REACH_USER,
  _id: "u-rina",
  fullName: "Rina",
  email: "rina@paw.com",
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getById.mockResolvedValue(RINA);
  mocked.setStatus.mockResolvedValue({ ...RINA, status: "suspended" });
});

/**
 * Tangguhkan pengguna asks first (ui-rules §9): it locks the person out on
 * their next click. Aktifkan only gives access back, so it stays one click.
 */
describe("UserEditForm — Tangguhkan pengguna", () => {
  it("asks before suspending, then calls setStatus", async () => {
    const user = userEvent.setup();
    renderWithAuth(<UserEditForm id="u-rina" />);

    await user.click(await screen.findByRole("button", { name: "Tangguhkan pengguna" }));
    const dialog = await screen.findByRole("dialog", { name: "Tangguhkan pengguna" });
    expect(dialog).toHaveTextContent("Rina");
    expect(dialog).toHaveTextContent("tidak bisa login");
    expect(mocked.setStatus).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Tangguhkan pengguna" }));

    await waitFor(() =>
      expect(mocked.setStatus).toHaveBeenCalledWith("u-rina", "suspended"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    renderWithAuth(<UserEditForm id="u-rina" />);

    await user.click(await screen.findByRole("button", { name: "Tangguhkan pengguna" }));
    const dialog = await screen.findByRole("dialog", { name: "Tangguhkan pengguna" });
    await user.click(within(dialog).getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocked.setStatus).not.toHaveBeenCalled();
  });

  it("reactivates a suspended user directly, without a dialog", async () => {
    const user = userEvent.setup();
    mocked.getById.mockResolvedValue({ ...RINA, status: "suspended" });
    mocked.setStatus.mockResolvedValue(RINA);
    renderWithAuth(<UserEditForm id="u-rina" />);

    await user.click(await screen.findByRole("button", { name: "Aktifkan pengguna" }));

    await waitFor(() => expect(mocked.setStatus).toHaveBeenCalledWith("u-rina", "active"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
