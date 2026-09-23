import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  NotificationSettingsScreen,
  SupplierTypesScreen,
} from "@/features/settings";
import { tenantService } from "@/services/tenant.service";
import type { Tenant } from "@/types/api";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/pengaturan/notifikasi",
}));
jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

function makeTenant(
  settings: Partial<Tenant["settings"]> = {},
): Tenant {
  return {
    _id: "t1",
    name: "Anabul Group",
    slug: "anabul-group",
    logoUrl: null,
    timezone: "Asia/Jakarta",
    currency: "IDR",
    subscription: { status: "active", plan: "pro", trialEndsAt: null },
    settings: { hotelMode: "zone", ...settings } as Tenant["settings"],
    sv: 1,
    deletedAt: null,
    createdAt: "2024-03-10T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  } as Tenant;
}

/**
 * Pengaturan › Notifikasi (23 September 2026). The switches are stored and
 * NOTHING SENDS THEM, so the one thing this screen must never do is let a shop
 * believe its customers are being reminded.
 */
describe("NotificationSettingsScreen", () => {
  beforeEach(() => {
    jest.spyOn(tenantService, "me").mockResolvedValue(makeTenant());
  });
  afterEach(() => jest.restoreAllMocks());

  it("says nothing is sent yet, before any switch", async () => {
    renderWithAuth(<NotificationSettingsScreen />);

    expect(
      await screen.findByText(/Belum ada yang mengirim/),
    ).toBeInTheDocument();
  });

  it("starts every switch off for a shop that never saved one", async () => {
    renderWithAuth(<NotificationSettingsScreen />);

    const switches = await screen.findAllByRole("switch");
    expect(switches).toHaveLength(7);
    expect(switches.every((box) => box.getAttribute("aria-checked") === "false")).toBe(
      true,
    );
  });

  it("sends the whole map, not only what was touched", async () => {
    jest
      .spyOn(tenantService, "me")
      .mockResolvedValue(makeTenant({ notifications: { promo: true } }));
    const save = jest
      .spyOn(tenantService, "updateSettings")
      .mockResolvedValue({} as never);

    renderWithAuth(<NotificationSettingsScreen />);

    await userEvent.click(
      await screen.findByLabelText("Pengingat booking H-1"),
    );
    await userEvent.click(screen.getByRole("button", { name: /Simpan/ }));

    // The server flattens `settings` one level, so a partial map would drop the
    // switches this form did not name — `promo` among them.
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        notifications: {
          bookingReminder: true,
          membershipExpiry: false,
          receivableDue: false,
          payableDue: false,
          fixedCostDue: false,
          lowStock: false,
          promo: true,
        },
      }),
    );
  });

  it("shows the state, not switches, to a role that may only read", async () => {
    renderWithAuth(<NotificationSettingsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "tenants", actions: ["read"] }],
    });

    expect(await screen.findByText("Pengingat booking H-1")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getAllByText("Mati")).toHaveLength(7);
  });
});

/**
 * Pengaturan › Tipe supplier — read-only on purpose. `beli_putus` and
 * `konsinyasi` decide WHEN A DEBT IS RECORDED, so a tenant inventing a third
 * type would create a vendor group that quietly posts nothing.
 */
describe("SupplierTypesScreen", () => {
  it("explains what each type does to the books, and offers no way to add one", () => {
    renderWithAuth(<SupplierTypesScreen />);

    expect(screen.getByText("Beli putus")).toBeInTheDocument();
    expect(screen.getByText(/Utang ke supplier tercatat saat penerimaan/)).toBeInTheDocument();
    expect(
      screen.getByText(/Penerimaan barang tidak mencatat utang sama sekali/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tipe baru|Tambah/ })).not.toBeInTheDocument();
  });

  /* Grouping vendors IS editable, and lives elsewhere — say so rather than let
     somebody conclude the list they wanted does not exist. */
  it("points a shop that wants vendor groups at Kategori Supplier", () => {
    renderWithAuth(<SupplierTypesScreen />);

    expect(
      screen.getByRole("link", { name: /Kategori Supplier/ }),
    ).toHaveAttribute("href", "/dashboard/purchasing/supplier-categories");
  });
});
