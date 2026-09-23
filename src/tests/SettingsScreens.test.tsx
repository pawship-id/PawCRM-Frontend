import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  FinanceSettingsScreen,
  GeneralSettingsScreen,
  InitialDataScreen,
  ServiceSettingsScreen,
  SystemSettingsScreen,
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
import { zoneService } from "@/services/zone.service";
import { variantOptionService } from "@/services/variantOption.service";
import { ApiError } from "@/services/api-error";
import { invalidateVariantOptions } from "@/hooks/useVariantOptions";
import { invalidateZones } from "@/hooks/useZones";
import { BUILT_IN_VARIANT_OPTIONS, makeVariantOption } from "./helpers/variantOptions";
import { stockEntryService } from "@/services/stockEntry.service";
import { supplierService } from "@/services/supplier.service";
import { tenantService } from "@/services/tenant.service";
import { warehouseService } from "@/services/warehouse.service";

import type { Branch, Service, Tenant, Warehouse, Zone } from "@/types/api";

import { PET_OPTION_FIXTURES, makePetOption } from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";
import { primeServiceSteps } from "./helpers/serviceSteps";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => "/dashboard/pengaturan/umum",
}));

jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/petOption.service");
jest.mock("@/services/serviceStep.service");
jest.mock("@/services/zone.service");
jest.mock("@/services/variantOption.service");
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

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    _id: "6a5f6c916bc053bb21280a5e",
    name: "Klinik Hewan Sehat",
    slug: "klinik-hewan-sehat",
    logoUrl: null,
    timezone: "Asia/Jakarta",
    currency: "IDR",
    legalName: "PT Anabul Sejahtera Bersama",
    taxId: "01.234.567.8-901.000",
    subscription: { status: "active", plan: "pro", trialEndsAt: null },
    settings: { hotelMode: "zone" },
    sv: 1,
    deletedAt: null,
    createdAt: "2024-03-10T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  } as Tenant;
}

