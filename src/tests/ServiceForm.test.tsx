import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ServiceForm } from "@/features/services";
import { serviceService } from "@/services/service.service";
import { businessLineService } from "@/services/businessLine.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import { petOptionService } from "@/services/petOption.service";
import { serviceStepService } from "@/services/serviceStep.service";
import type { Service } from "@/types/api";

import {
  makePetOption,
  PET_OPTION_FIXTURES,
  primePetOptions,
} from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  makeServiceStep,
  SERVICE_STEP_FIXTURES,
  primeServiceSteps,
} from "./helpers/serviceSteps";

jest.mock("@/services/service.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/branch.service");
// The variant rows are the tenant's species, sizes and coats.
jest.mock("@/services/petOption.service");
// Tahapan are picked from the line's list.
jest.mock("@/services/serviceStep.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

import { swalToast } from "@/lib/swal";

/**
 * The picture control is stubbed. Its own behaviour — pick, crop, upload, the
 * purpose segment, the failure paths — is covered in ImageField.test.tsx; a real
 * one would drag `react-easy-crop` and a canvas into every case below.
 */
jest.mock("@/components/ImageField", () => ({
  ImageField: () => <div>gambar layanan</div>,
}));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedServiceService = serviceService as jest.Mocked<
  typeof serviceService
>;
const mockedBusinessLineService = businessLineService as jest.Mocked<
  typeof businessLineService
>;
const mockedBranchService = branchService as jest.Mocked<typeof branchService>;

const LINE_ID = "5a7f1f77bcf86cd799439077";
const SERVICE_ID = "5a7f1f77bcf86cd799439099";
const ADDON_ID = "5a7f1f77bcf86cd7994390aa";
const BRANCH_ID = "5a7f1f77bcf86cd7994390bb";

const serviceFixture: Service = {
  _id: SERVICE_ID,
  tenantId: "507f1f77bcf86cd799439011",
  name: "Grooming Full Service",
  code: "GRM-FULL",
  image: null,
  businessLineId: LINE_ID,
  salesAccountId: null,
  categoryId: null,
  price: "150000.0000",
  durationMin: 90,
  billingUnit: "per_pet",
  description: null,
  hasVariants: false,
  variantAxes: [],
  variants: [],
  sessions: [],
  sessionWeights: [],
  allBranches: true,
  branchIds: [],
  serviceType: "main",
  addonServiceIds: [],
  addonStepId: null,
  commissionable: true,
  soldSeparately: false,
  included: [],
  serviceLocations: ["in_store"],
  pickupDeliveryAvailable: false,
  taxExempt: false,
  isActive: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const addonFixture: Service = {
  ...serviceFixture,
  _id: ADDON_ID,
  name: "Parfum",
  code: "ADD-PARFUM",
  serviceType: "addon",
  price: "20000.0000",
};

beforeEach(() => {
  jest.clearAllMocks();
  primePetOptions(petOptionService.list);
  // Mandi → Gunting → Blow dry, on this suite's line.
  primeServiceSteps(
    serviceStepService.list,
    SERVICE_STEP_FIXTURES.map((step) => ({ ...step, businessLineId: LINE_ID })),
  );
  mockedBusinessLineService.list.mockResolvedValue({
    items: [
      {
        _id: LINE_ID,
        tenantId: "507f1f77bcf86cd799439011",
        name: "Grooming",
        color: "#1E3A6B",
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedBranchService.list.mockResolvedValue({
    items: [
      {
        _id: BRANCH_ID,
        tenantId: "507f1f77bcf86cd799439011",
        name: "Cabang Bazar",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // The add-on picker's own read. Empty by default; the add-on cases say
  // otherwise.
  mockedServiceService.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

/**
 * The flat price box.
 *
 * BY ROLE AND FULL NAME, not `getByLabelText(/harga/)`: the required marker is
 * part of the label ("Harga *"), and a loose match also finds the "Harga beda
 * per varian" switch and every generated variant row.
 */
const priceBox = () => screen.getByRole("textbox", { name: /^harga \*/i });

/** Renders create mode and waits for the option fetches to settle. */
async function renderNew() {
  renderWithAuth(<ServiceForm />);
  await waitFor(() =>
    expect(mockedBusinessLineService.list).toHaveBeenCalled(),
  );
}

/** Picks a business line by name. */
async function pickLine(label = "Grooming") {
  await userEvent.click(
    screen.getByRole("button", { name: /pilih lini bisnis/i }),
  );
  await userEvent.click(await screen.findByRole("option", { name: label }));
}

/** Name, code, line, duration — everything a create needs but the price. */
async function fillRequiredExceptPrice(name = "Grooming") {
  await userEvent.type(screen.getByLabelText(/nama layanan/i), name);
  await userEvent.type(screen.getByLabelText(/^kode/i), "GRM-FULL");
  await pickLine();
  await userEvent.type(screen.getByLabelText(/durasi/i), "90");
}

/** Opens "Tambah tahapan…" and picks each name from the line's list. */
async function addSessions(...names: string[]) {
  for (const name of names) {
    await userEvent.click(screen.getByRole("button", { name: /tambah tahapan/i }));
    await userEvent.click(await screen.findByRole("button", { name }));
  }
}

describe("ServiceForm — creating", () => {
  it("refuses to submit without a name, a code, a line and a price", async () => {
    await renderNew();

    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/nama layanan wajib diisi/i)).toBeVisible();
    expect(screen.getByText(/kode wajib diisi/i)).toBeVisible();
    expect(screen.getByText(/pilih lini bisnisnya dulu/i)).toBeVisible();
    expect(screen.getByText(/harga wajib diisi/i)).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("sends the price as a STRING, exactly as typed", async () => {
    // The string form is what keeps a price exact all the way to the ledger — a
    // Number(price) anywhere in the chain reintroduces the float this avoids.
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "199999");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: "199999" }),
      ),
    );
    const [payload] = mockedServiceService.create.mock.calls[0];
    expect(typeof payload.price).toBe("string");
  });

  it("refuses a thousands separator — 150.000 means 150 rupiah to a parser", async () => {
    /*
      THE ONE THAT MATTERS. In Indonesian, `.` is the thousands separator, so
      somebody typing "150.000" means a hundred and fifty thousand. Read as a
      decimal it is 150 rupiah — and it would be stored silently, with the form
      showing exactly what they typed. The box takes digits only.
    */
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.type(priceBox(), "150.000");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/tanpa titik atau koma/i)).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("refuses a comma separator for the same reason", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.type(priceBox(), "150,000");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/tanpa titik atau koma/i)).toBeVisible();
  });

  it("refuses a negative price", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.type(priceBox(), "-1");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/tanpa titik atau koma/i)).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("accepts a price of zero — a free service is a real thing", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice("Potong kuku");
    await userEvent.type(priceBox(), "0");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: "0" }),
      ),
    );
  });

  it("refuses a duration longer than a day, saying what to do instead", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Penitipan");
    await userEvent.type(priceBox(), "90000");
    await userEvent.type(screen.getByLabelText(/durasi/i), "1441");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/per malam/i)).toBeVisible();
  });

  it("binds a duplicate-code 409 to the code field, not to a banner", async () => {
    mockedServiceService.create.mockRejectedValue(
      new ApiError("Code 'GRM-FULL' already exists", 409),
    );
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "150000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(
      await screen.findByText(/sudah dipakai layanan lain/i),
    ).toBeVisible();
  });

  /*
    ─── THE PAYLOAD THAT CAME BACK "Validation failed" AND NOTHING ELSE ───────

    Reported from the screen: a perfectly ordinary add-on, refused with a bare
    banner. Three fields were at fault and all three were fields the form sends
    without a box for them — `image: null`, and the two variant arrays sent
    empty on a flat-priced service. The refusal named `variantAxes`, which this
    form only draws inside the variant editor, so on a flat service it appeared
    nowhere at all.
  */
  it("sends no variant fields at all when the price is flat", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "20000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() => expect(mockedServiceService.create).toHaveBeenCalled());
    const [payload] = mockedServiceService.create.mock.calls[0];

    expect(payload).not.toHaveProperty("variantAxes");
    expect(payload).not.toHaveProperty("variants");
    expect(payload.price).toBe("20000");
  });

  it("sends no image key when no picture was chosen", async () => {
    // `image: null` on a create was refused outright, which made a service
    // without a picture impossible to make from this screen.
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "20000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() => expect(mockedServiceService.create).toHaveBeenCalled());
    expect(mockedServiceService.create.mock.calls[0][0]).not.toHaveProperty(
      "image",
    );
  });

  it("shows WHAT was wrong, not just that something was", async () => {
    /*
      The server answers a malformed payload with "Validation failed" and puts
      the actual fault in `details`. Showing only the message is the one
      sentence nobody can act on.
    */
    mockedServiceService.create.mockRejectedValue(
      new ApiError("Validation failed", 400, {
        details: [{ field: "body.durationMin", message: "must be a number" }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "20000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/must be a number/i)).toBeInTheDocument();
  });

  it("says out loud that nothing was saved", async () => {
    // The form is five cards tall; a banner at the top is off-screen from the
    // button that was just pressed.
    mockedServiceService.create.mockRejectedValue(
      new ApiError("Validation failed", 400),
    );
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "20000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(swalToast).toHaveBeenCalledWith(
        expect.stringMatching(/belum tersimpan/i),
      ),
    );
  });

  it("does not offer the availability switch when creating", async () => {
    // A service is created because it will be sold; "make this and retire it
    // immediately" answers a question nobody asked.
    await renderNew();

    expect(
      screen.queryByLabelText(/masih ditawarkan/i),
    ).not.toBeInTheDocument();
  });

  it("defaults to every branch, and sends no branch list with it", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "150000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ allBranches: true, branchIds: [] }),
      ),
    );
  });

  it("refuses a scope of no branches at all", async () => {
    // A service available nowhere vanishes from every till while looking
    // perfectly healthy on its own page.
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "150000");
    await userEvent.click(screen.getByLabelText(/semua cabang/i));
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/pilih minimal satu cabang/i)).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });
});

