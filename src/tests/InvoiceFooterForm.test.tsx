import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Swal from "sweetalert2";

import { InvoiceFooterForm } from "@/features/tenant/components/InvoiceFooterForm";
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
 * WHAT IS PRINTED AT THE FOOT OF EVERY INVOICE.
 *
 * WHY IT EXISTS: the print mockup carries "Pembayaran ditujukan ke: BCA … a.n.
 * …", and an invoice that bills somebody without saying where to send the money
 * makes them ring up to ask. There was nowhere to store that, so the sheet
 * shipped without the line.
 *
 * ONE BLOCK RATHER THAN bank-name / number / holder, and the trade is real: a
 * shop with two accounts or one that wants payment terms needs no release, but
 * nothing here can validate an account number either.
 */
const tenant = (invoiceFooterNote?: string): Tenant =>
  ({
    _id: "t1",
    name: "Toko Uji",
    slug: "toko-uji",
    logoUrl: null,
    timezone: "Asia/Jakarta",
    currency: "IDR",
    settings: {
      hotelMode: "numbered",
      taxRate: 11,
      priceIncludesTax: true,
      ...(invoiceFooterNote === undefined ? {} : { invoiceFooterNote }),
    },
    subscription: { plan: "free", status: "active" },
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as unknown as Tenant;

const onSaved = jest.fn();

const field = () => screen.getByLabelText(/^catatan$/i);
const saveButton = () =>
  screen.getByRole("button", { name: /simpan catatan/i });

beforeEach(() => {
  onSaved.mockClear();
  (Swal.fire as jest.Mock).mockClear();
  (tenantService.updateSettings as jest.Mock).mockResolvedValue(tenant());
});

const open = (note?: string) =>
  renderWithAuth(
    <InvoiceFooterForm tenant={tenant(note)} onSaved={onSaved} />,
  );

describe("saving", () => {
  it("sends what was typed, newlines and all", async () => {
    const user = userEvent.setup();
    open();

    await user.type(field(), "Bayar ke BCA 123{enter}a.n. Toko Uji");
    await user.click(saveButton());

    await waitFor(() =>
      expect(tenantService.updateSettings).toHaveBeenCalledWith({
        invoiceFooterNote: "Bayar ke BCA 123\na.n. Toko Uji",
      }),
    );
  });

  it("tells the parent to re-read, rather than trusting the response", async () => {
    const user = userEvent.setup();
    open();

    await user.type(field(), "x");
    await user.click(saveButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  /*
    CLEARING IT IS A REAL ACT, not an unfinished form. A shop that changes bank
    must be able to empty the footer rather than leave stale account details on
    every invoice it sends — so Simpan stays available with the box emptied,
    which the usual "disabled until answered" rule would forbid.
  */
  it("lets an existing note be cleared", async () => {
    const user = userEvent.setup();
    open("Bayar ke BCA 123");

    await user.clear(field());

    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());

    await waitFor(() =>
      expect(tenantService.updateSettings).toHaveBeenCalledWith({
        invoiceFooterNote: "",
      }),
    );
  });
});

describe("what it will not send", () => {
  it("keeps Simpan disabled until something changes", () => {
    open("Bayar ke BCA 123");

    expect(saveButton()).toBeDisabled();
  });

  it("refuses one longer than the sheet can carry", async () => {
    const user = userEvent.setup();
    open();

    // Typed 601 characters would be 601 keystrokes; pasted is the real case.
    await user.click(field());
    await user.paste("x".repeat(601));

    expect(await screen.findByText(/maksimal 600 karakter/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("shows the server's refusal rather than a generic one", async () => {
    const user = userEvent.setup();
    (tenantService.updateSettings as jest.Mock).mockRejectedValue(
      new ApiError("Validation failed", 400),
    );
    open();

    await user.type(field(), "x");
    await user.click(saveButton());

    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    expect((Swal.fire as jest.Mock).mock.calls[0][0]).toMatchObject({
      title: "Validation failed",
      icon: "error",
    });
  });
});

describe("a role that may not change it", () => {
  const readOnly = {
    isSuperAdmin: false,
    permissions: [{ feature: "tenants", actions: ["read"] }],
  };

  it("shows the note without a form", () => {
    renderWithAuth(
      <InvoiceFooterForm tenant={tenant("Bayar ke BCA 123")} onSaved={onSaved} />,
      readOnly,
    );

    expect(screen.getByText("Bayar ke BCA 123")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^catatan$/i)).not.toBeInTheDocument();
  });

  it("says plainly when there is nothing set", () => {
    renderWithAuth(
      <InvoiceFooterForm tenant={tenant()} onSaved={onSaved} />,
      readOnly,
    );

    expect(screen.getByText("Belum diisi.")).toBeInTheDocument();
  });
});
