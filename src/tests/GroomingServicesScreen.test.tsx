import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingServicesScreen } from "@/features/grooming";
import { isoDate, periodRange } from "@/features/grooming/board";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import {
  businessLineService,
  type BusinessLine,
} from "@/services/businessLine.service";
import { petOptionService } from "@/services/petOption.service";
import { serviceService } from "@/services/service.service";
import type { Branch, PageResult, Service } from "@/types/api";

import {
  makePetOption,
  PET_OPTION_FIXTURES,
  primePetOptions,
} from "./helpers/petOptions";
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
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/service.service");
// Jenis hewan lists the tenant's species; Varian counts over its sizes and coats.
jest.mock("@/services/petOption.service");

/**
 * Grooming › Layanan & Harga.
 *
 * WHAT IS PINNED HERE:
 *  - the mockup's seven columns, filled from what the API really holds;
 *  - a live row opens the service's detail page, a deleted one opens nothing
 *    (the API does not return it by id) and carries its Pulihkan instead;
 *  - "N booking" is asked for once per page, scoped to the card's Cabang and
 *    Periode, and never by a role that may not read bookings;
 *  - the Filter panel sends its fields to the SERVER, only on Terapkan, and
 *    Reset clears them in the same click — the panel's and the card's alike;
 *  - the panel's Tanggal booking and the card's Periode are one value, drawn
 *    the same way: four pills, and the dates only behind Custom.
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

/**
 * Six priced combinations, from Rp 89 rb up to Rp 249 rb, each with its own
 * length — 45 up to 105 minutes. A variant service has no duration of its own.
 */
