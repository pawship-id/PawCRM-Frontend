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

  /**
   * LOCALE PREFERENCES (23 September 2026) — timezone, currency, date format
   * and fiscal year start joined the identity fields above. Currency has only
   * one option today, so its own test is just that the picker offers it.
   */
  describe("locale preferences", () => {
    it("sends only the timezone when that is the one thing changed", async () => {
      const patch = jest
        .spyOn(tenantService, "updateIdentity")
        .mockResolvedValue(makeTenant());

      renderWithAuth(
        <TenantIdentityForm tenant={makeTenant()} onSaved={jest.fn()} />,
      );

      await userEvent.click(screen.getByLabelText("Zona waktu"));
      await userEvent.click(
        screen.getByRole("option", { name: "Asia/Makassar (WITA)" }),
      );
      await userEvent.click(screen.getByRole("button", { name: /Simpan/ }));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith({ timezone: "Asia/Makassar" }),
      );
    });

    it("offers only Rupiah, since no second currency exists yet", async () => {
      renderWithAuth(
        <TenantIdentityForm tenant={makeTenant()} onSaved={jest.fn()} />,
      );

      await userEvent.click(screen.getByLabelText("Mata uang"));

      expect(screen.getAllByRole("option")).toHaveLength(1);
      expect(screen.getByRole("option", { name: "Rupiah (IDR)" })).toBeInTheDocument();
    });

    it("sends the fiscal year's start month as a number, not its label", async () => {
      const patch = jest
        .spyOn(tenantService, "updateIdentity")
        .mockResolvedValue(makeTenant());

      renderWithAuth(
        <TenantIdentityForm tenant={makeTenant()} onSaved={jest.fn()} />,
      );

      await userEvent.click(screen.getByLabelText("Tahun buku"));
      await userEvent.click(
        screen.getByRole("option", { name: "April – Maret" }),
      );
      await userEvent.click(screen.getByRole("button", { name: /Simpan/ }));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith({ fiscalYearStartMonth: 4 }),
      );
    });

    it("pre-selects the schema's own defaults for a tenant that never saved either", async () => {
      renderWithAuth(
        <TenantIdentityForm tenant={makeTenant()} onSaved={jest.fn()} />,
      );

      expect(screen.getByLabelText("Format tanggal")).toHaveTextContent(
        "DD MMM YYYY",
      );
      expect(screen.getByLabelText("Tahun buku")).toHaveTextContent(
        "Januari – Desember",
      );
    });

    it("shows the friendly labels, not the raw values, to a role that may only read", () => {
      renderWithAuth(
        <TenantIdentityForm
          tenant={makeTenant({
            timezone: "Asia/Jayapura",
            dateFormat: "YYYY-MM-DD",
            fiscalYearStartMonth: 7,
          })}
          onSaved={jest.fn()}
        />,
        { isSuperAdmin: false, permissions: [{ feature: "tenants", actions: ["read"] }] },
      );

      expect(screen.getByText("Asia/Jayapura (WIT)")).toBeInTheDocument();
      expect(screen.getByText("Rupiah (IDR)")).toBeInTheDocument();
      expect(screen.getByText("YYYY-MM-DD")).toBeInTheDocument();
      expect(screen.getByText("Juli – Juni")).toBeInTheDocument();
    });
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
