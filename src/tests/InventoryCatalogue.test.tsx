import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OpnameScreen } from "@/features/inventory";
import * as demo from "@/features/inventory/data/demoStore";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * Mount tests for the stock screens that are still demo-backed.
 *
 * SCREENS MOVE OUT AS THEY ARE WIRED. The catalogue left for
 * ProductsScreen.test.tsx and ProductForm.test.tsx; Batch & Expired left for
 * BatchesScreen.test.tsx. Each fetches, so its tests mock services instead of
 * seeding a store. Opname is what remains: it has no backend yet.
 */
beforeEach(() => {
  demo.resetState();
  push.mockClear();
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
