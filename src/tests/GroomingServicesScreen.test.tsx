import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingServicesScreen } from "@/features/grooming";
import { bookingService } from "@/services/booking.service";
import {
  businessLineService,
  type BusinessLine,
} from "@/services/businessLine.service";
import { serviceService } from "@/services/service.service";
import type { PageResult, Service } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/layanan/grooming/katalog",
  useSearchParams: () => new URLSearchParams(),
}));

// The mutations toast on success; mock the library so no real dialog is built.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

jest.mock("@/services/booking.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/service.service");

/**
 * Grooming › Layanan & Harga.
 *
 * WHAT IS PINNED HERE:
 *  - the mockup's seven columns, filled from what the API really holds;
 *  - a live row opens the service's detail page, a deleted one opens nothing
 *    (the API does not return it by id) and carries its Pulihkan instead;
 *  - "N booking" is asked for once per page, and never by a role that may not
 *    read bookings.
 */
const GROOMING: BusinessLine = {
  _id: "bl-grooming",
  name: "Grooming",
  color: "#1A2B4C",
};

function service(overrides: Partial<Service> = {}): Service {
  return {
    _id: "svc-1",
    name: "Express Wash",
    code: "GRM-01",
    price: "150000.0000",
    hasVariants: false,
    variants: [],
    variantAxes: [],
    durationMin: 45,
    isActive: true,
    deletedAt: null,
    serviceType: "main",
    serviceLocations: ["in_store"],
    sessions: [],
    sessionWeights: [],
    addonServiceIds: [],
    ...overrides,
  } as Service;
}

function page<T>(items: T[]): PageResult<T> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

const SIZES = ["small", "medium", "large"] as const;
const FURS = ["long hair", "short hair"] as const;

/** Six priced combinations, from Rp 89 rb up to Rp 249 rb. */
const EXPRESS = service({
  hasVariants: true,
  price: null,
  variantAxes: ["sizeCategory", "furType"],
  variants: SIZES.flatMap((size, i) =>
    FURS.map((fur, j) => ({
      petType: null,
      sizeCategory: size,
      furType: fur,
      price: String(89000 + i * 60000 + j * 40000),
    })),
  ),
  serviceLocations: ["in_store", "in_home"],
  sessions: ["Mandi", "Blow dry"],
});

const DELETED = service({
  _id: "svc-2",
  name: "Mandi Kutu",
  code: "GRM-02",
  deletedAt: "2026-09-01T00:00:00.000Z",
});

beforeEach(() => {
  jest.mocked(businessLineService.list).mockResolvedValue(page([GROOMING]));
  jest
    .mocked(bookingService.serviceCounts)
    .mockImplementation(async (ids) => ({
      counts: Object.fromEntries(ids.map((id) => [id, id === "svc-1" ? 12 : 0])),
    }));
});

describe("GroomingServicesScreen", () => {
  it("draws the mockup's columns and a row opens the service's detail page", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([EXPRESS]));

    renderWithAuth(<GroomingServicesScreen />);

    expect(
      await screen.findByRole("link", { name: "Express Wash" }),
    ).toHaveAttribute("href", "/dashboard/layanan/grooming/katalog/svc-1");

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Layanan", "Tempat", "Varian", "Harga", "Durasi", "Tahapan", "Status"]);

    const row = screen.getByRole("row", { name: /Express Wash/ });
    expect(within(row).getByText("Keduanya")).toBeInTheDocument();
    expect(within(row).getByText("6 / 6")).toBeInTheDocument();
    expect(within(row).getByText("Ukuran × Jenis bulu")).toBeInTheDocument();
    expect(within(row).getByText("Rp 89 rb – Rp 249 rb")).toBeInTheDocument();
    expect(within(row).getByText("45 mnt")).toBeInTheDocument();
    expect(within(row).getByText("2 tahap")).toBeInTheDocument();
    expect(within(row).getByText("Aktif")).toBeInTheDocument();

    await waitFor(() =>
      expect(
        within(row).getByText(
          (_, element) =>
            element?.tagName === "SPAN" &&
            element.textContent === "GRM-01 · 12 booking",
        ),
      ).toBeInTheDocument(),
    );
    expect(bookingService.serviceCounts).toHaveBeenCalledWith(["svc-1"]);
  });

  it("asks for no booking count for a role that may not read bookings", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([EXPRESS]));

    renderWithAuth(<GroomingServicesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read"] }],
    });

    await screen.findByRole("link", { name: "Express Wash" });
    expect(bookingService.serviceCounts).not.toHaveBeenCalled();
    expect(screen.queryByText(/booking/)).not.toBeInTheDocument();
  });

  it("restores a deleted service from its status cell, and never links it", async () => {
    jest
      .mocked(serviceService.list)
      .mockImplementation(async (query) =>
        page(query?.includeDeleted ? [EXPRESS, DELETED] : [EXPRESS]),
      );
    jest
      .mocked(serviceService.restore)
      .mockResolvedValue(service({ _id: "svc-2" }));

    renderWithAuth(<GroomingServicesScreen />);

    await screen.findByRole("link", { name: "Express Wash" });
    await userEvent.click(screen.getByLabelText("Tampilkan terhapus"));

    expect(await screen.findByText("Terhapus")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Mandi Kutu" }),
    ).not.toBeInTheDocument();
    // Deleting moved to the detail page; the table has no action column.
    expect(
      screen.queryByRole("button", { name: "Hapus" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Pulihkan" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Pulihkan",
      }),
    );

    await waitFor(() =>
      expect(serviceService.restore).toHaveBeenCalledWith("svc-2"),
    );
  });
});
