import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BatchesScreen, OpnameScreen } from "@/features/inventory";
import * as demo from "@/features/inventory/data/demoStore";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * Mount tests for the stock screens that are still demo-backed.
 *
 * THE CATALOGUE MOVED OUT when it was wired to `/api/products`: those screens
 * fetch, so their tests mock services instead of seeding a store, and they live
 * in ProductsScreen.test.tsx and ProductForm.test.tsx. What remains here reads
 * the demo store and is asserted as before — that lots sort by urgency, and that
 * an opname sheet only counts what can hold stock.
 */
beforeEach(() => {
  demo.resetState();
  push.mockClear();
});

describe("BatchesScreen", () => {
  it("counts expiring lots by urgency", () => {
    render(<BatchesScreen />);

    expect(screen.getByText("Sudah lewat tanggal")).toBeInTheDocument();
    expect(screen.getByText("Kritis — kurang 7 hari")).toBeInTheDocument();
    expect(screen.getByText("Nilai berisiko")).toBeInTheDocument();
    // "Perhatian — 30 hari" is deliberately not asserted here: it is both a stat
    // label and the horizon filter's default value, so the query is ambiguous.
  });

  it("lists the soonest-expiring lot first", () => {
    render(<BatchesScreen />);

    const table = screen.getByRole("table");
    const codes = within(table)
      .getAllByText(/^(RC|WSK)-B26-/)
      .map((node) => node.textContent);

    // WSK-B26-0512 expires in 5 days; RC-B26-0455 in 24.
    expect(codes[0]).toBe("WSK-B26-0512");
  });

  it("hides exhausted lots until asked", async () => {
    const user = userEvent.setup();
    render(<BatchesScreen />);

    const toggle = screen.getByLabelText(/Tampilkan lot yang sudah habis/);
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });
});

describe("OpnameScreen", () => {
  it("explains why the sheet snapshots the numbers", () => {
    render(<OpnameScreen />);

    expect(screen.getByText(/mengunci angka stok dan HPP/)).toBeInTheDocument();
  });

  it("starts a sheet and navigates to it", async () => {
    const user = userEvent.setup();
    render(<OpnameScreen />);

    await user.click(screen.getByRole("button", { name: /Mulai opname/ }));

    const opname = demo.getState().opnames[0];
    expect(opname).toBeDefined();
    expect(opname.status).toBe("draft");
    expect(push).toHaveBeenCalledWith(
      `/dashboard/inventory/opname/${opname._id}`,
    );
  });

  it("only sheets products that can hold stock", () => {
    const opname = demo.startOpname("wh_utama");
    const items = demo.opnameItemsOf(opname._id);
    const products = demo.getState().products;

    // A parent's quantity is its variants' and a bundle has none of its own,
    // so neither can be counted.
    for (const item of items) {
      const product = products.find((p) => p._id === item.productId)!;
      expect(["standalone", "variant"]).toContain(product.productType);
    }
  });
});
