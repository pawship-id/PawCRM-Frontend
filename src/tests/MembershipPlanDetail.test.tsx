import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MembershipPlanDetail } from "@/features/memberships";
import { branchService } from "@/services/branch.service";
import { membershipService } from "@/services/membership.service";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";
import type { MembershipPlan } from "@/types/membership";

import { listPage } from "./helpers/membershipFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/membership.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/service.service");
jest.mock("@/services/product.service");
jest.mock("@/services/petOption.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/promotion/membership/plans/p1",
}));

const mocked = membershipService as jest.Mocked<typeof membershipService>;

const PLAN: MembershipPlan = {
  id: "p1",
  code: "MSP-0001",
  name: "Explorer",
  description: null,
  serviceKinds: [],
  price: "450000.0000",
  durationDays: 183,
  durationMonths: 6,
  attachTo: "pet",
  petSpecies: [],
  priceMode: "fixed",
  variantPrices: [],
  eligibility: "new_customer",
  branchIds: [],
  publicDisplay: { visible: false, featured: false, order: 0, badge: null },
  renewalOfferDays: 30,
  isActive: true,
  benefits: [],
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getPlan.mockResolvedValue(PLAN);
  mocked.updatePlan.mockResolvedValue({ ...PLAN, isActive: false });
  (branchService.list as jest.Mock).mockResolvedValue(listPage([]));
  (serviceService.list as jest.Mock).mockResolvedValue(listPage([]));
  (productService.list as jest.Mock).mockResolvedValue(listPage([]));
});

/**
 * Switching a package's sales off asks first (ui-rules §9) and says what keeps
 * working — the cards already issued. Switching it back on stays one click.
 */
describe("Paket membership detail — Nonaktifkan", () => {
  it("asks before switching sales off, then sends isActive: false", async () => {
    const user = userEvent.setup();
    renderWithAuth(<MembershipPlanDetail id="p1" />);

    await user.click(await screen.findByRole("button", { name: "Nonaktifkan" }));
    const dialog = await screen.findByRole("dialog", { name: "Nonaktifkan paket membership" });
    expect(dialog).toHaveTextContent("Explorer");
    expect(dialog).toHaveTextContent("Kartu yang sudah terbit tetap berlaku");
    expect(mocked.updatePlan).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Nonaktifkan paket" }));

    await waitFor(() =>
      expect(mocked.updatePlan).toHaveBeenCalledWith("p1", { isActive: false }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    renderWithAuth(<MembershipPlanDetail id="p1" />);

    await user.click(await screen.findByRole("button", { name: "Nonaktifkan" }));
    const dialog = await screen.findByRole("dialog", { name: "Nonaktifkan paket membership" });
    await user.click(within(dialog).getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocked.updatePlan).not.toHaveBeenCalled();
  });

  it("reactivates an inactive package directly, without a dialog", async () => {
    const user = userEvent.setup();
    mocked.getPlan.mockResolvedValue({ ...PLAN, isActive: false });
    renderWithAuth(<MembershipPlanDetail id="p1" />);

    await user.click(await screen.findByRole("button", { name: "Aktifkan" }));

    await waitFor(() =>
      expect(mocked.updatePlan).toHaveBeenCalledWith("p1", { isActive: true }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
