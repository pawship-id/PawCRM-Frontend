import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  GeneralSettingsScreen,
  InitialDataScreen,
  ServiceSettingsScreen,
} from "@/features/settings";
import { branchService } from "@/services/branch.service";
import {
  businessLineService,
  type BusinessLine,
} from "@/services/businessLine.service";
import { customerService } from "@/services/customer.service";
import { petOptionService } from "@/services/petOption.service";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";
import { serviceStepService } from "@/services/serviceStep.service";
import { stockEntryService } from "@/services/stockEntry.service";
import { supplierService } from "@/services/supplier.service";
import { warehouseService } from "@/services/warehouse.service";

import type { Service } from "@/types/api";

import { PET_OPTION_FIXTURES, makePetOption } from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";
import { primeServiceSteps } from "./helpers/serviceSteps";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
}));

jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/petOption.service");
jest.mock("@/services/serviceStep.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/product.service");
jest.mock("@/services/service.service");
jest.mock("@/services/stockEntry.service");
jest.mock("@/services/supplier.service");
jest.mock("@/services/warehouse.service");

/**
 * The three Pengaturan screens the mockup asks for.
 *
 * WHAT THESE TESTS ARE FOR. Both screens are mostly copy, and copy does not earn
 * a suite — but three things here are logic, and each one fails silently:
 *
 *  1. a count that has not arrived must not read as "belum ada", which is a
 *     different and alarming answer;
 *  2. a step is "selesai" only above zero, and the wording carries the figure
 *     rather than claiming a completeness nobody recorded;
 *  3. a role without a grant issues NO request for the number it would not be
 *     shown — the screens are ungated, so this is what keeps them from painting
 *     403s across a settings page.
 */
function totalling(total: number) {
  return { items: [], pagination: { page: 1, limit: 1, total, totalPages: 1 } };
}

function everythingCounts() {
  jest.mocked(branchService.list).mockResolvedValue(totalling(4));
  jest.mocked(warehouseService.list).mockResolvedValue(totalling(6));
  jest.mocked(productService.list).mockResolvedValue(totalling(248));
  jest.mocked(customerService.list).mockResolvedValue(totalling(412));
  jest.mocked(supplierService.list).mockResolvedValue(totalling(9));
  jest.mocked(stockEntryService.list).mockResolvedValue(totalling(2));
}

beforeEach(() => {
  everythingCounts();
});

describe("GeneralSettingsScreen", () => {
  it("links the three settings that exist and badges the four that do not", async () => {
    renderWithAuth(<GeneralSettingsScreen />);

    expect(screen.getByRole("link", { name: /Profil tenant/ })).toHaveAttribute(
      "href",
      "/dashboard/business",
    );
    expect(screen.getByRole("link", { name: /Cabang/ })).toHaveAttribute(
      "href",
      "/dashboard/master/branches",
    );
    expect(screen.getByRole("link", { name: /Gudang/ })).toHaveAttribute(
      "href",
      "/dashboard/master/warehouses",
    );

    // Drawn, so the shape of the module is visible — but they go nowhere.
    expect(screen.getAllByText("Segera")).toHaveLength(4);
    expect(
      screen.queryByRole("link", { name: /Notifikasi/ }),
    ).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("4 cabang")).toBeInTheDocument(),
    );
    expect(screen.getByText("6 gudang")).toBeInTheDocument();
  });

  it("costs two queries, not six", async () => {
    renderWithAuth(<GeneralSettingsScreen />);

    await waitFor(() =>
      expect(screen.getByText("4 cabang")).toBeInTheDocument(),
    );
    // The hook serves both screens; this one renders two figures and must ask
    // for exactly those.
    expect(productService.list).not.toHaveBeenCalled();
    expect(customerService.list).not.toHaveBeenCalled();
    expect(stockEntryService.list).not.toHaveBeenCalled();
  });

  it("drops a card, and its query, for a role without the grant", async () => {
    renderWithAuth(<GeneralSettingsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "branches", actions: ["read"] }],
    });

    await waitFor(() =>
      expect(screen.getByText("4 cabang")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: /Profil tenant/ }),
    ).not.toBeInTheDocument();
    expect(warehouseService.list).not.toHaveBeenCalled();
  });
});