describe("ServiceForm — variant pricing", () => {
  /**
   * FLAT OR PER-VARIANT, NEVER BOTH — the server's own rule. The switch decides
   * which half of the card exists, and the payload carries only that half.
   */
  it("replaces the price box with the axis list when variants are on", async () => {
    await renderNew();

    expect(priceBox()).toBeVisible();

    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));

    expect(
      screen.queryByRole("textbox", { name: /^harga \*/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/harga dibedakan berdasarkan/i)).toBeVisible();
  });

  it("generates one priced row per combination of the ticked axes", async () => {
    await renderNew();

    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByLabelText(/tipe hewan/i));
    await userEvent.click(screen.getByLabelText(/kategori ukuran/i));

    // 2 pet types × 3 sizes.
    expect(await screen.findByText(/6 baris/i)).toBeVisible();
    expect(screen.getByLabelText("Harga Kucing · Kecil")).toBeVisible();
    expect(screen.getByLabelText("Harga Anjing · Besar")).toBeVisible();
  });

  it("refuses to save while any generated row has no price", async () => {
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByLabelText(/kategori bulu/i));
    await userEvent.type(
      screen.getByLabelText("Harga Bulu panjang"),
      "150000",
    );
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(
      await screen.findByText(/semua baris varian harus punya harga/i),
    ).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("refuses variants with no axis ticked", async () => {
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(
      await screen.findByText(/pilih minimal satu dasar pembeda harga/i),
    ).toBeVisible();
  });

  /*
    ─── EACH VARIANT ITS OWN MINUTES AND ITS OWN AKTIF (13 September 2026) ────

    A variant service has no single duration: the box above the grid goes away,
    every row carries its own minutes beside its price, and a row can be switched
    off without leaving the grid.
  */
  it("sends the axes and one variant per row — price, minutes, on/off — and no flat price or duration", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByLabelText(/kategori bulu/i));
    await userEvent.type(screen.getByLabelText("Harga Bulu panjang"), "180000");
    await userEvent.type(screen.getByLabelText("Harga Bulu pendek"), "150000");
    await userEvent.type(
      screen.getByLabelText("Durasi Bulu panjang (menit)"),
      "120",
    );
    await userEvent.type(
      screen.getByLabelText("Durasi Bulu pendek (menit)"),
      "90",
    );
    await userEvent.click(screen.getByLabelText("Bulu pendek aktif"));
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() => expect(mockedServiceService.create).toHaveBeenCalled());
    const [payload] = mockedServiceService.create.mock.calls[0];

    expect(payload.hasVariants).toBe(true);
    expect(payload.variantAxes).toEqual(["furType"]);
    expect(payload.price).toBeUndefined();
    expect(payload.durationMin).toBeUndefined();
    expect(payload.variants).toEqual([
      {
        petType: null,
        sizeCategory: null,
        furType: "long hair",
        price: "180000",
        durationMin: 120,
        isActive: true,
      },
      {
        petType: null,
        sizeCategory: null,
        furType: "short hair",
        price: "150000",
        durationMin: 90,
        isActive: false,
      },
    ]);
  });

  it("drops the single duration box while variants are on", async () => {
    await renderNew();

    expect(
      screen.getByRole("spinbutton", { name: /^durasi \(menit\)/i }),
    ).toBeVisible();

    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));

    expect(
      screen.queryByRole("spinbutton", { name: /^durasi \(menit\)/i }),
    ).not.toBeInTheDocument();
  });

  it("refuses to save while any variant row has no duration", async () => {
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByLabelText(/kategori bulu/i));
    await userEvent.type(screen.getByLabelText("Harga Bulu panjang"), "180000");
    await userEvent.type(screen.getByLabelText("Harga Bulu pendek"), "150000");
    await userEvent.type(
      screen.getByLabelText("Durasi Bulu panjang (menit)"),
      "120",
    );
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(
      await screen.findByText(/semua baris varian harus punya durasi/i),
    ).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });
});

