import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosSettingsDialog } from "@/features/pos/components/PosSettingsDialog";

import { renderWithAuth } from "./helpers/renderWithAuth";

const STORAGE_KEY = "buloo.pos.receiptSize";

/**
 * Pengaturan Kasir (FR-8): "sesuai konfigurasi printer per perangkat".
 *
 * The failure this screen exists to fix is small and constant — the cashier
 * chose the paper size again on every single receipt, because the choice lived
 * in a dialog that closed.
 */
describe("PosSettingsDialog", () => {
  it("opens on what this device already prints on", async () => {
    window.localStorage.setItem(STORAGE_KEY, "58");

    renderWithAuth(<PosSettingsDialog open onOpenChange={jest.fn()} />);

    expect(
      await screen.findByRole("button", { name: "58 mm" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("defaults to 80 mm for a till nobody has set up", async () => {
    renderWithAuth(<PosSettingsDialog open onOpenChange={jest.fn()} />);

    // The common thermal roll. A4 as the default would waste a sheet per sale.
    expect(
      await screen.findByRole("button", { name: "80 mm" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("remembers the choice, which is the entire point of the screen", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosSettingsDialog open onOpenChange={jest.fn()} />);

    await user.click(await screen.findByRole("button", { name: "A4" }));

    // Survives the dialog closing, the sale ending, and the page reloading.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("a4");
  });

  it("applies immediately — there is nothing to submit", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosSettingsDialog open onOpenChange={jest.fn()} />);

    await user.click(await screen.findByRole("button", { name: "58 mm" }));

    expect(screen.getByRole("button", { name: "58 mm" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // ui-rules §16's action bar is for a document; a preference is not one.
    expect(
      screen.queryByRole("button", { name: /simpan/i }),
    ).not.toBeInTheDocument();
  });

  /*
    THE SCOPE HAS TO BE ON SCREEN. A shop with a thermal printer at the counter
    and an A4 printer in the office will set the two differently, and somebody
    who believes this is a shop-wide setting will "fix" the counter from the
    office and wonder why nothing changed.
  */
  it("says out loud that it only covers this device", async () => {
    renderWithAuth(<PosSettingsDialog open onOpenChange={jest.fn()} />);

    expect(
      await screen.findByText(/berlaku di perangkat ini saja/i),
    ).toBeInTheDocument();
  });

  /*
    LAST IN THE FILE ON PURPOSE. Once a write has failed, the module holds the
    value in memory for the life of the tab — which is right in a browser and
    would leak into whatever test ran next here.
  */
  it("survives a browser that refuses to store anything", async () => {
    const user = userEvent.setup();
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        // Safari in a private window, and any browser told to block site data.
        throw new Error("QuotaExceededError");
      });

    renderWithAuth(<PosSettingsDialog open onOpenChange={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: "A4" }));

    // The choice still applies to the receipt in front of them; it just will not
    // outlive the tab. Refusing the click would be the wrong trade at a counter.
    expect(screen.getByRole("button", { name: "A4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    setItem.mockRestore();
  });
});
