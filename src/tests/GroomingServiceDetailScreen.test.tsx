import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingServiceDetailScreen } from "@/features/grooming";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { petOptionService } from "@/services/petOption.service";
import { serviceService } from "@/services/service.service";
import type { Branch, PageResult, Service } from "@/types/api";

import {
  makePetOption,
  PET_OPTION_FIXTURES,
  primePetOptions,
} from "./helpers/petOptions";
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
// The variant grid's rows are the tenant's species, sizes and coats.
jest.mock("@/services/petOption.service");

/**
 * Grooming › Layanan & Harga › one service — the mockup's detail page: mostly
 * read-only with an Ubah into the form, and a Varian & Harga tab edited in place.
 *
 * WHAT IS PINNED HERE: what the page says is taken from the record (and a gap in
 * the variant grid is said, not hidden); what the page does itself — Nonaktifkan,
 * Hapus, Duplikat, and saving the variant grid — reaches the API with the right
 * body; and a role that may only read is offered nothing to press and asked no
 * question it would be refused.
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
  // A variant service has no length of its own — each variant carries one.
  durationMin: null,
  billingUnit: "per_pet",
  description: "Mandi cepat untuk anabul yang rutin.",
  hasVariants: true,
  variantAxes: ["sizeCategory"],
  // "large" is deliberately unpriced.
  variants: [
    {
      petType: null,
      sizeCategory: "small",
      furType: null,
      price: "89000.0000",
      durationMin: 45,
      isActive: true,
    },
    {
      petType: null,
      sizeCategory: "medium",
      furType: null,
      price: "129000.0000",
      durationMin: 60,
      isActive: true,
    },
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
  primePetOptions(petOptionService.list);
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
    expect(
      screen.getByText("sampai Rp 129 rb · 2 varian aktif"),
    ).toBeInTheDocument();
    // Each variant's own length, shortest to longest.
    expect(screen.getByText("45–60")).toBeInTheDocument();
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

  /*
    ─── VARIAN & HARGA, EDITED IN PLACE (14 September 2026) ───────────────────
  */
  const openVariants = async () =>
    userEvent.click(await screen.findByRole("tab", { name: "Varian & Harga" }));

  it("edits the variant grid in place and saves it whole with one button", async () => {
    jest
      .mocked(serviceService.update)
      .mockResolvedValue({ ...SERVICE, updatedAt: "2026-09-14T00:00:00.000Z" });

    renderDetail();
    await openVariants();

    // Every combination is a row — the unpriced one comes up blank.
    expect(screen.getByLabelText("Harga Kecil")).toHaveValue("89.000");
    expect(screen.getByLabelText("Harga Besar")).toHaveValue("");
    // Nothing changed yet, so nothing to save.
    expect(
      screen.queryByRole("button", { name: "Simpan varian & harga" }),
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Harga Besar"), "150000");

    // A draft that is not complete says why and cannot be saved.
    expect(screen.getByText(/1 varian belum punya durasi/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simpan varian & harga" }),
    ).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Durasi Besar (menit)"), "90");
    await userEvent.click(screen.getByLabelText("Sedang aktif"));
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan varian & harga" }),
    );

    await waitFor(() => expect(serviceService.update).toHaveBeenCalled());
    const [id, patch] = jest.mocked(serviceService.update).mock.calls[0];
    expect(id).toBe("svc-1");
    expect(patch).toEqual({
      serviceLocations: ["in_store"],
      hasVariants: true,
      variantAxes: ["sizeCategory"],
      variants: [
        { petType: null, sizeCategory: "small", furType: null, price: "89000", durationMin: 45, isActive: true },
        { petType: null, sizeCategory: "medium", furType: null, price: "129000", durationMin: 60, isActive: false },
        { petType: null, sizeCategory: "large", furType: null, price: "150000", durationMin: 90, isActive: true },
      ],
    });
  });

  it("changes every selected variant at once from the bulk bar", async () => {
    renderDetail();
    await openVariants();

    await userEvent.click(screen.getByLabelText("Pilih Kecil"));
    await userEvent.click(screen.getByLabelText("Pilih Sedang"));
    expect(screen.getByText("2 dipilih")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ %" }));
    await userEvent.type(
      screen.getByLabelText("Naik berapa persen (boleh minus)"),
      "10",
    );
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    // Rounded to the nearest thousand, as a shop prices.
    expect(screen.getByLabelText("Harga Kecil")).toHaveValue("98.000");
    expect(screen.getByLabelText("Harga Sedang")).toHaveValue("142.000");
    expect(screen.queryByText("2 dipilih")).not.toBeInTheDocument();
  });

  it("splits rows when an option is ticked, each starting from the row it came from", async () => {
    renderDetail();
    await openVariants();

    await userEvent.click(screen.getByLabelText(/Jenis bulu/));

    expect(screen.getByLabelText("Harga Kecil · Bulu panjang")).toHaveValue(
      "89.000",
    );
    expect(screen.getByLabelText("Harga Kecil · Bulu pendek")).toHaveValue(
      "89.000",
    );
    expect(
      screen.getByLabelText("Durasi Sedang · Bulu pendek (menit)"),
    ).toHaveValue(60);

    // Batal throws the draft away.
    await userEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.getByLabelText("Harga Kecil")).toHaveValue("89.000");
  });

  it("lets a role that may only read see the grid but change nothing", async () => {
    renderDetail({
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read"] }],
    });
    await openVariants();

    expect(screen.getByLabelText("Harga Kecil")).toBeDisabled();
    expect(screen.getByLabelText("Kecil aktif")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Isi bertingkat/ }),
    ).not.toBeInTheDocument();
  });

  /*
    ─── THE TENANT'S SIZES (14 September 2026) ──────────────────────────────
  */
  const XL = makePetOption({
    type: "size",
    code: "xl",
    label: "Ekstra besar",
    sortOrder: 3,
  });

  it("keeps a priced size whose option was retired, and gives a size the tenant added its own row", async () => {
    primePetOptions(petOptionService.list, [
      XL,
      ...PET_OPTION_FIXTURES.map((option) =>
        option.type === "size" && option.code === "medium"
          ? { ...option, isActive: false }
          : option,
      ),
    ]);

    renderDetail();
    await openVariants();

    expect(
      (await screen.findAllByRole("textbox", { name: /^Harga / })).map(
        (input) => input.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Harga Kecil",
      "Harga Sedang (nonaktif)",
      "Harga Besar",
      "Harga Ekstra besar",
    ]);
    expect(screen.getByLabelText("Harga Sedang (nonaktif)")).toHaveValue(
      "129.000",
    );
    // The Ukuran chip counts what this service can be priced by.
    expect(screen.getByText("×4")).toBeInTheDocument();
  });

  it("refuses to save more variants than a service may have, and says so", async () => {
    primePetOptions(petOptionService.list, [
      ...PET_OPTION_FIXTURES,
      makePetOption({ type: "species", code: "rabbit", label: "Kelinci", sortOrder: 2 }),
      XL,
    ]);

    renderDetail();
    await openVariants();

    await userEvent.click(await screen.findByLabelText(/Jenis bulu/));
    await userEvent.click(screen.getByLabelText(/Jenis hewan/));

    // 4 sizes × 2 coats × 3 species.
    expect(
      screen.getByText(/Kombinasinya jadi 24 varian — maksimal 20 per layanan/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("kombinasinya jadi 24 varian, maksimal 20 per layanan"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simpan varian & harga" }),
    ).toBeDisabled();
  });

  /*
    ─── TAHAPAN & BOBOT KOMISI, EDITED IN PLACE (14 September 2026) ────────────
  */
  const openSteps = async () =>
    userEvent.click(await screen.findByRole("tab", { name: "Tahapan & Add-on" }));

  const stepOrder = () =>
    screen
      .getAllByLabelText(/^Bobot .+ \(%\)$/)
      .map((input) => input.getAttribute("aria-label"));

  it("lists the tahapan with their weights and the add-ons by name", async () => {
    renderDetail();
    await openSteps();

    expect(screen.getByLabelText("Bobot Mandi (%)")).toHaveValue("70");
    expect(screen.getByLabelText("Bobot Blow dry (%)")).toHaveValue("30");
    expect(screen.getByText("Total 100%")).toBeInTheDocument();
    expect(await screen.findByText("Spa Aromaterapi")).toBeInTheDocument();
    expect(serviceService.list).toHaveBeenCalledWith(
      expect.objectContaining({ serviceType: "addon", includeDeleted: true }),
    );
  });

  it("edits weights and order in place and saves them with one button", async () => {
    jest.mocked(serviceService.update).mockResolvedValue({
      ...SERVICE,
      sessions: ["Blow dry", "Mandi"],
      sessionWeights: [50, 50],
    });

    renderDetail();
    await openSteps();

    const mandi = screen.getByLabelText("Bobot Mandi (%)");
    await userEvent.clear(mandi);
    await userEvent.type(mandi, "60");

    // The badge follows what is typed, and a total that is not 100 cannot save.
    expect(screen.getByText("Total 90%")).toBeInTheDocument();
    expect(screen.getByText("Total bobotnya 90%, harus pas 100%.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan tahapan & add-on" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Bagi rata" }));
    expect(screen.getByLabelText("Bobot Mandi (%)")).toHaveValue("50");

    // The handle answers the arrow keys, and the weight moves with its tahapan.
    screen.getByRole("button", { name: "Pindahkan Blow dry" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(stepOrder()).toEqual(["Bobot Blow dry (%)", "Bobot Mandi (%)"]);

    await userEvent.click(screen.getByRole("button", { name: "Simpan tahapan & add-on" }));

    await waitFor(() =>
      expect(serviceService.update).toHaveBeenCalledWith("svc-1", {
        sessions: ["Blow dry", "Mandi"],
        sessionWeights: [50, 50],
      }),
    );
    expect(
      await screen.findByRole("tab", { name: "Tahapan & Add-on" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Simpan tahapan & add-on" }),
    ).not.toBeInTheDocument();
  });

  it("adds a tahapan other grooming services use, or a new one typed, and removes one", async () => {
    jest.mocked(serviceService.list).mockImplementation(async (query) =>
      page(
        query?.serviceType === "addon"
          ? [ADDON]
          : [
              SERVICE,
              { ...SERVICE, _id: "svc-2", sessions: ["mandi", "Gunting"] },
            ],
      ),
    );

    renderDetail();
    await openSteps();

    await userEvent.click(screen.getByRole("button", { name: /Tambah tahapan/ }));
    // "mandi" is already on this service, whatever its case.
    await userEvent.click(await screen.findByRole("button", { name: "Gunting" }));
    expect(screen.queryByRole("button", { name: "mandi" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Bobot Gunting (%)")).toHaveValue("");
    expect(
      screen.getByText(
        "Isi bobot semua tahapan, atau kosongkan semuanya supaya dibagi rata.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Tambah tahapan/ }));
    await userEvent.type(
      screen.getByLabelText("Cari atau ketik tahapan baru"),
      "Potong kuku{Enter}",
    );
    expect(screen.getByLabelText("Bobot Potong kuku (%)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hapus tahapan Mandi" }));
    expect(stepOrder()).toEqual([
      "Bobot Blow dry (%)",
      "Bobot Gunting (%)",
      "Bobot Potong kuku (%)",
    ]);

    // Batal throws the draft away.
    await userEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(stepOrder()).toEqual(["Bobot Mandi (%)", "Bobot Blow dry (%)"]);
  });

  it("lets a role that may only read see the tahapan but change nothing", async () => {
    renderDetail({
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read"] }],
    });
    await openSteps();

    expect(screen.getByLabelText("Bobot Mandi (%)")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Tambah tahapan/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hapus tahapan Mandi" }),
    ).not.toBeInTheDocument();
    // Suggestions are for somebody who may add one.
    expect(serviceService.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ businessLineId: "bl-grooming" }),
    );
  });

  it("ticks and unticks add-ons in place, sending only the add-on list", async () => {
    const NAILS = {
      ...ADDON,
      _id: "add-2",
      name: "Potong Kuku",
      code: "ADD-02",
      price: "25000.0000",
      durationMin: 15,
    } as Service;
    const RETIRED = {
      ...ADDON,
      _id: "add-3",
      name: "Masker Lama",
      code: "ADD-03",
      isActive: false,
    } as Service;
    jest
      .mocked(serviceService.list)
      .mockResolvedValue(page([ADDON, NAILS, RETIRED]));
    jest
      .mocked(serviceService.update)
      .mockResolvedValue({ ...SERVICE, addonServiceIds: ["add-2"] });

    renderDetail();
    await openSteps();

    const spa = await screen.findByRole("checkbox", {
      name: "Pasang add-on Spa Aromaterapi",
    });
    expect(spa).toBeChecked();
    const nails = screen.getByRole("checkbox", { name: "Pasang add-on Potong Kuku" });
    expect(nails).not.toBeChecked();
    expect(screen.getByText("ADD-02")).toBeInTheDocument();
    // Switched off and not listed by this service: not offered.
    expect(
      screen.queryByRole("checkbox", { name: "Pasang add-on Masker Lama" }),
    ).not.toBeInTheDocument();

    await userEvent.click(nails);
    await userEvent.click(spa);
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan tahapan & add-on" }),
    );

    // The tahapan did not change, so they are not sent.
    await waitFor(() =>
      expect(serviceService.update).toHaveBeenCalledWith("svc-1", {
        addonServiceIds: ["add-2"],
      }),
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
