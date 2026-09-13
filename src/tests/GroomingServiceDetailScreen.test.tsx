import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingServiceDetailScreen } from "@/features/grooming";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { serviceService } from "@/services/service.service";
import type { Branch, PageResult, Service } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard/layanan/grooming/katalog/svc-1",
  useSearchParams: () => new URLSearchParams(),
}));

// The mutations toast on success; mock the library so no real dialog is built.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

jest.mock("@/services/booking.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/service.service");

/**
 * Grooming › Layanan & Harga › one service — the mockup's detail page, read-only
 * with an Ubah into the form.
 *
 * WHAT IS PINNED HERE: what the page says is taken from the record (and a gap in
 * the variant grid is said, not hidden); the three things the page does itself —
 * Nonaktifkan, Hapus, Duplikat — reach the API with the right body; and a role
 * that may only read is offered nothing to press and asked no question it would
 * be refused.
 */
const SERVICE = {
  _id: "svc-1",
  tenantId: "t1",
  name: "Express Wash",
  code: "GRM-01",
  image: null,
  businessLineId: "bl-grooming",
  salesAccountId: null,
  categoryId: null,
  price: null,
  durationMin: 45,
  description: "Mandi cepat untuk anabul yang rutin.",
  hasVariants: true,
  variantAxes: ["sizeCategory"],
  // "large" is deliberately unpriced.
  variants: [
    { petType: null, sizeCategory: "small", furType: null, price: "89000.0000" },
    { petType: null, sizeCategory: "medium", furType: null, price: "129000.0000" },
  ],
  sessions: ["Mandi", "Blow dry"],
  sessionWeights: [70, 30],
  allBranches: false,
  branchIds: ["br-1", "br-2"],
  serviceType: "main",
  addonServiceIds: ["add-1"],
  included: ["Mandi", "Parfum"],
  serviceLocations: ["in_store"],
  pickupDeliveryAvailable: false,
  taxExempt: false,
  isActive: true,
  deletedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
} as Service;

const ADDON = {
  ...SERVICE,
  _id: "add-1",
  name: "Spa Aromaterapi",
  code: "ADD-01",
  hasVariants: false,
  variantAxes: [],
  variants: [],
  price: "70000.0000",
  durationMin: 20,
  serviceType: "addon",
  addonServiceIds: [],
  sessions: [],
  sessionWeights: [],
} as Service;

function page<T>(items: T[]): PageResult<T> {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  mockPush.mockReset();
  jest.mocked(serviceService.getById).mockResolvedValue(SERVICE);
  jest.mocked(serviceService.list).mockResolvedValue(page([ADDON]));
  jest
    .mocked(bookingService.serviceCounts)
    .mockResolvedValue({ counts: { "svc-1": 12 } });
  jest.mocked(branchService.list).mockResolvedValue(
    page([
      { _id: "br-1", name: "Barat" },
      { _id: "br-2", name: "Timur" },
    ] as Branch[]),
  );
});

const renderDetail = (options?: Parameters<typeof renderWithAuth>[1]) =>
  renderWithAuth(<GroomingServiceDetailScreen serviceId="svc-1" />, options);