function page<T>(items: T[]) {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

const BRANCHES = [
  {
    _id: "br-1",
    name: "Pusat",
    address: "Jl. Raya Darmo 121",
    city: "Surabaya",
    phone: "031-5551200",
    openTime: "09:00",
    closeTime: "20:00",
    operatingDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    isActive: true,
  },
  { _id: "br-2", name: "Pawship Barat", address: null, phone: null, isActive: false },
] as Branch[];

const WAREHOUSES = [
  { _id: "wh-1", name: "Gudang Utama", defaultBranchId: "br-1" },
  { _id: "wh-2", name: "Etalase Pusat", defaultBranchId: "br-1", hasPos: true },
  { _id: "wh-3", name: "Gudang Barat", defaultBranchId: "br-2" },
] as Warehouse[];

/**
 * Pengaturan › Umum is the tenant's profile since 22 September 2026 (mockup
 * `buloo-navigation-v3`). What is worth pinning: each section asks only for
 * what the role may read, a branch is listed with its own warehouses, and
 * there is no way to create a branch from here.
 */
describe("GeneralSettingsScreen", () => {
  beforeEach(() => {
    jest.spyOn(tenantService, "me").mockResolvedValue(makeTenant());
    jest.mocked(branchService.list).mockResolvedValue(page(BRANCHES));
    jest.mocked(warehouseService.list).mockResolvedValue(page(WAREHOUSES));
  });
  afterEach(() => jest.restoreAllMocks());

  it("draws the profile, the identity rows still to come, and the tabs", async () => {
    renderWithAuth(<GeneralSettingsScreen />);

    expect(
      await screen.findByRole("heading", { name: "Klinik Hewan Sehat" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Paket Pro")).toBeInTheDocument();
    expect(screen.getByText("Asia/Jakarta")).toBeInTheDocument();
    expect(screen.getByText("KH")).toBeInTheDocument();
    /* The name on the paper and the tax number, printed on every invoice. */
    expect(
      screen.getByText("PT Anabul Sejahtera Bersama"),
    ).toBeInTheDocument();
    expect(screen.getByText("01.234.567.8-901.000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ubah" })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/identitas",
    );
    expect(await screen.findByText("2 cabang · 3 gudang")).toBeInTheDocument();
    /*
      ONE TILL, AND NO "dari 5": the quota is a subscription figure and no plan
      carries one yet, so the chip counts what is on and claims no limit.
    */
    expect(screen.getByText("1 kasir aktif")).toBeInTheDocument();

    const tabs = screen.getByRole("navigation", { name: "Bagian pengaturan" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Umum", "Layanan", "Keuangan", "Pengguna & Sistem"]);

    /*
      Two identity fields the tenant still does not hold (format tanggal, tahun
      buku), and two cards: tipe pelanggan, which waits on a decision, and
      langganan, which waits on a plan. Nomor dokumen, Notifikasi and Tipe
      supplier stopped being "Segera" on 23 September 2026.
    */
    expect(screen.getAllByText("Segera")).toHaveLength(4);
  });

  it("lists each branch with its own warehouses, and offers no way to create one", async () => {
    renderWithAuth(<GeneralSettingsScreen />);

    expect(
      await screen.findByText(
        "2 gudang · Gudang Utama, Etalase Pusat (kasir)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("09:00 – 20:00 · Senin – Sabtu")).toBeInTheDocument();
    /* Unrecorded, not closed — the branch with no hours says so in words. */
    expect(screen.getByText("Jam buka belum diisi")).toBeInTheDocument();
    expect(
      screen.getByText(/Jl. Raya Darmo 121 · Surabaya · 031-5551200/),
    ).toBeInTheDocument();
    expect(screen.getByText("1 gudang · Gudang Barat")).toBeInTheDocument();
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();
    expect(screen.getByText("Alamat belum diisi")).toBeInTheDocument();

    const manage = screen.getAllByRole("link", { name: "Kelola" });
    expect(manage[0]).toHaveAttribute("href", "/dashboard/pengaturan/cabang/br-1");
    expect(
      screen.queryByRole("link", { name: /cabang baru/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/diaktifkan oleh tim Buloo/)).toBeInTheDocument();
  });

  it("links the two tenant switches that have a page", async () => {
    renderWithAuth(<GeneralSettingsScreen />);

    expect(
      screen.getByRole("link", { name: /Faktur & dokumen/ }),
    ).toHaveAttribute("href", "/dashboard/pengaturan/faktur-dokumen");
    expect(screen.getByRole("link", { name: /Stok & kasir/ })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/stok-kasir",
    );
    expect(screen.getByRole("link", { name: /Nomor dokumen/ })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/nomor-dokumen",
    );
    expect(screen.getByRole("link", { name: /Notifikasi/ })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/notifikasi",
    );
    /* Ungated, unlike its neighbours: it reads no tenant setting at all. */
    expect(screen.getByRole("link", { name: /Tipe supplier/ })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/tipe-supplier",
    );
    expect(
      screen.queryByRole("link", { name: /Langganan/ }),
    ).not.toBeInTheDocument();
    await screen.findByText("2 cabang · 3 gudang");
  });

  it("counts down a trial rather than hiding it", async () => {
    const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString();
    jest.spyOn(tenantService, "me").mockResolvedValue(
      makeTenant({
        subscription: { status: "trialing", plan: "free", trialEndsAt: inTenDays },
      }),
    );

    renderWithAuth(<GeneralSettingsScreen />);

    expect(await screen.findByText("Trial sisa 10 hari")).toBeInTheDocument();
  });

  it("asks for nothing a branches-only role may not read", async () => {
    renderWithAuth(<GeneralSettingsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "branches", actions: ["read"] }],
    });

    expect(await screen.findByText("Pusat")).toBeInTheDocument();
    expect(tenantService.me).not.toHaveBeenCalled();
    expect(warehouseService.list).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("link", { name: /Faktur & dokumen/ }),
    ).not.toBeInTheDocument();
    // No grant to edit a branch, no Kelola.
    expect(screen.queryByRole("link", { name: "Kelola" })).not.toBeInTheDocument();

    const tabs = screen.getByRole("navigation", { name: "Bagian pengaturan" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Umum", "Pengguna & Sistem"]);
  });

  it("shows the API message when the profile fails, and retries on demand", async () => {
    const me = jest
      .spyOn(tenantService, "me")
      .mockRejectedValueOnce(new ApiError("Profil tidak bisa dibaca", 500))
      .mockResolvedValueOnce(makeTenant());

    renderWithAuth(<GeneralSettingsScreen />);

    expect(await screen.findByText(/Profil tidak bisa dibaca/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    expect(
      await screen.findByRole("heading", { name: "Klinik Hewan Sehat" }),
    ).toBeInTheDocument();
    expect(me).toHaveBeenCalledTimes(2);
  });
});

/**
 * Keuangan and Pengguna & Sistem are nothing but cards, and each card gates
 * itself on the grant its destination enforces — a role sees exactly the pages
 * it may open, and Data Awal (ungated by design) always.
 */
describe("the card tabs", () => {
  it("lists the four finance settings for a full-reach role", () => {
    renderWithAuth(<FinanceSettingsScreen />);

    expect(screen.getByRole("link", { name: /Daftar akun/ })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/daftar-akun",
    );
    expect(
      screen.getByRole("link", { name: /Channel pembayaran/ }),
    ).toHaveAttribute("href", "/dashboard/pengaturan/channel-pembayaran");
    expect(screen.getByRole("link", { name: /Lini bisnis/ })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/lini-bisnis",
    );
    expect(screen.getByRole("link", { name: /Pajak/ })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/pajak",
    );
  });

  it("keeps only the cards a users-only role may open, and Data Awal", () => {
    renderWithAuth(<SystemSettingsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "users", actions: ["read"] }],
    });

    const cards = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") !== null)
      .map((link) => link.getAttribute("href"))
      .filter((href) => !href?.match(/\/pengaturan\/(umum|layanan|keuangan|sistem)$/));

    expect(cards).toEqual([
      "/dashboard/pengaturan/data-awal",
      "/dashboard/pengaturan/pengguna",
      "/dashboard/pengaturan/akses-cabang",
    ]);
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
      sessions: ["Mandi"],
    }),
    service({ _id: "kuku", name: "Potong Kuku", serviceType: "addon", isActive: false }),
  ];

  const LOKASI_CARD = makeVariantOption({
    _id: "vo-lokasi",
    name: "Lokasi",
    source: "staff",
    axisKey: "5a7f1f77bcf86cd7994391aa",
    sortOrder: 3,
    serviceCount: 2,
    values: [
      { code: "di-toko", label: "Di Toko", sortOrder: 0, isActive: true },
      { code: "di-rumah", label: "Di Rumah", sortOrder: 1, isActive: true },
    ],
  });

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
    jest.mocked(variantOptionService.list).mockResolvedValue({
      items: [
        ...BUILT_IN_VARIANT_OPTIONS.map((card) =>
          card.axisKey === "sizeCategory" ? { ...card, serviceCount: 6 } : card,
        ),
        LOKASI_CARD,
      ],
    });
    invalidateVariantOptions();
    invalidateZones();
    jest.mocked(zoneService.list).mockResolvedValue({
      items: [
        { _id: "z1", name: "Zona A", minKm: 0, maxKm: 3, deletedAt: null },
        { _id: "z2", name: "Zona B", minKm: 3, maxKm: 5, deletedAt: null },
        { _id: "z3", name: "Zona C", minKm: 5, maxKm: 9, deletedAt: "2026-09-10T00:00:00.000Z" },
      ] as Zone[],
      pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
    });
    jest.mocked(serviceService.list).mockResolvedValue({
      items: SERVICES,
      pagination: { page: 1, limit: 100, total: SERVICES.length, totalPages: 1 },
    });
  });

  it("opens on Opsi Varian, counts every section live from the rail, and mirrors the section to the URL", async () => {
    renderWithAuth(<ServiceSettingsScreen />);

    const ukuran = await screen.findByRole("listitem", { name: "Opsi Ukuran" });
    expect(rail("Opsi Varian")).toHaveAttribute("aria-selected", "true");
    // Four cards: the three pet cards and Lokasi.
    expect(rail("Opsi Varian")).toHaveTextContent("4");
    expect(rail("Ras")).toHaveTextContent("2");
    await waitFor(() => expect(rail("Tahapan")).toHaveTextContent("3"));
    await waitFor(() => expect(rail("Add-on")).toHaveTextContent("2"));
    // Live zones only — the deleted one is not counted.
    await waitFor(() => expect(rail("Zona")).toHaveTextContent("2"));

    await userEvent.click(rail("Ras"));
    expect(replace).toHaveBeenCalledWith("/dashboard/pengaturan/layanan?bagian=ras", {
      scroll: false,
    });
    expect(screen.getByText("Poodle")).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Opsi Ukuran" })).not.toBeInTheDocument();

    // One load feeds both sections.
    expect(petOptionService.list).toHaveBeenCalledTimes(1);
    expect(ukuran).toBeTruthy();
  });

  it("draws each Opsi Varian card as the mockup does — badge, service count, value chips", async () => {
    renderWithAuth(<ServiceSettingsScreen />);

    const ukuran = await screen.findByRole("listitem", { name: "Opsi Ukuran" });
    expect(within(ukuran).getByText("Otomatis")).toBeInTheDocument();
    expect(within(ukuran).getByText("6 layanan")).toBeInTheDocument();
    // The tenant's sizes, in order — the deleted Raksasa is not a chip.
    expect(within(ukuran).getByText("Kecil")).toBeInTheDocument();
    expect(within(ukuran).getByText("Besar")).toBeInTheDocument();
    expect(within(ukuran).queryByText("Raksasa")).not.toBeInTheDocument();
    // A built-in card cannot be deleted.
    expect(within(ukuran).queryByRole("button", { name: "Hapus opsi Ukuran" })).toBeNull();

    const lokasi = screen.getByRole("listitem", { name: "Opsi Lokasi" });
    expect(within(lokasi).getByText("Dipilih staf")).toBeInTheDocument();
    expect(within(lokasi).getByText("Di Toko")).toBeInTheDocument();
    expect(within(lokasi).getByRole("button", { name: "Hapus opsi Lokasi" })).toBeInTheDocument();
  });

  it("adds a value to a staff card, and shows the server's refusal when a value is still used", async () => {
    jest.mocked(variantOptionService.addValue).mockResolvedValue(LOKASI_CARD);
    jest.mocked(variantOptionService.removeValue).mockRejectedValue(
      new ApiError("Variant option value is still used by services", 409, {
        reason: "Di Toko masih dipakai 2 layanan — nonaktifkan saja",
      }),
    );
    renderWithAuth(<ServiceSettingsScreen />);

    const lokasi = await screen.findByRole("listitem", { name: "Opsi Lokasi" });
    await userEvent.click(within(lokasi).getByRole("button", { name: "Tambah nilai Lokasi" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Nilai/ }), "Di Kantor");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah nilai" }));
    await waitFor(() =>
      expect(variantOptionService.addValue).toHaveBeenCalledWith(LOKASI_CARD._id, "Di Kantor"),
    );

    const refreshed = await screen.findByRole("listitem", { name: "Opsi Lokasi" });
    await userEvent.click(
      within(refreshed).getByRole("button", { name: "Hapus Di Toko dari Lokasi" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));
    expect(await screen.findByText(/masih dipakai 2 layanan/)).toBeInTheDocument();
  });

  it("renames a card from its pencil, sending only what changed", async () => {
    jest.mocked(variantOptionService.update).mockResolvedValue(LOKASI_CARD);
    renderWithAuth(<ServiceSettingsScreen />);

    const ukuran = await screen.findByRole("listitem", { name: "Opsi Ukuran" });
    // A built-in card can be renamed, though never deleted.
    await userEvent.click(within(ukuran).getByRole("button", { name: "Ubah opsi Ukuran" }));
    const dialog = screen.getByRole("dialog");
    // It is used, and the dialog says a rename reaches those services.
    expect(within(dialog).getByText(/Dipakai 6 layanan/)).toBeInTheDocument();

    const name = within(dialog).getByRole("textbox", { name: /^Nama opsi/ });
    await userEvent.clear(name);
    await userEvent.type(name, "Size");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan opsi" }));

    await waitFor(() =>
      expect(variantOptionService.update).toHaveBeenCalledWith("vo-size", { name: "Size" }),
    );
  });

  it("retires a staff value from its chip instead of deleting it", async () => {
    jest.mocked(variantOptionService.updateValue).mockResolvedValue(LOKASI_CARD);
    renderWithAuth(<ServiceSettingsScreen />);

    const lokasi = await screen.findByRole("listitem", { name: "Opsi Lokasi" });
    await userEvent.click(within(lokasi).getByRole("button", { name: "Ubah Di Toko di Lokasi" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("switch", { name: /Masih ditawarkan/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan nilai" }));

    await waitFor(() =>
      expect(variantOptionService.updateValue).toHaveBeenCalledWith(LOKASI_CARD._id, "di-toko", {
        isActive: false,
      }),
    );
  });

  it("renames a size from its chip, on the pet options list the pet form reads", async () => {
    jest.mocked(petOptionService.update).mockResolvedValue(PET_OPTION_FIXTURES[0]);
    renderWithAuth(<ServiceSettingsScreen />);

    const ukuran = await screen.findByRole("listitem", { name: "Opsi Ukuran" });
    await userEvent.click(within(ukuran).getByRole("button", { name: "Ubah Kecil di Ukuran" }));
    const dialog = screen.getByRole("dialog");
    const label = within(dialog).getByRole("textbox", { name: /^Nilai/ });
    await userEvent.clear(label);
    await userEvent.type(label, "Mini");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan nilai" }));

    await waitFor(() =>
      expect(petOptionService.update).toHaveBeenCalledWith(
        expect.stringContaining("small"),
        { label: "Mini" },
      ),
    );
  });

  it("creates a Dipilih staf card with one value per line", async () => {
    jest.mocked(variantOptionService.create).mockResolvedValue(LOKASI_CARD);
    renderWithAuth(<ServiceSettingsScreen />);

    await screen.findByRole("listitem", { name: "Opsi Ukuran" });
    await userEvent.click(screen.getByRole("button", { name: "Tambah opsi" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Nama opsi/), "Tier Groomer");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Nilai/ }), "Junior{enter}Senior");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah opsi" }));

    await waitFor(() =>
      expect(variantOptionService.create).toHaveBeenCalledWith({
        name: "Tier Groomer",
        description: null,
        source: "staff",
        /* None ticked — offered for every kind of service. */
        serviceKinds: [],
        values: ["Junior", "Senior"],
      }),
    );
  });

  it("creates a card for the kinds of service ticked (22 September 2026)", async () => {
    jest.mocked(variantOptionService.create).mockResolvedValue(LOKASI_CARD);
    renderWithAuth(<ServiceSettingsScreen />);

    await screen.findByRole("listitem", { name: "Opsi Ukuran" });
    expect(screen.getAllByText("Semua layanan").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Tambah opsi" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Nama opsi/), "Arah");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Nilai/ }), "Jemput{enter}Antar");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Antar-Jemput" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah opsi" }));

    await waitFor(() =>
      expect(variantOptionService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Arah", serviceKinds: ["pickup-delivery"] }),
      ),
    );
  });

  it("lists add-ons only, with their price, tahapan and switches from the catalogue", async () => {
    renderWithAuth(<ServiceSettingsScreen initialSection="addon" />);

    const kutu = (await screen.findByRole("link", { name: "Obat Kutu" })).closest("tr")!;
    expect(within(kutu).getByText(/dipakai 2 layanan/)).toBeInTheDocument();
    expect(within(kutu).getByRole("link", { name: "Obat Kutu" })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/layanan/kutu",
    );
    expect(within(kutu).getByLabelText("Harga Obat Kutu")).toHaveValue("35.000");
    expect(within(kutu).getByLabelText("Durasi Obat Kutu dalam menit")).toHaveValue(15);
    // Its tahapan, by name — several may be ticked (22 September 2026).
    expect(
      within(kutu).getByRole("button", { name: "Tahapan Obat Kutu: Mandi" }),
    ).toBeInTheDocument();
    expect(within(kutu).getByRole("switch", { name: "Komisi Obat Kutu" })).toBeChecked();
    expect(
      within(kutu).getByRole("switch", { name: "Dijual terpisah Obat Kutu" }),
    ).not.toBeChecked();

    const kuku = screen.getByRole("link", { name: "Potong Kuku" }).closest("tr")!;
    expect(within(kuku).getByText(/dipakai 1 layanan · nonaktif/)).toBeInTheDocument();

    expect(screen.queryByText("Basic Grooming")).not.toBeInTheDocument();
    // The form's plain address; "an add-on" is left in the tab on the click.
    const add = screen.getByRole("link", { name: /Tambah add-on/ });
    expect(add).toHaveAttribute("href", "/dashboard/pengaturan/layanan/new");
    add.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(add);
    expect(window.sessionStorage.getItem("buloo.serviceFormOrigin")).toBe(
      JSON.stringify({ addon: true }),
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

  it("ticks several tahapan on a row and saves them as its sessions (22 September 2026)", async () => {
    jest.mocked(serviceService.update).mockResolvedValue(SERVICES[2]);
    renderWithAuth(<ServiceSettingsScreen initialSection="addon" />);

    const kutu = (await screen.findByRole("link", { name: "Obat Kutu" })).closest("tr")!;
    await userEvent.click(
      within(kutu).getByRole("button", { name: "Tahapan Obat Kutu: Mandi" }),
    );
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Blow dry" }));
    await userEvent.keyboard("{Escape}");

    expect(
      within(kutu).getByRole("button", { name: "Tahapan Obat Kutu: Mandi, Blow dry" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Simpan add-on" }));

    await waitFor(() =>
      expect(serviceService.update).toHaveBeenCalledWith("kutu", {
        sessions: ["Mandi", "Blow dry"],
      }),
    );
  });

  it("edits Dipakai di layanan from the row and sends only that (22 September 2026)", async () => {
    jest.mocked(serviceService.update).mockResolvedValue(SERVICES[2]);
    renderWithAuth(<ServiceSettingsScreen initialSection="addon" />);

    const kutu = (await screen.findByRole("link", { name: "Obat Kutu" })).closest("tr")!;
    const trigger = within(kutu).getByRole("button", {
      name: "Dipakai di layanan Obat Kutu: Semua layanan",
    });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Grooming" }));
    await userEvent.keyboard("{Escape}");

    expect(
      within(kutu).getByRole("button", { name: "Dipakai di layanan Obat Kutu: Grooming" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Simpan add-on" }));

    await waitFor(() =>
      expect(serviceService.update).toHaveBeenCalledWith("kutu", { serviceKinds: ["grooming"] }),
    );
    expect(serviceService.update).toHaveBeenCalledTimes(1);
  });

  it("blocks Simpan and says which box is wrong", async () => {
    renderWithAuth(<ServiceSettingsScreen initialSection="addon" />);

    const kutu = (await screen.findByRole("link", { name: "Obat Kutu" })).closest("tr")!;
    await userEvent.clear(within(kutu).getByLabelText("Durasi Obat Kutu dalam menit"));

    expect(screen.getByText(/Durasi Obat Kutu diisi menit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan add-on" })).toBeDisabled();
  });

  it("shows Tahapan as one list, without asking for business lines (22 September 2026)", async () => {
    renderWithAuth(<ServiceSettingsScreen initialSection="tahapan" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read"] }],
    });

    await waitFor(() => expect(serviceStepService.list).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: "Kelompok layanan" })).not.toBeInTheDocument();
    expect(businessLineService.list).not.toHaveBeenCalled();
    // Nothing to press without the grants.
    expect(screen.queryByRole("button", { name: /Tambah/ })).toBeNull();
  });

});