const EXPRESS = service({
  hasVariants: true,
  price: null,
  durationMin: null,
  variantAxes: ["sizeCategory", "furType"],
  variants: SIZES.flatMap((size, i) =>
    FURS.map((fur, j) => ({
      petType: null,
      sizeCategory: size,
      furType: fur,
      price: String(89000 + i * 60000 + j * 40000),
      durationMin: 45 + i * 25 + j * 10,
      isActive: true,
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
  primePetOptions(petOptionService.list);
  jest.mocked(businessLineService.list).mockResolvedValue(page([GROOMING]));
  jest
    .mocked(branchService.list)
    .mockResolvedValue(page([{ _id: "br-1", name: "Barat" }] as Branch[]));
  jest
    .mocked(bookingService.serviceCounts)
    .mockImplementation(async (ids) => ({
      counts: Object.fromEntries(ids.map((id) => [id, id === "svc-1" ? 12 : 0])),
    }));
});

async function openFilters() {
  await userEvent.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

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
    // The axes by the tenant's Opsi Varian card names (17 September 2026).
    expect(within(row).getByText("Ukuran × Jenis Bulu")).toBeInTheDocument();
    expect(within(row).getByText("Rp 89 rb – Rp 249 rb")).toBeInTheDocument();
    // The range across the variants' own lengths.
    expect(within(row).getByText("45–105 mnt")).toBeInTheDocument();
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

    // Counted for the card's default period, this month.
    const month = periodRange("month");
    expect(bookingService.serviceCounts).toHaveBeenCalledWith(
      ["svc-1"],
      expect.objectContaining({
        scheduledFrom: month.from,
        scheduledTo: month.to,
      }),
    );

    expect(
      await screen.findByText("1 layanan · 1 aktif dari 1"),
    ).toBeInTheDocument();
  });

  it("asks for main services only — add-ons live on Master › Layanan (22 September 2026)", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([EXPRESS]));

    renderWithAuth(<GroomingServicesScreen />);
    await screen.findByRole("link", { name: "Express Wash" });

    // The table, and both "aktif dari" totals.
    const calls = jest.mocked(serviceService.list).mock.calls.map(([query]) => query);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.every((query) => query?.serviceType === "main")).toBe(true);
  });

  it("opens the new-service form as a main service from Layanan baru", async () => {
    renderWithAuth(<GroomingServicesScreen />);

    // One plain address from every module (22 September 2026); the module is
    // left in the tab as the link is clicked.
    const link = await screen.findByRole("link", { name: /Layanan baru/ });
    expect(link).toHaveAttribute("href", "/dashboard/pengaturan/layanan/new");

    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(JSON.parse(window.sessionStorage.getItem("buloo.serviceFormOrigin")!)).toEqual({
      serviceKind: "grooming",
      listPath: "/dashboard/layanan/grooming/katalog",
    });
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

  it("the card's Periode narrows the count, and the panel's Tanggal booking is the same value", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([EXPRESS]));

    renderWithAuth(<GroomingServicesScreen />);
    await screen.findByRole("link", { name: "Express Wash" });

    await userEvent.click(screen.getByRole("button", { name: "Hari ini" }));

    const today = periodRange("today");
    await waitFor(() =>
      expect(bookingService.serviceCounts).toHaveBeenLastCalledWith(
        ["svc-1"],
        expect.objectContaining({
          scheduledFrom: today.from,
          scheduledTo: today.to,
        }),
      ),
    );

    // The panel opens on the period the card holds — as the same pills, no dates.
    const panel = await openFilters();
    expect(
      within(panel).getByRole("button", { name: "Hari ini" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(panel).queryByLabelText("Tanggal booking dari"),
    ).not.toBeInTheDocument();

    // A pill picked there waits for Terapkan, then moves the card's pill too.
    await userEvent.click(within(panel).getByRole("button", { name: "Bulan ini" }));
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    const month = periodRange("month");
    await waitFor(() =>
      expect(bookingService.serviceCounts).toHaveBeenLastCalledWith(
        ["svc-1"],
        expect.objectContaining({ scheduledFrom: month.from }),
      ),
    );
    expect(screen.getByRole("button", { name: "Bulan ini" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The period is always set, so it never counts as a filter.
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      /^Filter$/,
    );
  });

  it("shows the panel's dates only behind Custom, and a range applied there lights Custom on the card", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([EXPRESS]));

    renderWithAuth(<GroomingServicesScreen />);
    await screen.findByRole("link", { name: "Express Wash" });

    const panel = await openFilters();
    await userEvent.click(within(panel).getByRole("button", { name: "Custom" }));

    // Seeded with the period in force, this month — and no preset chips.
    const month = periodRange("month");
    const from = within(panel).getByLabelText("Tanggal booking dari");
    expect(from).toHaveValue(month.from);
    expect(
      within(panel).queryByRole("button", { name: "7 hari" }),
    ).not.toBeInTheDocument();

    const earlier = new Date();
    earlier.setDate(earlier.getDate() - 40);
    fireEvent.change(from, { target: { value: isoDate(earlier) } });
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(bookingService.serviceCounts).toHaveBeenLastCalledWith(
        ["svc-1"],
        expect.objectContaining({
          scheduledFrom: isoDate(earlier),
          scheduledTo: month.to,
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Pilih rentang tanggal booking" }),
    ).toBeInTheDocument();
  });

  it("shows the card's dates only behind Custom, starting from the period in force", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([EXPRESS]));

    renderWithAuth(<GroomingServicesScreen />);
    await screen.findByRole("link", { name: "Express Wash" });

    expect(
      screen.queryByRole("button", { name: "Pilih rentang tanggal booking" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Custom" }));

    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Pilih rentang tanggal booking" }),
    ).toBeInTheDocument();

    // Seeded with this month's dates, so the count still asks the same question.
    const month = periodRange("month");
    await waitFor(() =>
      expect(bookingService.serviceCounts).toHaveBeenLastCalledWith(
        ["svc-1"],
        expect.objectContaining({
          scheduledFrom: month.from,
          scheduledTo: month.to,
        }),
      ),
    );

    // Just the two dates behind it — the pills on the card are the presets.
    await userEvent.click(
      screen.getByRole("button", { name: "Pilih rentang tanggal booking" }),
    );
    expect(
      screen.getByLabelText("Pilih rentang tanggal booking dari"),
    ).toHaveValue(month.from);
    expect(
      screen.queryByRole("button", { name: "7 hari" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    // Back to a pill, and the dates go away again.
    await userEvent.click(screen.getByRole("button", { name: "Hari ini" }));
    expect(
      screen.queryByRole("button", { name: "Pilih rentang tanggal booking" }),
    ).not.toBeInTheDocument();
  });

  it("the card's Cabang narrows the list and the count, and its Reset filter clears it", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([EXPRESS]));

    renderWithAuth(<GroomingServicesScreen />);
    await screen.findByRole("link", { name: "Express Wash" });

    await userEvent.click(screen.getByLabelText("Pilih cabang"));
    await userEvent.click(await screen.findByRole("option", { name: "Barat" }));

    await waitFor(() =>
      expect(serviceService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchId: "br-1" }),
      ),
    );
    await waitFor(() =>
      expect(bookingService.serviceCounts).toHaveBeenLastCalledWith(
        ["svc-1"],
        expect.objectContaining({ branchId: "br-1" }),
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Reset filter (1)" }),
    );

    await waitFor(() =>
      expect(jest.mocked(serviceService.list).mock.lastCall?.[0]).toEqual(
        expect.objectContaining({ branchId: undefined }),
      ),
    );
    expect(
      screen.queryByRole("button", { name: /Reset filter/ }),
    ).not.toBeInTheDocument();
  });

  it("narrows by cabang, jenis hewan and tempat on Terapkan, and Reset clears them", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([EXPRESS]));
    // A species the tenant added — the list is not a cat and a dog written in.
    primePetOptions(petOptionService.list, [
      ...PET_OPTION_FIXTURES,
      makePetOption({ type: "species", label: "Kelinci", sortOrder: 2 }),
    ]);

    renderWithAuth(<GroomingServicesScreen />);
    await screen.findByRole("link", { name: "Express Wash" });

    const panel = await openFilters();
    await userEvent.click(within(panel).getByLabelText("Cabang"));
    await userEvent.click(await screen.findByRole("option", { name: "Barat" }));
    await userEvent.click(within(panel).getByLabelText("Jenis hewan"));
    expect(screen.getByRole("option", { name: "Kelinci" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Kucing" }));
    await userEvent.click(within(panel).getByLabelText("Tempat"));
    await userEvent.click(screen.getByRole("option", { name: "Di rumah" }));

    // A draft: nothing is asked while the panel is being composed.
    expect(serviceService.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ petType: "opt-species-kucing" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(serviceService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          businessLineId: "bl-grooming",
          branchId: "br-1",
          petType: "opt-species-kucing",
          location: "in_home",
          page: 1,
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (3)",
    );
    expect(
      screen.getByRole("button", { name: "Reset filter (3)" }),
    ).toBeInTheDocument();

    await openFilters();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));

    // Reset applies in the same click, without waiting for Terapkan.
    await waitFor(() =>
      expect(jest.mocked(serviceService.list).mock.lastCall?.[0]).toEqual(
        expect.objectContaining({
          branchId: undefined,
          petType: undefined,
          location: undefined,
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      /^Filter$/,
    );
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
    const panel = await openFilters();
    await userEvent.click(within(panel).getByLabelText("Tampilkan terhapus"));
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    expect(await screen.findByText("Terhapus")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
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