describe("ServiceForm — the tenant's species, sizes and coats", () => {
  /*
    ─── THE ROWS ARE THE TENANT'S PET OPTIONS (14 September 2026) ─────────────

    Not three closed lists any more: a shop can add a size, retire a coat, or
    have enough of each that ticking every axis makes more variants than the
    server stores.
  */
  const XL = makePetOption({
    type: "size",
    code: "xl",
    label: "Ekstra besar",
    sortOrder: 3,
  });

  const LONG_HAIR_RETIRED = PET_OPTION_FIXTURES.map((option) =>
    option.code === "long hair" ? { ...option, isActive: false } : option,
  );

  const priceRows = () =>
    screen
      .getAllByRole("textbox", { name: /^Harga / })
      .map((input) => input.getAttribute("aria-label"));

  it("gives a size the tenant added its own row, in the tenant's order", async () => {
    // Listed first: the order is sortOrder, not arrival.
    primePetOptions(petOptionService.list, [XL, ...PET_OPTION_FIXTURES]);
    await renderNew();

    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByLabelText(/kategori ukuran/i));

    expect(await screen.findByText(/4 baris/i)).toBeVisible();
    expect(priceRows()).toEqual([
      "Harga Kecil",
      "Harga Sedang",
      "Harga Besar",
      "Harga Ekstra besar",
    ]);
  });

  it("keeps a priced coat whose option was retired, and saves it with the rest", async () => {
    primePetOptions(petOptionService.list, LONG_HAIR_RETIRED);
    mockedServiceService.getById.mockResolvedValue({
      ...serviceFixture,
      price: null,
      durationMin: null,
      hasVariants: true,
      variantAxes: ["furType"],
      variants: [
        {
          petType: null,
          sizeCategory: null,
          furType: "long hair",
          price: "180000.0000",
          durationMin: 120,
          isActive: true,
        },
        {
          petType: null,
          sizeCategory: null,
          furType: "short hair",
          price: "150000.0000",
          durationMin: 90,
          isActive: true,
        },
      ],
    });
    mockedServiceService.update.mockResolvedValue(serviceFixture);

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(
      await screen.findByLabelText("Harga Bulu panjang (nonaktif)"),
    ).toHaveValue("180000");
    expect(priceRows()).toEqual([
      "Harga Bulu panjang (nonaktif)",
      "Harga Bulu pendek",
    ]);

    await userEvent.click(screen.getByRole("button", { name: /simpan layanan/i }));

    await waitFor(() => expect(mockedServiceService.update).toHaveBeenCalled());
    const [, payload] = mockedServiceService.update.mock.calls[0];
    expect(payload.variants?.map((variant) => variant.furType)).toEqual([
      "long hair",
      "short hair",
    ]);
  });

  it("does not offer a retired coat on a new service", async () => {
    primePetOptions(petOptionService.list, LONG_HAIR_RETIRED);
    await renderNew();

    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByLabelText(/kategori bulu/i));

    expect(await screen.findByText(/1 baris/i)).toBeVisible();
    expect(priceRows()).toEqual(["Harga Bulu pendek"]);
  });

  it("keeps Simpan off while the ticked axes make more than 20 variants", async () => {
    primePetOptions(petOptionService.list, [
      ...PET_OPTION_FIXTURES,
      makePetOption({ type: "species", code: "rabbit", label: "Kelinci", sortOrder: 2 }),
      XL,
    ]);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByLabelText(/tipe hewan/i));
    await userEvent.click(screen.getByLabelText(/kategori ukuran/i));
    await userEvent.click(screen.getByLabelText(/kategori bulu/i));

    // 3 species × 4 sizes × 2 coats.
    expect(
      await screen.findByText(
        /kombinasinya jadi 24 varian — maksimal 20 per layanan/i,
      ),
    ).toBeVisible();
    // The action bar says why its button is off.
    expect(
      screen.getByText("24 varian, maksimal 20 per layanan"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /buat layanan/i })).toBeDisabled();

    // 4 × 2 = 8 fits.
    await userEvent.click(screen.getByLabelText(/tipe hewan/i));

    expect(screen.queryByText(/kombinasinya jadi/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buat layanan/i })).toBeEnabled();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });
});

