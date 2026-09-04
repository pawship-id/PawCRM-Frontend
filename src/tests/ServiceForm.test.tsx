import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ServiceForm } from "@/features/services";
import { serviceService } from "@/services/service.service";
import { businessLineService } from "@/services/businessLine.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { Service } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/service.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/branch.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

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
  description: null,
  hasVariants: false,
  variantAxes: [],
  variants: [],
  sessions: [],
  allBranches: true,
  branchIds: [],
  serviceType: "main",
  addonServiceIds: [],
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

/** Name, code, line, duration — everything a create needs but the price. */
async function fillRequiredExceptPrice(name = "Grooming") {
  await userEvent.type(screen.getByLabelText(/nama layanan/i), name);
  await userEvent.type(screen.getByLabelText(/^kode/i), "GRM-FULL");
  await userEvent.click(
    screen.getByRole("button", { name: /pilih lini bisnis/i }),
  );
  await userEvent.click(await screen.findByRole("option", { name: "Grooming" }));
  await userEvent.type(screen.getByLabelText(/durasi/i), "90");
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

  it("sends the axes and one variant per row, and no flat price", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await fillRequiredExceptPrice();
    await userEvent.click(screen.getByLabelText(/harga beda per varian/i));
    await userEvent.click(screen.getByLabelText(/kategori bulu/i));
    await userEvent.type(screen.getByLabelText("Harga Bulu panjang"), "180000");
    await userEvent.type(screen.getByLabelText("Harga Bulu pendek"), "150000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() => expect(mockedServiceService.create).toHaveBeenCalled());
    const [payload] = mockedServiceService.create.mock.calls[0];

    expect(payload.hasVariants).toBe(true);
    expect(payload.variantAxes).toEqual(["furType"]);
    expect(payload.price).toBeUndefined();
    expect(payload.variants).toEqual([
      {
        petType: null,
        sizeCategory: null,
        furType: "long hair",
        price: "180000",
      },
      {
        petType: null,
        sizeCategory: null,
        furType: "short hair",
        price: "150000",
      },
    ]);
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

  it("loads a variant-priced service back into its generated rows", async () => {
    mockedServiceService.getById.mockResolvedValue({
      ...serviceFixture,
      price: null,
      hasVariants: true,
      variantAxes: ["furType"],
      variants: [
        {
          petType: null,
          sizeCategory: null,
          furType: "long hair",
          price: "180000.0000",
        },
        {
          petType: null,
          sizeCategory: null,
          furType: "short hair",
          price: "150000.0000",
        },
      ],
    });

    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByDisplayValue("180000")).toBeVisible();
    expect(screen.getByDisplayValue("150000")).toBeVisible();
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
    expect(push).toHaveBeenCalledWith("/dashboard/master/layanan");
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
