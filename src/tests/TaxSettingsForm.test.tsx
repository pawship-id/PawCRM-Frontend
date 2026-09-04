import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Swal from "sweetalert2";

import { TaxSettingsForm } from "@/features/tenant/components/TaxSettingsForm";
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
 * The two settings that decide what a customer pays.
 *
 * WHY THIS FORM EXISTS AT ALL is the thing worth keeping in view: both values
 * have been read on every sale since the till was built, and neither could be
 * seen or changed from anywhere in the app. Survivable while the default was the
 * only value anybody used; not survivable once invoices are raised by hand,
 * where a business set the wrong way bills 11% off every time with nothing on
 * screen to say why.
 */
const tenant = (overrides: Partial<Tenant["settings"]> = {}): Tenant =>
  ({
    _id: "t1",
    name: "Toko Uji",
    slug: "toko-uji",
    logoUrl: null,
    timezone: "Asia/Jakarta",
    currency: "IDR",
    settings: { hotelMode: "numbered", taxRate: 11, priceIncludesTax: true, ...overrides },
    subscription: { plan: "free", status: "active" },
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as unknown as Tenant;

const onSaved = jest.fn();

const rateField = () => screen.getByLabelText(/tarif ppn/i);
const inclusiveSwitch = () =>
  screen.getByRole("switch", { name: /sudah termasuk ppn/i });
const saveButton = () =>
  screen.getByRole("button", { name: /simpan setelan pajak/i });

beforeEach(() => {
  onSaved.mockClear();
  (Swal.fire as jest.Mock).mockClear();
  (tenantService.updateSettings as jest.Mock).mockResolvedValue(tenant());
});

describe("saving", () => {
  it("stays disabled until something changes", async () => {
    // A save that changes nothing is a request the API rejects; offering it is
    // offering a button that can only fail.
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    expect(saveButton()).toBeDisabled();
  });

  it("sends both settings once one of them moves", async () => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    await userEvent.clear(rateField());
    await userEvent.type(rateField(), "12");
    await userEvent.click(saveButton());

    await waitFor(() => expect(tenantService.updateSettings).toHaveBeenCalled());
    expect((tenantService.updateSettings as jest.Mock).mock.calls[0][0]).toEqual({
      taxRate: 12,
      priceIncludesTax: true,
    });
  });

  it("sends the switch on its own", async () => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    await userEvent.click(inclusiveSwitch());
    await userEvent.click(saveButton());

    await waitFor(() => expect(tenantService.updateSettings).toHaveBeenCalled());
    expect(
      (tenantService.updateSettings as jest.Mock).mock.calls[0][0],
    ).toMatchObject({ priceIncludesTax: false });
  });

  it("tells the parent to re-read afterwards", async () => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    await userEvent.click(inclusiveSwitch());
    await userEvent.click(saveButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe("the rate", () => {
  it.each([
    ["a negative rate", "-1", /antara 0 dan 100/i],
    ["a rate above 100", "150", /antara 0 dan 100/i],
    ["an empty rate", "", /isi angka persennya/i],
  ])("refuses %s", async (_label, value, message) => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    await userEvent.clear(rateField());
    if (value) await userEvent.type(rateField(), value);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(tenantService.updateSettings).not.toHaveBeenCalled();
  });

  /*
    ZERO IS A REAL ANSWER, not a missing one. A shop that does not collect PPN
    sets it to zero, and refusing that would push it into pretending otherwise.
  */
  it("accepts zero", async () => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    await userEvent.clear(rateField());
    await userEvent.type(rateField(), "0");
    await userEvent.click(saveButton());

    await waitFor(() => expect(tenantService.updateSettings).toHaveBeenCalled());
  });
});

/**
 * THE COPY STATES THE CONSEQUENCE, not the setting. "Inclusive" and "exclusive"
 * are words an accountant uses; what a shopkeeper needs to know is whether the
 * number on the shelf is the number the customer pays.
 */
describe("what the copy says", () => {
  it("explains the inclusive case in terms of the shelf price", async () => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    expect(screen.getByText(/harga di label rak adalah yang dibayar/i)).toBeInTheDocument();
  });

  it("switches to the exclusive explanation as the toggle moves", async () => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    await userEvent.click(inclusiveSwitch());

    expect(
      screen.getByText(/ditambahkan di atas harga katalog/i),
    ).toBeInTheDocument();
  });

  /*
    SOMEBODY WILL FLIP THIS TO "FIX" LAST MONTH. Every posted sale stored the
    base and tax it was charged with, so nothing moves — and the form has to say
    so before they try.
  */
  it("warns that history is not restated", async () => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);

    // Matched on the paragraph's whole text: the sentence is broken up by a
    // <strong> around "tidak", so a plain text query sees two nodes and neither
    // of them is the sentence.
    expect(
      screen.getByText(/transaksi yang sudah terjadi/i).textContent,
    ).toMatch(/tidak\s*mengubah transaksi yang sudah terjadi/i);
  });
});

describe("permissions", () => {
  /*
    `tenants:update` IS SEPARATE FROM `read`. Opening the business page and
    changing how it bills are two rights — and the route behind this carries the
    same gate, so hiding the form is a courtesy rather than the control.
  */
  it("shows the values read-only to a role that may not update", async () => {
    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "tenants", actions: ["read"] }],
    });

    expect(screen.getByText("11%")).toBeInTheDocument();
    expect(screen.getByText(/sudah termasuk ppn/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /simpan setelan pajak/i }),
    ).not.toBeInTheDocument();
  });
});

describe("when the server refuses", () => {
  it("toasts the reason and unlocks the button", async () => {
    (tenantService.updateSettings as jest.Mock).mockRejectedValue(
      new ApiError("Forbidden", 403),
    );

    renderWithAuth(<TaxSettingsForm tenant={tenant()} onSaved={onSaved} />);
    await userEvent.click(inclusiveSwitch());
    await userEvent.click(saveButton());

    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    expect((Swal.fire as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
      icon: "error",
      title: "Forbidden",
    });
    expect(saveButton()).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
