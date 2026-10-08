import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomerAppSettingsCard } from "@/features/grooming/components/GroomerAppSettingsCard";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type { Tenant } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/tenant.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const tenants = tenantService as jest.Mocked<typeof tenantService>;

const tenant = (groomerApp?: { showOwnCommission: boolean; allowOpenJobClaim: boolean }) =>
  ({ _id: "t1", name: "Pawship", settings: { hotelMode: "numbered", ...(groomerApp ? { groomerApp } : {}) } }) as unknown as Tenant;

beforeEach(() => {
  jest.resetAllMocks();
  tenants.me.mockResolvedValue(tenant());
});

const openJob = () => screen.findByRole("switch", { name: /mengambil open job/ });
const commission = () => screen.findByRole("switch", { name: /melihat komisinya sendiri/ });

describe("GroomerAppSettingsCard", () => {
  it("starts with both switches off for a business that never decided", async () => {
    renderWithAuth(<GroomerAppSettingsCard />);

    expect(await openJob()).not.toBeChecked();
    expect(await commission()).not.toBeChecked();
  });

  it("shows what is stored", async () => {
    tenants.me.mockResolvedValue(tenant({ showOwnCommission: true, allowOpenJobClaim: false }));
    renderWithAuth(<GroomerAppSettingsCard />);

    expect(await commission()).toBeChecked();
    expect(await openJob()).not.toBeChecked();
  });

  it("offers no Simpan until something changes", async () => {
    renderWithAuth(<GroomerAppSettingsCard />);
    await openJob();

    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
  });

  it("saves BOTH switches together — the server refuses a partial object", async () => {
    tenants.updateSettings.mockResolvedValue(
      tenant({ showOwnCommission: false, allowOpenJobClaim: true }),
    );
    const user = userEvent.setup();
    renderWithAuth(<GroomerAppSettingsCard />);

    await user.click(await openJob());
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(tenants.updateSettings).toHaveBeenCalledWith({
      groomerApp: { showOwnCommission: false, allowOpenJobClaim: true },
    });
    await waitFor(() => expect(swalToast).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
  });

  it("does not touch the grooming settings key — the two are saved apart", async () => {
    tenants.updateSettings.mockResolvedValue(tenant({ showOwnCommission: true, allowOpenJobClaim: false }));
    const user = userEvent.setup();
    renderWithAuth(<GroomerAppSettingsCard />);

    await user.click(await commission());
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(Object.keys(tenants.updateSettings.mock.calls[0][0])).toEqual(["groomerApp"]);
  });

  it("puts the switches back with Batalkan", async () => {
    const user = userEvent.setup();
    renderWithAuth(<GroomerAppSettingsCard />);

    await user.click(await openJob());
    expect(await openJob()).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Batalkan" }));

    expect(await openJob()).not.toBeChecked();
    expect(tenants.updateSettings).not.toHaveBeenCalled();
  });

  it("says so in the server's words when the save is refused, and keeps what was typed", async () => {
    tenants.updateSettings.mockRejectedValue(new ApiError("Tidak punya izin", 403));
    const user = userEvent.setup();
    renderWithAuth(<GroomerAppSettingsCard />);

    await user.click(await openJob());
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText(/Belum tersimpan/)).toBeInTheDocument();
    expect(await openJob()).toBeChecked();
  });

  it("is read-only without tenants:update", async () => {
    renderWithAuth(<GroomerAppSettingsCard />, {
      isSuperAdmin: false,
      permissions: [{ feature: "tenants", actions: ["read"] }],
    });

    expect(await openJob()).toBeDisabled();
    expect(await commission()).toBeDisabled();
    expect(screen.getByText(/hanya bisa melihat/)).toBeInTheDocument();
  });

  it("offers a retry when the settings cannot be read", async () => {
    tenants.me.mockRejectedValueOnce(new ApiError("Server error", 500));
    const user = userEvent.setup();
    renderWithAuth(<GroomerAppSettingsCard />);

    await user.click(await screen.findByRole("button", { name: "Muat ulang" }));

    expect(await openJob()).toBeInTheDocument();
  });
});
