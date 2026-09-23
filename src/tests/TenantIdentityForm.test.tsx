import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { TenantIdentityForm } from "@/features/tenant";
import { tenantService } from "@/services/tenant.service";
import { ApiError } from "@/services/api-error";
import type { Tenant } from "@/types/api";

jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    _id: "t1",
    name: "Anabul Group",
    legalName: null,
    taxId: null,
    slug: "anabul-group",
    logoUrl: null,
    timezone: "Asia/Jakarta",
    currency: "IDR",
    subscription: { status: "active", plan: "pro", trialEndsAt: null },
    settings: { hotelMode: "zone" },
    sv: 1,
    deletedAt: null,
    createdAt: "2024-03-10T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  } as Tenant;
}

/**
 * A business editing WHO IT IS (22 September 2026) — the half of
 * `PATCH /tenants/me` that used to be platform administration.
 */
describe("TenantIdentityForm", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends only the fields that changed", async () => {
    const patch = jest
      .spyOn(tenantService, "updateIdentity")
      .mockResolvedValue(makeTenant());
    const onSaved = jest.fn();

    renderWithAuth(
      <TenantIdentityForm tenant={makeTenant()} onSaved={onSaved} />,
    );

    await userEvent.type(
      screen.getByLabelText(/Nama badan hukum/),
      "PT Anabul Sejahtera Bersama",
    );
    await userEvent.click(screen.getByRole("button", { name: /Simpan/ }));

    // The trail records what it was sent, so an untouched name must not ride
    // along as a change from itself to itself.
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith({
        legalName: "PT Anabul Sejahtera Bersama",
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("clears a legal name the shop turned out not to have", async () => {
    const patch = jest
      .spyOn(tenantService, "updateIdentity")
      .mockResolvedValue(makeTenant());

    renderWithAuth(
      <TenantIdentityForm
        tenant={makeTenant({ legalName: "PT Salah Ketik" })}
        onSaved={jest.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText(/Nama badan hukum/));
    await userEvent.click(screen.getByRole("button", { name: /Simpan/ }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith({ legalName: "" }));
  });

  it("keeps Simpan shut until something changes, and while the name is empty", async () => {
    renderWithAuth(
      <TenantIdentityForm tenant={makeTenant()} onSaved={jest.fn()} />,
    );

    const save = screen.getByRole("button", { name: /Simpan/ });
    expect(save).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/Nama usaha/));
    expect(save).toBeDisabled();
    expect(
      screen.getByText("Nama usaha tidak boleh kosong"),
    ).toBeInTheDocument();
  });

  it("shows the values, not a form, to a role that may only read", async () => {
    renderWithAuth(
      <TenantIdentityForm
        tenant={makeTenant({ taxId: "01.234.567.8-901.000" })}
        onSaved={jest.fn()}
      />,
      { isSuperAdmin: false, permissions: [{ feature: "tenants", actions: ["read"] }] },
    );

    expect(screen.getByText("01.234.567.8-901.000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Simpan/ })).not.toBeInTheDocument();
  });

  it("says what the server refused and leaves the form open", async () => {
    jest
      .spyOn(tenantService, "updateIdentity")
      .mockRejectedValue(new ApiError("NPWP terlalu panjang", 400));

    renderWithAuth(
      <TenantIdentityForm tenant={makeTenant()} onSaved={jest.fn()} />,
    );

    await userEvent.type(screen.getByLabelText(/NPWP/), "123");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/ }));

    const { swalToast } = jest.requireMock("@/lib/swal");
    await waitFor(() =>
      expect(swalToast).toHaveBeenCalledWith(
        "NPWP terlalu panjang",
        "error",
        8000,
      ),
    );
    expect(screen.getByRole("button", { name: /Simpan/ })).toBeEnabled();
  });
});