describe("ServiceForm — billing unit", () => {
  /*
    PER HEWAN OR PER KUNJUNGAN (13 September 2026). Stored and sent; the hint
    under the field says billing does not act on it yet.
  */
  it("sends per_pet unless somebody picks per kunjungan", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "25000");
    await userEvent.click(screen.getByRole("combobox", { name: /ditagih/i }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Per kunjungan" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() => expect(mockedServiceService.create).toHaveBeenCalled());
    const [payload] = mockedServiceService.create.mock.calls[0];
    expect(payload.billingUnit).toBe("per_visit");
  });
});

describe("ServiceForm — add-ons", () => {
  it("asks the API for add-ons only, since nothing else may be listed here", async () => {
    await renderNew();

    expect(mockedServiceService.list).toHaveBeenCalledWith(
      expect.objectContaining({ serviceType: "addon" }),
    );
  });

  it("says where add-ons come from rather than showing an empty box", async () => {
    await renderNew();

    expect(
      await screen.findByText(/belum ada layanan yang ditandai sebagai add-on/i),
    ).toBeVisible();
  });

  it("sends the ticked add-ons with the service", async () => {
    mockedServiceService.list.mockResolvedValue({
      items: [addonFixture],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "150000");
    await userEvent.click(await screen.findByLabelText(/parfum/i));
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ addonServiceIds: [ADDON_ID] }),
      ),
    );
  });

  it("hides the add-on card once the service is itself an add-on", async () => {
    // An add-on may not carry add-ons of its own; a disabled card would offer a
    // choice that has no effect.
    mockedServiceService.list.mockResolvedValue({
      items: [addonFixture],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await renderNew();

    await userEvent.click(screen.getByRole("combobox", { name: /jenis layanan/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Add-on" }));

    expect(screen.queryByLabelText(/parfum/i)).not.toBeInTheDocument();
  });

  it("offers Kena komisi and Dijual terpisah only on an add-on", async () => {
    await renderNew();

    expect(screen.queryByLabelText("Kena komisi")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dijual terpisah")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: /jenis layanan/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Add-on" }));

    expect(screen.getByLabelText("Kena komisi")).toBeChecked();
    expect(screen.getByLabelText("Dijual terpisah")).not.toBeChecked();
  });

  it("hides Jenis layanan when opened from Tambah add-on, and still creates an add-on", async () => {
    mockedServiceService.create.mockResolvedValue(addonFixture);
    renderWithAuth(<ServiceForm fixedServiceType="addon" />);
    await waitFor(() => expect(mockedBusinessLineService.list).toHaveBeenCalled());

    expect(
      screen.queryByRole("combobox", { name: /jenis layanan/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Kena komisi")).toBeChecked();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "25000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ serviceType: "addon", addonServiceIds: [] }),
      ),
    );
  });

  it("hides Jenis layanan when opened from Layanan baru, and creates a main service", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    renderWithAuth(<ServiceForm fixedServiceType="main" />);
    await waitFor(() => expect(mockedBusinessLineService.list).toHaveBeenCalled());

    expect(
      screen.queryByRole("combobox", { name: /jenis layanan/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Kena komisi")).not.toBeInTheDocument();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "150000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ serviceType: "main" }),
      ),
    );
    // Batal and the save still land on Layanan & Harga.
    expect(push).toHaveBeenCalledWith("/dashboard/layanan/grooming/katalog");
  });

  it("goes back to Pengaturan › Layanan › Add-on on Batal when opened from there", async () => {
    renderWithAuth(<ServiceForm fixedServiceType="addon" />);
    await waitFor(() => expect(mockedBusinessLineService.list).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(push).toHaveBeenCalledWith("/dashboard/master/layanan?bagian=addon");
  });

  it("keeps Batal going to Layanan & Harga on the ordinary new-service form", async () => {
    await renderNew();

    await userEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(push).toHaveBeenCalledWith("/dashboard/layanan/grooming/katalog");
  });

  it("loads an add-on's two switches and saves what was changed", async () => {
    mockedServiceService.getById.mockResolvedValue({
      ...addonFixture,
      _id: SERVICE_ID,
      commissionable: false,
      soldSeparately: false,
    });
    mockedServiceService.update.mockResolvedValue(addonFixture);
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    const komisi = await screen.findByLabelText("Kena komisi");
    expect(komisi).not.toBeChecked();
    await userEvent.click(screen.getByLabelText("Dijual terpisah"));
    await userEvent.click(screen.getByRole("button", { name: /simpan layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.update).toHaveBeenCalledWith(
        SERVICE_ID,
        expect.objectContaining({ commissionable: false, soldSeparately: true }),
      ),
    );
  });

  it("sends neither switch when saving a main service", async () => {
    mockedServiceService.getById.mockResolvedValue(serviceFixture);
    mockedServiceService.update.mockResolvedValue(serviceFixture);
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    await screen.findByDisplayValue("Grooming Full Service");
    await userEvent.click(screen.getByRole("button", { name: /simpan layanan/i }));

    await waitFor(() => expect(mockedServiceService.update).toHaveBeenCalled());
    const [, patch] = mockedServiceService.update.mock.calls[0];
    expect(patch).not.toHaveProperty("commissionable");
    expect(patch).not.toHaveProperty("soldSeparately");
  });
});