describe("InitialDataScreen", () => {
  it("reports what was counted rather than claiming completeness", async () => {
    renderWithAuth(<InitialDataScreen />);

    await waitFor(() =>
      expect(screen.getByText("selesai · 248 produk")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("selesai · 4 cabang · 6 gudang"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("selesai · 412 pelanggan · 9 supplier"),
    ).toBeInTheDocument();
    expect(screen.getByText("selesai · 2 dokumen")).toBeInTheDocument();
  });

  it("says 'belum ada' only at zero, never while the answer is in flight", async () => {
    jest.mocked(productService.list).mockResolvedValue(totalling(0));
    renderWithAuth(<InitialDataScreen />);

    // Before anything resolves the step reads as pending, not as empty.
    expect(screen.queryByText("belum ada")).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("belum ada")).toBeInTheDocument(),
    );
  });

  it("locks the three steps whose screens do not exist", async () => {
    renderWithAuth(<InitialDataScreen />);

    expect(screen.getAllByText("Segera")).toHaveLength(3);
    expect(screen.getByText("menunggu langkah di atas")).toBeInTheDocument();
    // No way in, because there is nowhere to go.
    expect(
      screen.queryByRole("link", { name: /Saldo awal/ }),
    ).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("selesai · 248 produk")).toBeInTheDocument(),
    );
  });

  it("asks for nothing a role may not read, and says so on the step", async () => {
    renderWithAuth(<InitialDataScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "branches", actions: ["read"] }],
    });

    // Branches only: the gudang half of the first step drops out rather than
    // asking an endpoint this role would be refused by.
    await waitFor(() =>
      expect(screen.getByText("selesai · 4 cabang")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("tidak bisa dilihat")).toHaveLength(3);
    expect(warehouseService.list).not.toHaveBeenCalled();
    expect(productService.list).not.toHaveBeenCalled();
    expect(customerService.list).not.toHaveBeenCalled();
  });
});

