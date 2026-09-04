import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Swal from "sweetalert2";

import { StockSettingsForm } from "@/features/tenant/components/StockSettingsForm";
import { tenantService } from "@/services/tenant.service";
import { ApiError } from "@/services/api-error";
import { renderWithAuth } from "./helpers/renderWithAuth";
import type { Tenant } from "@/types/api";

jest.mock("@/services/tenant.service");
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

/**
 * THE ONE SWITCH THAT DECIDES WHAT A CASHIER CAN DO WITH AN EMPTY SHELF.
 *
 * ON (the default) the till sells it and the balance goes negative — the honest
 * setting, because the goods left the room and the usual cause is a delivery
 * nobody has keyed in yet. OFF makes the till the control, and the server
 * refuses the sale wherever it comes from.
 *
 * THE DEFAULT IS ASSERTED FROM AN ABSENT FIELD, not from a written `true`: every
 * tenant document created before this existed has nothing there, and reading
 * that as "off" would silently tighten the rule for all of them.
 */
const tenant = (overrides: Partial<Tenant["settings"]> = {}): Tenant =>
  ({
    _id: "t1",
    name: "Toko Uji",
    slug: "toko-uji",
    logoUrl: null,
    timezone: "Asia/Jakarta",
    currency: "IDR",
    settings: { hotelMode: "numbered", taxRate: 11, ...overrides },
    subscription: { plan: "free", status: "active" },
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as unknown as Tenant;

const onSaved = jest.fn();

const toggle = () => screen.getByRole("switch", { name: /stok habis/i });
const saveButton = () =>
  screen.getByRole("button", { name: /simpan setelan stok/i });

beforeEach(() => {
  onSaved.mockClear();
  (Swal.fire as jest.Mock).mockClear();
  (tenantService.updateSettings as jest.Mock).mockResolvedValue(tenant());
});

describe("what it shows", () => {
  it("reads an absent setting as allowed — the server's own default", () => {
    renderWithAuth(<StockSettingsForm tenant={tenant()} onSaved={onSaved} />);

    expect(toggle()).toBeChecked();
  });

  it("reads a stored false as refused", () => {
    renderWithAuth(
      <StockSettingsForm
        tenant={tenant({ allowNegativeStock: false })}
        onSaved={onSaved}
      />,
    );

    expect(toggle()).not.toBeChecked();
  });

  /*
    THE COPY STATES THE CONSEQUENCE, not the setting: "izinkan stok minus" is a
    phrase somebody has to translate into what happens at the counter, and what
    happens at the counter is what they are deciding.
  */
  it("says what happens at the till, both ways round", async () => {
    renderWithAuth(<StockSettingsForm tenant={tenant()} onSaved={onSaved} />);

    expect(screen.getByText(/saldonya jadi minus/i)).toBeInTheDocument();

    await userEvent.click(toggle());

    expect(screen.getByText(/pembayaran ditolak/i)).toBeInTheDocument();
  });

  /*
    IT DOES NOT RESTATE HISTORY. Somebody who turns this off to "fix" last week
    will find nothing has moved — only a receipt or an opname clears a balance
    that is already below zero.
  */
  it("warns that turning it off does not clear existing minus stock", () => {
    renderWithAuth(<StockSettingsForm tenant={tenant()} onSaved={onSaved} />);

    expect(
      screen.getByText(/tidak/).closest("p")?.textContent,
    ).toMatch(/stok yang sudah\s*minus/i);
  });
});

describe("saving", () => {
  it("stays disabled until the switch moves", () => {
    // A save that changes nothing is a request the API rejects; offering it is
    // offering a button that can only fail.
    renderWithAuth(<StockSettingsForm tenant={tenant()} onSaved={onSaved} />);

    expect(saveButton()).toBeDisabled();
  });

  it("sends the flag and tells the parent to re-read", async () => {
    renderWithAuth(<StockSettingsForm tenant={tenant()} onSaved={onSaved} />);

    await userEvent.click(toggle());
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(tenantService.updateSettings).toHaveBeenCalledWith({
        allowNegativeStock: false,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("sends true when a shop turns it back on", async () => {
    renderWithAuth(
      <StockSettingsForm
        tenant={tenant({ allowNegativeStock: false })}
        onSaved={onSaved}
      />,
    );

    await userEvent.click(toggle());
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(tenantService.updateSettings).toHaveBeenCalledWith({
        allowNegativeStock: true,
      }),
    );
  });
});

describe("permissions", () => {
  /*
    `tenants:update` IS SEPARATE FROM `read` — and the route behind this carries
    the same gate, so hiding the form is a courtesy rather than the control.
  */
  it("shows the value read-only to a role that may not update", () => {
    renderWithAuth(<StockSettingsForm tenant={tenant()} onSaved={onSaved} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "tenants", actions: ["read"] }],
    });

    expect(screen.getByText(/tetap bisa dijual/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /simpan setelan stok/i }),
    ).not.toBeInTheDocument();
  });
});

describe("when the server refuses", () => {
  it("toasts the reason and unlocks the button", async () => {
    (tenantService.updateSettings as jest.Mock).mockRejectedValue(
      new ApiError("Forbidden", 403),
    );

    renderWithAuth(<StockSettingsForm tenant={tenant()} onSaved={onSaved} />);
    await userEvent.click(toggle());
    await userEvent.click(saveButton());

    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    expect((Swal.fire as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
      icon: "error",
      title: "Forbidden",
    });
    expect(saveButton()).toBeEnabled();
  });
});