/*
  ─── THE COMMISSION SPLIT BETWEEN TAHAPAN — 13 September 2026 ─────────────────

  Commission is one rule for the whole shop; how a service's share divides
  between its tahapan is the service's own. All empty splits evenly; anything
  filled must be every box and exactly 100 — the server answers 400 otherwise.
*/
/*
  ─── TAHAPAN COME FROM THE LINE'S LIST — 14 September 2026 ────────────────────

  Free text until then. The server now refuses a name that is not an active step
  of the service's line (keeping only what the service already stored there), so
  the form offers the list, and a missing name is added to the list on the spot.
*/
describe("ServiceForm — tahapan from the line's list", () => {
  const OTHER_LINE_ID = "5a7f1f77bcf86cd7994390cc";

  const tahapanButton = () =>
    screen.getByRole("button", { name: /tambah tahapan/i });

  it("keeps the picker off until a business line is chosen", async () => {
    await renderNew();

    expect(tahapanButton()).toBeDisabled();
    expect(screen.getByText("Pilih lini bisnis dulu.")).toBeVisible();
    expect(serviceStepService.list).not.toHaveBeenCalled();

    await pickLine();

    expect(tahapanButton()).toBeEnabled();
    expect(screen.queryByText("Pilih lini bisnis dulu.")).not.toBeInTheDocument();
  });

  it("offers only the line's active steps not already chosen, and sends the list's spelling", async () => {
    primeServiceSteps(serviceStepService.list, [
      ...SERVICE_STEP_FIXTURES.map((step) => ({ ...step, businessLineId: LINE_ID })),
      makeServiceStep({ name: "Spa", businessLineId: LINE_ID, isActive: false, sortOrder: 3 }),
      makeServiceStep({ name: "Kandang", businessLineId: OTHER_LINE_ID }),
    ]);
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "150000");

    await userEvent.click(tahapanButton());
    expect(
      (await screen.findAllByRole("button", { name: /^(Mandi|Gunting|Blow dry|Spa|Kandang)$/ })).map(
        (button) => button.textContent,
      ),
    ).toEqual(["Mandi", "Gunting", "Blow dry"]);
    await userEvent.click(screen.getByRole("button", { name: "Gunting" }));

    // Chosen already: gone from the options, whatever the case it is typed in.
    await userEvent.click(tahapanButton());
    expect(await screen.findByRole("button", { name: "Mandi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gunting" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Cari tahapan"), "gunting");
    expect(screen.getByText("Tahapan ini sudah ada di layanan ini.")).toBeVisible();

    // A retired step typed by name is said, not offered.
    await userEvent.clear(screen.getByLabelText("Cari tahapan"));
    await userEvent.type(screen.getByLabelText("Cari tahapan"), "spa");
    expect(screen.getByText(/“Spa” sudah dinonaktifkan/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /ke daftar tahapan/ }),
    ).not.toBeInTheDocument();

    // Enter on an exact match picks it — in the list's spelling.
    await userEvent.clear(screen.getByLabelText("Cari tahapan"));
    await userEvent.type(screen.getByLabelText("Cari tahapan"), "mandi{Enter}");

    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() => expect(mockedServiceService.create).toHaveBeenCalled());
    expect(mockedServiceService.create.mock.calls[0][0].sessions).toEqual([
      "Gunting",
      "Mandi",
    ]);
  });

  it("adds a name missing from the list to the line's list, and takes the name it was stored as", async () => {
    jest
      .mocked(serviceStepService.create)
      .mockResolvedValue(
        makeServiceStep({ name: "Potong kuku", businessLineId: LINE_ID, sortOrder: 3 }),
      );
    await renderNew();

    await pickLine();
    await userEvent.click(tahapanButton());
    await userEvent.type(await screen.findByLabelText("Cari tahapan"), "potong kuku");
    await userEvent.click(
      screen.getByRole("button", { name: "Tambah “potong kuku” ke daftar tahapan" }),
    );

    await waitFor(() =>
      expect(serviceStepService.create).toHaveBeenCalledWith({
        businessLineId: LINE_ID,
        name: "potong kuku",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Hapus tahapan Potong kuku" }),
    ).toBeInTheDocument();
    // The list is read again, so the new step is on it for the next pick.
    await waitFor(() =>
      expect(serviceStepService.list).toHaveBeenCalledTimes(2),
    );
  });

  it("says a 409 from the quick add inline, and adds nothing", async () => {
    jest
      .mocked(serviceStepService.create)
      .mockRejectedValue(new ApiError("Service step already exists", 409));
    await renderNew();

    await pickLine();
    await userEvent.click(tahapanButton());
    await userEvent.type(await screen.findByLabelText("Cari tahapan"), "Spa");
    await userEvent.click(
      screen.getByRole("button", { name: "Tambah “Spa” ke daftar tahapan" }),
    );

    expect(
      await screen.findByText(/“Spa” ternyata sudah ada di daftar tahapan/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Hapus tahapan Spa" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer the quick add to a role that may not change services", async () => {
    renderWithAuth(<ServiceForm />, {
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read", "create"] }],
    });
    await waitFor(() => expect(mockedBusinessLineService.list).toHaveBeenCalled());

    await pickLine();
    await userEvent.click(tahapanButton());
    await userEvent.type(await screen.findByLabelText("Cari tahapan"), "Spa");

    expect(
      screen.getByText("“Spa” belum ada di daftar tahapan lini ini."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /ke daftar tahapan/ }),
    ).not.toBeInTheDocument();
  });

  it("marks a stored tahapan that is retired or not on the list, and does not offer it again", async () => {
    primeServiceSteps(serviceStepService.list, [
      makeServiceStep({ name: "Mandi", businessLineId: LINE_ID, sortOrder: 0 }),
      makeServiceStep({ name: "Gunting", businessLineId: LINE_ID, sortOrder: 1 }),
      makeServiceStep({ name: "Blow dry", businessLineId: LINE_ID, sortOrder: 2, isActive: false }),
    ]);
    mockedServiceService.getById.mockResolvedValue({
      ...serviceFixture,
      sessions: ["Mandi", "Blow dry", "Spa"],
    });

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    const blowDry = (
      await screen.findByRole("button", { name: "Hapus tahapan Blow dry" })
    ).closest("li") as HTMLElement;
    expect(await within(blowDry).findByText("nonaktif")).toBeVisible();
    const spa = screen
      .getByRole("button", { name: "Hapus tahapan Spa" })
      .closest("li") as HTMLElement;
    expect(within(spa).getByText("belum di daftar")).toBeVisible();
    // Stored on this same line: the server keeps them, so no warning.
    expect(screen.queryByText(/ditolak saat disimpan/)).not.toBeInTheDocument();

    await userEvent.click(tahapanButton());
    expect(await screen.findByRole("button", { name: "Gunting" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Blow dry" })).not.toBeInTheDocument();

    // Removable all the same.
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Hapus tahapan Spa" }));
    expect(
      screen.queryByRole("button", { name: "Hapus tahapan Spa" }),
    ).not.toBeInTheDocument();
  });

  it("warns when the chosen line's list does not have the tahapan already picked", async () => {
    mockedBusinessLineService.list.mockResolvedValue({
      items: [
        { _id: LINE_ID, name: "Grooming" },
        { _id: OTHER_LINE_ID, name: "Hotel" },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    primeServiceSteps(serviceStepService.list, [
      ...SERVICE_STEP_FIXTURES.map((step) => ({ ...step, businessLineId: LINE_ID })),
      makeServiceStep({ name: "Kandang", businessLineId: OTHER_LINE_ID }),
    ]);
    await renderNew();

    await pickLine("Grooming");
    await addSessions("Mandi");
    expect(screen.queryByText(/ditolak saat disimpan/)).not.toBeInTheDocument();

    await pickLine("Hotel");

    expect(
      await screen.findByText(
        /“Mandi” tidak ada di daftar tahapan aktif lini bisnis ini/,
      ),
    ).toBeVisible();
    expect(screen.getByText("belum di daftar")).toBeVisible();
  });

  it("puts the server's refusal of a tahapan under the field", async () => {
    mockedServiceService.create.mockRejectedValue(
      new ApiError("Unknown or retired service step", 400, {
        details: [
          { field: "sessions", message: "Tahapan 'Mandi' sudah dinonaktifkan" },
        ],
      }),
    );
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "150000");
    await addSessions("Mandi");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(
      await screen.findByText("Tahapan 'Mandi' sudah dinonaktifkan"),
    ).toBeVisible();
    // Not the bare banner — the sentence is bound to the field.
    expect(
      screen.queryByText(/Unknown or retired service step/),
    ).not.toBeInTheDocument();
  });
});

describe("ServiceForm — commission weights per tahapan", () => {
  async function fillValidService() {
    await fillRequiredExceptPrice();
    await userEvent.type(priceBox(), "150000");
  }

  it("sends [] when every weight is left empty — split evenly", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillValidService();
    await addSessions("Mandi", "Gunting");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() => expect(mockedServiceService.create).toHaveBeenCalled());
    expect(mockedServiceService.create.mock.calls[0][0].sessionWeights).toEqual([]);
  });

  it("sends one whole per cent per tahapan, in their order", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillValidService();
    await addSessions("Mandi", "Gunting");
    await userEvent.type(screen.getByLabelText("Bobot Mandi (%)"), "60");
    await userEvent.type(screen.getByLabelText("Bobot Gunting (%)"), "40");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() => expect(mockedServiceService.create).toHaveBeenCalled());
    expect(mockedServiceService.create.mock.calls[0][0].sessionWeights).toEqual([
      60, 40,
    ]);
  });

  it("refuses weights that do not add up to 100, and says the total", async () => {
    await renderNew();

    await fillValidService();
    await addSessions("Mandi", "Gunting");
    await userEvent.type(screen.getByLabelText("Bobot Mandi (%)"), "50");
    await userEvent.type(screen.getByLabelText("Bobot Gunting (%)"), "40");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(
      await screen.findByText(/total bobotnya 90%, harus pas 100%/i),
    ).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("refuses a half-filled set rather than guessing the rest", async () => {
    await renderNew();

    await fillValidService();
    await addSessions("Mandi", "Gunting");
    await userEvent.type(screen.getByLabelText("Bobot Mandi (%)"), "100");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/isi bobot semua tahapan/i)).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("fills whole per cents that add up to 100 with Bagi rata", async () => {
    await renderNew();

    await pickLine();
    await addSessions("Mandi", "Gunting", "Blow dry");
    await userEvent.click(screen.getByRole("button", { name: "Bagi rata" }));

    expect(screen.getByLabelText("Bobot Mandi (%)")).toHaveValue("34");
    expect(screen.getByLabelText("Bobot Gunting (%)")).toHaveValue("33");
    expect(screen.getByLabelText("Bobot Blow dry (%)")).toHaveValue("33");
  });

  it("loads stored weights on edit", async () => {
    mockedServiceService.getById.mockResolvedValue({
      ...serviceFixture,
      sessions: ["Mandi", "Gunting"],
      sessionWeights: [70, 30],
    });

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByLabelText("Bobot Mandi (%)")).toHaveValue("70");
    expect(screen.getByLabelText("Bobot Gunting (%)")).toHaveValue("30");
  });

  it("ignores stored weights that no longer line up with the tahapan", async () => {
    // Which number belonged to which tahapan is unknowable once the lengths
    // differ; the empty editor says what the server does — split evenly.
    mockedServiceService.getById.mockResolvedValue({
      ...serviceFixture,
      sessions: ["Mandi", "Gunting"],
      sessionWeights: [100],
    });

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByLabelText("Bobot Mandi (%)")).toHaveValue("");
    expect(screen.getByLabelText("Bobot Gunting (%)")).toHaveValue("");
  });
});

describe("ServiceForm — editing", () => {
  beforeEach(() => {
    mockedServiceService.getById.mockResolvedValue(serviceFixture);
    mockedServiceService.update.mockResolvedValue(serviceFixture);
  });

  it("trims the stored four decimals out of the price box", async () => {
    // "150000.0000" is how the ledger stores it and noise for whoever is reading
    // the form.
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByDisplayValue("150000")).toBeVisible();
  });

  it("loads the rest of the service into the fields", async () => {
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(
      await screen.findByDisplayValue("Grooming Full Service"),
    ).toBeVisible();
    expect(screen.getByDisplayValue("GRM-FULL")).toBeVisible();
    expect(screen.getByDisplayValue("90")).toBeVisible();
  });

  it("loads a variant-priced service back into its generated rows — price, minutes and on/off", async () => {
    mockedServiceService.getById.mockResolvedValue({
      ...serviceFixture,
      price: null,
      durationMin: null,
      hasVariants: true,
      variantAxes: ["furType"],
      variants: [
        {
          petType: null,
          sizeCategory: null,
          furType: "long hair",
          price: "180000.0000",
          durationMin: 120,
          isActive: true,
        },
        {
          petType: null,
          sizeCategory: null,
          furType: "short hair",
          price: "150000.0000",
          durationMin: 90,
          isActive: false,
        },
      ],
    });

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByDisplayValue("180000")).toBeVisible();
    expect(screen.getByDisplayValue("150000")).toBeVisible();
    expect(screen.getByLabelText("Durasi Bulu panjang (menit)")).toHaveValue(120);
    expect(screen.getByLabelText("Durasi Bulu pendek (menit)")).toHaveValue(90);
    expect(screen.getByLabelText("Bulu panjang aktif")).toBeChecked();
    expect(screen.getByLabelText("Bulu pendek aktif")).not.toBeChecked();
  });

  it("offers the availability switch when editing", async () => {
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByLabelText(/masih ditawarkan/i)).toBeVisible();
  });

  it("saves and returns to the list", async () => {
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    await screen.findByDisplayValue("Grooming Full Service");
    await userEvent.clear(screen.getByLabelText(/nama layanan/i));
    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Mandi");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan layanan/i }),
    );

    await waitFor(() =>
      expect(mockedServiceService.update).toHaveBeenCalledWith(
        SERVICE_ID,
        expect.objectContaining({ name: "Mandi" }),
      ),
    );
    // Back to the service's own detail page, not the list it was found in.
    expect(push).toHaveBeenCalledWith(
      `/dashboard/layanan/grooming/katalog/${SERVICE_ID}`,
    );
  });

  /*
    ─── A SERVICE PRICED BEFORE ANY OF THESE FIELDS EXISTED ────────────────────

    Repository reads are `.lean()`, so Mongoose's defaults never apply and an old
    document arrives with no `variantAxes` key at all. The form's first act was
    `axes.includes(...)` on undefined — "Cannot read properties of undefined
    (reading 'includes')" — and the page went blank, which also made it the one
    screen that could not be used to REPAIR the record that blanked it.

    ServiceService now fills the shape on the way out; this is the second belt,
    and it renders the legacy shape the API used to hand over.
  */
  it("opens a service stored before the variant and branch fields existed", async () => {
    const legacy = {
      _id: SERVICE_ID,
      tenantId: "507f1f77bcf86cd799439011",
      name: "Mandi",
      code: null,
      businessLineId: LINE_ID,
      price: "90000.0000",
      durationMin: 60,
      description: null,
      isActive: true,
      deletedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    mockedServiceService.getById.mockResolvedValue(legacy);

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByDisplayValue("Mandi")).toBeVisible();
    expect(screen.getByDisplayValue("90000")).toBeVisible();
    // A null code renders as an empty controlled input, not as "null" and not
    // as an uncontrolled field React then warns about.
    expect(priceBox()).toBeVisible();
    expect(screen.getByLabelText(/^kode/i)).toHaveValue("");
  });

  it("defaults an old service with no stored location to Di toko", async () => {
    // Leaving it empty would make Simpan fail on a rule the user never set, on
    // the one screen that exists to fill the blanks in.
    mockedServiceService.getById.mockResolvedValue({
      ...serviceFixture,
      serviceLocations: [],
    });

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    await screen.findByDisplayValue("Grooming Full Service");
    expect(screen.getByLabelText(/di toko/i)).toBeChecked();
  });

  it("never offers the service itself as one of its own add-ons", async () => {
    mockedServiceService.list.mockResolvedValue({
      items: [{ ...addonFixture, _id: SERVICE_ID }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    await screen.findByDisplayValue("Grooming Full Service");
    expect(screen.queryByLabelText(/parfum/i)).not.toBeInTheDocument();
  });

  /*
    ─── THE DURATION IS REQUIRED — 3 September 2026 ──────────────────────────

    Asked for by the BO during end-to-end testing: the calendar cannot draw a
    block without one, so it guesses half an hour — and a guess on a calendar is
    read as fact by everybody downstream, including the clash check.
  */
  it("refuses to save a service with no duration", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.type(screen.getByLabelText(/^kode/i), "GRM-FULL");
    await userEvent.click(
      screen.getByRole("button", { name: /pilih lini bisnis/i }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Grooming" }),
    );
    await userEvent.type(priceBox(), "150000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    /*
      THE REASON, NOT JUST "WAJIB DIISI". Somebody typing a price has no idea the
      calendar exists; saying which part of the shop reads this field is what
      makes the rule land as sense rather than as an obstacle.
    */
    // The card's own description says the same words, so this asks for the
    // error paragraph rather than any text mentioning the calendar.
    expect(
      await screen.findByText(/wajib diisi — kalender dan pengecekan bentrok/i),
    ).toBeInTheDocument();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });
});