describe("ServiceSettingsScreen", () => {
  const LINES: BusinessLine[] = [
    { _id: "bl-grooming", name: "Grooming", color: "#1A2B3C" },
  ];

  function service(overrides: Partial<Service> & Pick<Service, "_id" | "name">) {
    return {
      code: overrides._id.toUpperCase(),
      price: "35000.0000",
      durationMin: 15,
      hasVariants: false,
      variants: [],
      serviceType: "main",
      addonServiceIds: [],
      businessLineId: "bl-grooming",
      addonStepId: null,
      commissionable: true,
      soldSeparately: false,
      isActive: true,
      deletedAt: null,
      ...overrides,
    } as Service;
  }

  const SERVICES: Service[] = [
    service({ _id: "basic", name: "Basic Grooming", addonServiceIds: ["kutu"] }),
    service({ _id: "spa", name: "Spa", addonServiceIds: ["kutu", "kuku"] }),
    service({
      _id: "kutu",
      name: "Obat Kutu",
      serviceType: "addon",
      addonStepId: "step-mandi",
    }),
    service({ _id: "kuku", name: "Potong Kuku", serviceType: "addon", isActive: false }),
  ];

  function rail(name: string) {
    return within(
      screen.getByRole("tablist", { name: "Bagian pengaturan layanan" }),
    ).getByRole("tab", { name: new RegExp(`^${name}`) });
  }

  beforeEach(() => {
    replace.mockClear();
    jest.mocked(petOptionService.list).mockResolvedValue({
      items: [
        ...PET_OPTION_FIXTURES,
        makePetOption({
          type: "size",
          code: "giant",
          label: "Raksasa",
          deletedAt: "2026-09-10T00:00:00.000Z",
        }),
      ],
      pagination: { page: 1, limit: 100, total: 10, totalPages: 1 },
    });
    primeServiceSteps(serviceStepService.list);
    jest.mocked(businessLineService.list).mockResolvedValue({
      items: LINES,
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    jest.mocked(serviceService.list).mockResolvedValue({
      items: SERVICES,
      pagination: { page: 1, limit: 100, total: SERVICES.length, totalPages: 1 },
    });
  });

  it("opens on Opsi Varian, counts every section live from the rail, and mirrors the section to the URL", async () => {
    renderWithAuth(<ServiceSettingsScreen />);

    await screen.findByText("Kucing");
    expect(rail("Opsi Varian")).toHaveAttribute("aria-selected", "true");
    // Species 2 + sizes 3 (the deleted Raksasa is not counted) + coats 2.
    expect(rail("Opsi Varian")).toHaveTextContent("7");
    expect(rail("Ras")).toHaveTextContent("2");
    await waitFor(() => expect(rail("Tahapan")).toHaveTextContent("3"));
    await waitFor(() => expect(rail("Add-on")).toHaveTextContent("2"));
    expect(rail("Zona")).toHaveTextContent("Segera");

    // Breeds are not a price axis, so Opsi Varian has no Ras pill.
    const pills = screen.getByRole("group", { name: "Jenis data hewan" });
    expect(within(pills).queryByRole("button", { name: /^Ras/ })).toBeNull();

    await userEvent.click(rail("Ras"));
    expect(replace).toHaveBeenCalledWith("/dashboard/master/layanan?bagian=ras", {
      scroll: false,
    });
    expect(screen.getByText("Poodle")).toBeInTheDocument();
    expect(screen.queryByText("Kucing")).not.toBeInTheDocument();
    // One type, nothing to choose between.
    expect(screen.queryByRole("group", { name: "Jenis data hewan" })).toBeNull();

    // One load feeds both sections.
    expect(petOptionService.list).toHaveBeenCalledTimes(1);
  });

  it("lists add-ons only, with their price, tahapan and switches from the catalogue", async () => {
    renderWithAuth(<ServiceSettingsScreen initialSection="addon" />);

    const kutu = (await screen.findByRole("link", { name: "Obat Kutu" })).closest("tr")!;
    expect(within(kutu).getByText(/dipakai 2 layanan/)).toBeInTheDocument();
    expect(within(kutu).getByRole("link", { name: "Obat Kutu" })).toHaveAttribute(
      "href",
      "/dashboard/master/layanan/kutu",
    );
    expect(within(kutu).getByLabelText("Harga Obat Kutu")).toHaveValue("35.000");
    expect(within(kutu).getByLabelText("Durasi Obat Kutu dalam menit")).toHaveValue(15);
    // The tahapan is stored by id and shown by the line's own name.
    await waitFor(() =>
      expect(within(kutu).getByRole("combobox", { name: "Tahapan Obat Kutu" })).toHaveTextContent(
        "Mandi",
      ),
    );
    expect(within(kutu).getByRole("switch", { name: "Komisi Obat Kutu" })).toBeChecked();
    expect(
      within(kutu).getByRole("switch", { name: "Dijual terpisah Obat Kutu" }),
    ).not.toBeChecked();

    const kuku = screen.getByRole("link", { name: "Potong Kuku" }).closest("tr")!;
    expect(within(kuku).getByText(/dipakai 1 layanan · nonaktif/)).toBeInTheDocument();

    expect(screen.queryByText("Basic Grooming")).not.toBeInTheDocument();
    // Opens the service form with Jenis layanan already on Add-on.
    expect(screen.getByRole("link", { name: /Tambah add-on/ })).toHaveAttribute(
      "href",
      "/dashboard/master/layanan/new?jenis=addon",
    );
  });

  it("saves only what changed on each row, and nothing before Simpan", async () => {
    jest.mocked(serviceService.update).mockResolvedValue(SERVICES[2]);
    renderWithAuth(<ServiceSettingsScreen initialSection="addon" />);

    const kutu = (await screen.findByRole("link", { name: "Obat Kutu" })).closest("tr")!;
    const price = within(kutu).getByLabelText("Harga Obat Kutu");
    await userEvent.clear(price);
    await userEvent.type(price, "40.000");
    await userEvent.click(within(kutu).getByRole("switch", { name: "Komisi Obat Kutu" }));

    const kuku = screen.getByRole("link", { name: "Potong Kuku" }).closest("tr")!;
    await userEvent.click(
      within(kuku).getByRole("switch", { name: "Dijual terpisah Potong Kuku" }),
    );

    expect(serviceService.update).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Simpan add-on" }));

    await waitFor(() => expect(serviceService.update).toHaveBeenCalledTimes(2));
    expect(serviceService.update).toHaveBeenCalledWith("kutu", {
      price: "40000",
      commissionable: false,
    });
    expect(serviceService.update).toHaveBeenCalledWith("kuku", {
      soldSeparately: true,
    });
  });

  it("blocks Simpan and says which box is wrong", async () => {
    renderWithAuth(<ServiceSettingsScreen initialSection="addon" />);

    const kutu = (await screen.findByRole("link", { name: "Obat Kutu" })).closest("tr")!;
    await userEvent.clear(within(kutu).getByLabelText("Durasi Obat Kutu dalam menit"));

    expect(screen.getByText(/Durasi Obat Kutu diisi menit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan add-on" })).toBeDisabled();
  });

  it("sends no request for lines, and says why, for a role without businessLines:read", async () => {
    renderWithAuth(<ServiceSettingsScreen initialSection="tahapan" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read"] }],
    });

    expect(
      await screen.findByText(/belum bisa melihat daftar lini bisnis/),
    ).toBeInTheDocument();
    expect(businessLineService.list).not.toHaveBeenCalled();
    // No figure it could not have known.
    expect(rail("Tahapan")).toHaveTextContent(/^Tahapan$/);
    // Nothing to press without the grants.
    expect(screen.queryByRole("button", { name: /Tambah/ })).toBeNull();
  });
});
