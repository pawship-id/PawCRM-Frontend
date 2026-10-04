import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { NumberingSettingsScreen } from "@/features/settings";
import { previewNumber } from "@/features/settings/numbering";
import { tenantService } from "@/services/tenant.service";
import type { DocumentNumberSeries } from "@/types/api";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/pengaturan/nomor-dokumen",
}));
jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

function series(over: Partial<DocumentNumberSeries> = {}): DocumentNumberSeries {
  return {
    key: "journalEntry",
    prefix: "JE",
    reset: "monthly",
    padding: 4,
    defaults: { prefix: "JE", reset: "monthly", padding: 4 },
    separator: "-",
    scopeStyle: "long",
    editable: true,
    overridden: false,
    example: "JE-2026-09-0001",
    ...over,
  };
}

const ROWS: DocumentNumberSeries[] = [
  series(),
  series({
    key: "customerInvoice",
    prefix: "INV",
    defaults: { prefix: "INV", reset: "monthly", padding: 4 },
    separator: "/",
    scopeStyle: "short",
    example: "INV/2609/0001",
  }),
  series({
    key: "cashReceipt",
    prefix: "BKM",
    defaults: { prefix: "BKM", reset: "monthly", padding: 4 },
    separator: "/",
    scopeStyle: "short",
    editable: false,
    example: "BKM/2609/0001",
  }),
];

const open = async () => {
  renderWithAuth(<NumberingSettingsScreen />);
  await screen.findByText("Jurnal");
};

/**
 * Pengaturan › Nomor dokumen (23 September 2026). Three things here are logic
 * and each fails quietly: an override is the difference from the REGISTRY, the
 * whole map goes back every save, and a series that is not a tenant's to reshape
 * is drawn without boxes rather than hidden.
 */
describe("NumberingSettingsScreen", () => {
  beforeEach(() => {
    jest.spyOn(tenantService, "numbering").mockResolvedValue(ROWS);
  });
  afterEach(() => jest.restoreAllMocks());

  it("offers boxes for the series a tenant may reshape, and none for the rest", async () => {
    await open();

    // Two editable rows, each with its own three controls.
    expect(screen.getAllByLabelText("Awalan")).toHaveLength(2);
    expect(screen.getAllByLabelText("Jumlah digit")).toHaveLength(2);
    expect(screen.getByText("Faktur penjualan")).toBeInTheDocument();
    // The kas & bank series is listed, with its example, and nothing to type in.
    expect(screen.getByText("Bukti Kas Masuk")).toBeInTheDocument();
    expect(screen.getByText("BKM/2609/0001")).toBeInTheDocument();
  });

  it("redraws the example while somebody is still typing", async () => {
    await open();

    const prefix = screen.getAllByLabelText("Awalan")[0];
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "JV");

    const expected = previewNumber(
      { separator: "-", scopeStyle: "long" },
      { prefix: "JV", reset: "monthly", padding: 4 },
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  /*
    THE BUG THIS PINS: an override measured against the MERGED shape would come
    out empty the second time somebody saved, silently dropping what the shop had
    set. It is measured against `defaults`.
  */
  it("keeps an override that was already saved when something else changes", async () => {
    jest.spyOn(tenantService, "numbering").mockResolvedValue([
      series({ prefix: "JV", overridden: true }),
      ROWS[1],
      ROWS[2],
    ]);
    const save = jest
      .spyOn(tenantService, "updateSettings")
      .mockResolvedValue({} as never);

    await open();

    const invoicePrefix = screen.getAllByLabelText("Awalan")[1];
    await userEvent.clear(invoicePrefix);
    await userEvent.type(invoicePrefix, "FKT");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/ }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        numbering: {
          journalEntry: { prefix: "JV" },
          customerInvoice: { prefix: "FKT" },
        },
      }),
    );
  });

  /* Back to our shape: the series drops out of the map rather than storing it. */
  it("drops an override the shop typed back to the default", async () => {
    jest
      .spyOn(tenantService, "numbering")
      .mockResolvedValue([series({ prefix: "JV", overridden: true }), ROWS[1], ROWS[2]]);
    const save = jest
      .spyOn(tenantService, "updateSettings")
      .mockResolvedValue({} as never);

    await open();

    const prefix = screen.getAllByLabelText("Awalan")[0];
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "JE");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/ }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ numbering: {} }));
  });

  it("keeps Simpan shut until something changes, and while a box is wrong", async () => {
    await open();

    const save = screen.getByRole("button", { name: /Simpan/ });
    expect(save).toBeDisabled();

    const prefix = screen.getAllByLabelText("Awalan")[0];
    await userEvent.clear(prefix);
    expect(await screen.findByText("Isi awalannya")).toBeInTheDocument();
    expect(save).toBeDisabled();

    const padding = screen.getAllByLabelText("Jumlah digit")[0];
    await userEvent.type(prefix, "JV");
    await userEvent.clear(padding);
    await userEvent.type(padding, "9");
    expect(await screen.findByText("Antara 1 dan 8")).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it("shows the shapes but no Simpan to a role that may only read", async () => {
    renderWithAuth(<NumberingSettingsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "tenants", actions: ["read"] }],
    });

    expect(await screen.findByText("Jurnal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Simpan/ })).not.toBeInTheDocument();
  });
});
