import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MembershipPlanForm } from "@/features/memberships";
import { branchService } from "@/services/branch.service";
import { membershipService } from "@/services/membership.service";
import { petOptionService } from "@/services/petOption.service";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";
import type { Service } from "@/types/api";
import type { MembershipPlan } from "@/types/membership";

import { petOptionId, primePetOptions } from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/membership.service");
jest.mock("@/services/service.service");
jest.mock("@/services/product.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/petOption.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  usePathname: () => "/dashboard/promosi/membership/paket/new",
}));

const mocked = membershipService as jest.Mocked<typeof membershipService>;
const CAT = petOptionId("species", "Kucing");
const SMALL = petOptionId("size", "Kecil");

const basic = {
  _id: "svc-basic",
  name: "Basic Grooming",
  serviceType: "main",
  serviceKind: "grooming",
  serviceKinds: [],
  hasVariants: true,
  price: null,
  serviceLocations: ["in_store"],
  variants: [
    { petType: CAT, sizeCategory: SMALL, furType: null, price: "100000.0000", isActive: true },
  ],
} as unknown as Service;

const homeVisit = {
  ...basic,
  _id: "svc-home",
  name: "Home Grooming",
  serviceLocations: ["in_home"],
} as unknown as Service;

beforeEach(() => {
  jest.clearAllMocks();
  primePetOptions(petOptionService.list);
  (serviceService.list as jest.Mock).mockResolvedValue({
    items: [basic, homeVisit],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
  (productService.list as jest.Mock).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 1 },
  });
  (branchService.list as jest.Mock).mockResolvedValue({
    items: [{ _id: "b1", name: "Pusat" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
});

describe("MembershipPlanForm", () => {
  it("builds a plan with an 'atau' benefit and sends the V1 payload", async () => {
    mocked.createPlan.mockResolvedValue({ id: "new-plan" } as MembershipPlan);
    const user = userEvent.setup();
    renderWithAuth(<MembershipPlanForm />);

    expect(screen.getByRole("heading", { name: "Paket membership baru" })).toBeInTheDocument();
    expect(screen.getByLabelText("Kode")).toHaveAttribute("placeholder", "Otomatis");

    // Blocked until a name is typed — and the bar says why.
    const save = screen.getByRole("button", { name: "Simpan paket" });
    expect(save).toBeDisabled();
    expect(screen.getByText("Isi nama paketnya dulu.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Nama paket/), "Explorer");
    await user.type(screen.getByLabelText(/Harga paket \(Rp\)/), "450.000");

    const card = screen.getByRole("region", { name: "Benefit 1" });
    await user.type(within(card).getByLabelText(/Nama benefit/), "Grooming");

    // Option 1: Basic Grooming, gratis.
    await user.click(within(card).getByRole("button", { name: "Layanan" }));
    await user.click(await screen.findByRole("option", { name: "Basic Grooming" }));
    await user.click(screen.getByRole("button", { name: "Terapkan" }));

    // Option 2 ("atau"): Home Grooming — a home service, so Biaya kunjungan appears.
    await user.click(within(card).getByRole("button", { name: /Opsi lain \(atau\)/ }));
    expect(within(card).getByText("ATAU")).toBeInTheDocument();
    const layanan = within(card).getAllByRole("button", { name: "Layanan" });
    await user.click(layanan[1]);
    await user.click(await screen.findByRole("option", { name: "Home Grooming" }));
    await user.click(screen.getByRole("button", { name: "Terapkan" }));
    const visit = await within(card).findByRole("radiogroup", { name: "Biaya kunjungan opsi 2" });
    await user.click(within(visit).getByRole("radio", { name: "Gratis" }));

    // The preview reads it back.
    const preview = screen.getByRole("complementary", { name: "Pratinjau paket" });
    expect(within(preview).getByText("Explorer")).toBeInTheDocument();
    expect(within(preview).getByText(/1× per bulan/)).toBeInTheDocument();
    expect(within(preview).getByText(/Home Grooming — gratis, biaya kunjungan gratis/)).toBeInTheDocument();

    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(mocked.createPlan).toHaveBeenCalled());
    const payload = mocked.createPlan.mock.calls[0][0];
    expect(payload).toMatchObject({
      code: "",
      name: "Explorer",
      price: "450000",
      priceMode: "fixed",
      durationMonths: 6,
      attachTo: "pet",
      eligibility: "all",
    });
    expect(payload.benefits).toEqual([
      expect.objectContaining({
        label: "Grooming",
        quota: { perPeriod: 1, period: "month", total: null },
        options: [
          expect.objectContaining({
            kind: "free_item",
            scope: expect.objectContaining({ target: "service", serviceIds: ["svc-basic"] }),
          }),
          expect.objectContaining({
            kind: "free_item",
            visitFee: "free",
            scope: expect.objectContaining({ serviceIds: ["svc-home"] }),
          }),
        ],
      }),
    ]);
    expect(push).toHaveBeenCalledWith("/dashboard/promosi/membership/paket/new-plan");
  });

  it("per-variant pricing follows an animal, never a customer", async () => {
    const user = userEvent.setup();
    renderWithAuth(<MembershipPlanForm />);

    const mode = screen.getByRole("radiogroup", { name: "Mode harga" });
    expect(within(mode).getByRole("radio", { name: "Per varian hewan" })).toBeEnabled();

    await user.click(
      within(screen.getByRole("radiogroup", { name: "Melekat ke" })).getByRole("radio", {
        name: "Pelanggan",
      }),
    );
    expect(within(mode).getByRole("radio", { name: "Per varian hewan" })).toBeDisabled();
  });

  it("puts a server field error under its option", async () => {
    const { ApiError } = jest.requireActual("@/services/api-error");
    mocked.updatePlan.mockRejectedValue(
      new ApiError("Validation failed", 400, {
        details: [{ field: "body.benefits.0.options.0.value", message: "Persen wajib diisi" }],
      }),
    );
    const user = userEvent.setup();
    const plan = {
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
      eligibility: "all",
      branchIds: [],
      publicDisplay: { visible: false, featured: false, order: 0, badge: null },
      renewalOfferDays: 30,
      isActive: true,
      benefits: [
        {
          id: "ben-1",
          label: "Add-on",
          kind: "discount_percent",
          scope: { target: "addon", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] },
          value: 10,
          quota: { total: null, perPeriod: null, period: null },
          maxPerTransaction: 5,
          options: [
            {
              id: "opt-1",
              kind: "discount_percent",
              scope: { target: "addon", serviceIds: [], productIds: [], categoryIds: [], serviceKinds: [] },
              value: 10,
              priceMode: "same",
              variantPrices: [],
              visitFee: "zone",
              summary: "Diskon 10%",
            },
          ],
          summary: "Diskon 10% · tanpa batas",
        },
      ],
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    } as MembershipPlan;

    renderWithAuth(<MembershipPlanForm plan={plan} />);
    expect(screen.getByRole("heading", { level: 1, name: "Explorer" })).toBeInTheDocument();
    expect(screen.getByText("Semua add-on")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan paket" }));

    await waitFor(() => expect(mocked.updatePlan).toHaveBeenCalled());
    const payload = mocked.updatePlan.mock.calls[0][1];
    expect("code" in payload).toBe(true);
    expect(payload.benefits?.[0]).toMatchObject({
      id: "ben-1",
      quota: { total: null, perPeriod: null, period: null },
      maxPerTransaction: 5,
      options: [expect.objectContaining({ id: "opt-1", value: 10 })],
    });
    expect(await screen.findByText("Persen wajib diisi")).toBeInTheDocument();
  });
});
