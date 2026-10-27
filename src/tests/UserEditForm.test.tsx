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

/**
 * A deleted user must still open here: Zona berbahaya is the only place that
 * offers "Pulihkan pengguna", so a 404 for deleted users made it unreachable.
 */
describe("UserEditForm — pengguna terhapus", () => {
  const DELETED: User = { ...RINA, deletedAt: "2026-10-01T00:00:00.000Z" };

  it("loads with includeDeleted and shows Terhapus + Pulihkan pengguna", async () => {
    mocked.getById.mockResolvedValue(DELETED);
    renderWithAuth(<UserEditForm id="u-rina" />);

    expect(
      await screen.findByRole("button", { name: "Pulihkan pengguna" }),
    ).toBeInTheDocument();
    expect(mocked.getById).toHaveBeenCalledWith("u-rina", { includeDeleted: true });
    expect(screen.getByText("Terhapus")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus pengguna" })).not.toBeInTheDocument();
  });

  it("locks Jadwal and Password too, with the same pulihkan-dulu note", async () => {
    mocked.getById.mockResolvedValue(DELETED);
    renderWithAuth(<UserEditForm id="u-rina" />);

    await screen.findByRole("button", { name: "Pulihkan pengguna" });
    // Detail, Jadwal and Password each say it.
    expect(
      screen.getAllByText(/Pengguna ini sudah dihapus. Pulihkan dulu di Zona berbahaya/),
    ).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Simpan jadwal" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Simpan password" })).toBeDisabled();
    expect(screen.getByLabelText(/^Password baru/)).toBeDisabled();
    expect(screen.getByLabelText(/^Ulangi password baru/)).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Groomer/ })).toBeDisabled();
    // Restore stays reachable — it lives outside the locked cards.
    expect(screen.getByRole("button", { name: "Pulihkan pengguna" })).toBeEnabled();
  });

  it("leaves Jadwal and Password open for a live user", async () => {
    renderWithAuth(<UserEditForm id="u-rina" />);

    expect(await screen.findByRole("button", { name: "Simpan password" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Simpan jadwal" })).toBeEnabled();
    expect(screen.queryByText(/Pengguna ini sudah dihapus/)).not.toBeInTheDocument();
  });

  it("asks before restoring, then calls restore", async () => {
    const user = userEvent.setup();
    mocked.getById.mockResolvedValue(DELETED);
    mocked.restore.mockResolvedValue({ ...RINA, deletedAt: null });
    renderWithAuth(<UserEditForm id="u-rina" />);

    await user.click(await screen.findByRole("button", { name: "Pulihkan pengguna" }));
    const dialog = await screen.findByRole("dialog", { name: "Pulihkan pengguna" });
    expect(dialog).toHaveTextContent("Rina");
    expect(mocked.restore).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Pulihkan" }));
    await waitFor(() => expect(mocked.restore).toHaveBeenCalledWith("u-rina"));
  });
});
