import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingServicesScreen } from "@/features/grooming";
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

jest.mock("@/services/businessLine.service");
jest.mock("@/services/service.service");

/**
 * Grooming › Layanan & Harga.
 *
 * WHAT IS PINNED HERE: Hapus, Pulihkan and "Tampilkan terhapus", which moved in
 * from the catalogue-wide list when it was removed on 13 September 2026. That
 * list was the only place a service could be deleted or restored, so if these
 * break there is no other screen to do it from.
 */
const GROOMING: BusinessLine = {
  _id: "bl-grooming",
  name: "Grooming",
  color: "#1A2B4C",
};

function service(overrides: Partial<Service> = {}): Service {
  return {
    _id: "svc-1",
    name: "Mandi Full",
    code: "GRM-01",
    price: "150000.0000",
    hasVariants: false,
    variants: [],
    variantAxes: [],
    durationMin: 60,
    isActive: true,
    deletedAt: null,
    serviceType: "main",
    serviceLocations: ["in_store"],
    sessions: [],
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

const DELETED = service({
  _id: "svc-2",
  name: "Mandi Kutu",
  code: "GRM-02",
  deletedAt: "2026-09-01T00:00:00.000Z",
});

beforeEach(() => {
  jest.mocked(businessLineService.list).mockResolvedValue(page([GROOMING]));
});

describe("GroomingServicesScreen", () => {
  it("deletes a service from its row and re-reads the list", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([service()]));
    jest
      .mocked(serviceService.remove)
      .mockResolvedValue(service({ deletedAt: "2026-09-13T00:00:00.000Z" }));

    renderWithAuth(<GroomingServicesScreen />);

    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));
    const before = jest.mocked(serviceService.list).mock.calls.length;

    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Hapus" }),
    );

    await waitFor(() =>
      expect(serviceService.remove).toHaveBeenCalledWith("svc-1"),
    );
    await waitFor(() =>
      expect(jest.mocked(serviceService.list).mock.calls.length).toBeGreaterThan(
        before,
      ),
    );
  });

  it("shows deleted services on request, with Pulihkan and no way into the form", async () => {
    jest
      .mocked(serviceService.list)
      .mockImplementation(async (query) =>
        page(query?.includeDeleted ? [service(), DELETED] : [service()]),
      );
    jest.mocked(serviceService.restore).mockResolvedValue(service({ _id: "svc-2" }));

    renderWithAuth(<GroomingServicesScreen />);

    await screen.findByText("Mandi Full");
    expect(screen.queryByText("Mandi Kutu")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Tampilkan terhapus"));

    expect(await screen.findByText("Terhapus")).toBeInTheDocument();
    expect(serviceService.list).toHaveBeenCalledWith(
      expect.objectContaining({ includeDeleted: true }),
    );
    // A deleted row opens nothing; a live one still opens its form.
    expect(
      screen.queryByRole("link", { name: "Mandi Kutu" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mandi Full" })).toHaveAttribute(
      "href",
      "/dashboard/master/layanan/svc-1",
    );

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

  it("offers no Hapus to a role that may only read", async () => {
    jest.mocked(serviceService.list).mockResolvedValue(page([service()]));

    renderWithAuth(<GroomingServicesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read"] }],
    });

    await screen.findByText("Mandi Full");
    expect(
      screen.queryByRole("button", { name: "Hapus" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Aksi")).not.toBeInTheDocument();
  });
});