describe("GroomingServiceDetailScreen", () => {
  it("reads the service: its booking count, its branches, and what is missing", async () => {
    renderDetail();

    expect(
      await screen.findByRole("heading", { name: "Express Wash" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("GRM-01 · 12 booking · Barat, Timur"),
      ).toBeInTheDocument(),
    );
    expect(bookingService.serviceCounts).toHaveBeenCalledWith(["svc-1"]);

    expect(screen.getByRole("link", { name: /Ubah/ })).toHaveAttribute(
      "href",
      "/dashboard/master/layanan/svc-1",
    );

    expect(screen.getByText("Rp 89 rb")).toBeInTheDocument();
    expect(screen.getByText("sampai Rp 129 rb · 2 varian")).toBeInTheDocument();
    expect(screen.getByText("bobot 100%")).toBeInTheDocument();
    expect(
      screen.getByText("1 kombinasi varian belum diberi harga."),
    ).toBeInTheDocument();
  });

  it("turns the service off, and the page follows what the API answered", async () => {
    jest
      .mocked(serviceService.update)
      .mockResolvedValue({ ...SERVICE, isActive: false });

    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Nonaktifkan" }),
    );

    await waitFor(() =>
      expect(serviceService.update).toHaveBeenCalledWith("svc-1", {
        isActive: false,
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Aktifkan" }),
    ).toBeInTheDocument();

    const [active, portal, inactive] = screen.getAllByRole("radio");
    expect(active).toHaveAttribute("aria-checked", "false");
    expect(inactive).toHaveAttribute("aria-checked", "true");
    // No portal, no flag: drawn so the shape is visible, never choosable.
    expect(portal).toBeDisabled();
  });

  it("deletes from the header and goes back to the list", async () => {
    jest.mocked(serviceService.remove).mockResolvedValue(SERVICE);

    renderDetail();

    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Hapus" }),
    );

    await waitFor(() =>
      expect(serviceService.remove).toHaveBeenCalledWith("svc-1"),
    );
    expect(mockPush).toHaveBeenCalledWith("/dashboard/layanan/grooming/katalog");
  });

  it("duplicates as an inactive copy, trying the next code when one is taken", async () => {
    jest
      .mocked(serviceService.create)
      .mockRejectedValueOnce(new ApiError("Code already in use", 409))
      .mockResolvedValueOnce({ ...SERVICE, _id: "svc-9" });

    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Duplikat" }),
    );

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        "/dashboard/layanan/grooming/katalog/svc-9",
      ),
    );
    expect(serviceService.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "Express Wash (salinan)",
        code: "GRM-01-SALIN",
        isActive: false,
      }),
    );
    expect(serviceService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ code: "GRM-01-SALIN2" }),
    );

    const [payload] = jest.mocked(serviceService.create).mock.calls[1];
    expect(payload.variants).toHaveLength(2);
    expect(payload.sessionWeights).toEqual([70, 30]);
    expect(payload).not.toHaveProperty("image");
    expect(payload).not.toHaveProperty("price");
  });

  it("shows every variant combination, and says which one has no price", async () => {
    renderDetail();

    await userEvent.click(
      await screen.findByRole("tab", { name: "Varian & Harga" }),
    );

    expect(
      within(screen.getByRole("row", { name: /Besar/ })).getByText(
        "Belum diberi harga",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /Kecil/ })).getByText(/89\.000/),
    ).toBeInTheDocument();
  });

  it("lists the tahapan with their weights and the add-ons by name", async () => {
    renderDetail();

    await userEvent.click(
      await screen.findByRole("tab", { name: "Tahapan & Add-on" }),
    );

    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(await screen.findByText("Spa Aromaterapi")).toBeInTheDocument();
    expect(serviceService.list).toHaveBeenCalledWith(
      expect.objectContaining({ serviceType: "addon", includeDeleted: true }),
    );
  });

  it("keeps the portal honest: the content is shown, nothing publishes", async () => {
    renderDetail();

    await userEvent.click(await screen.findByRole("tab", { name: "Portal" }));

    expect(screen.getByText(/Portal pelanggan belum ada/)).toBeInTheDocument();
    expect(screen.getAllByText("Parfum").length).toBeGreaterThan(0);
  });

  it("offers a read-only role nothing to press and asks nothing it would be refused", async () => {
    renderDetail({
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read"] }],
    });

    expect(
      await screen.findByRole("heading", { name: "Express Wash" }),
    ).toBeInTheDocument();

    for (const name of ["Nonaktifkan", "Hapus", "Duplikat"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: /Ubah/ })).not.toBeInTheDocument();

    const [active] = screen.getAllByRole("radio");
    expect(active).toBeDisabled();

    expect(screen.getByText("GRM-01 · 2 cabang")).toBeInTheDocument();
    expect(screen.getByText("tidak bisa dilihat")).toBeInTheDocument();
    expect(bookingService.serviceCounts).not.toHaveBeenCalled();
    expect(branchService.list).not.toHaveBeenCalled();
  });
});
