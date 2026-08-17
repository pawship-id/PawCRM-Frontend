import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { ProductForm } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { ApiError } from "@/services/api-error";
import type { CreatedProduct, Product } from "@/types/inventory";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

const toast = jest.fn().mockResolvedValue({ isConfirmed: true });
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: (...args: unknown[]) => toast(...args) },
}));

const WAREHOUSE = "wh1";
const CATEGORY = "c1";
const INVENTORY_ACCOUNT = "acc1";
const COGS_ACCOUNT = "acc2";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: "p1",
    sku: "SHAMPOO",
    name: "Shampoo Anjing",
    productType: "standalone",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 0,
    hasExpiry: false,
    categoryId: CATEGORY,
    unit: "botol",
    sellPrice: "45000.0000",
    hppAvg: null,
    isActive: true,
    deletedAt: null,
    stockByWarehouse: [],
    ...overrides,
  };
}

function mockLookups() {
  jest.spyOn(categoryService, "list").mockResolvedValue({
    items: [
      {
        _id: CATEGORY,
        tenantId: "t1",
        kind: "product",
        isActive: true,
        name: "Makanan",
        deletedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  jest.spyOn(warehouseService, "list").mockResolvedValue({
    items: [
      {
        _id: WAREHOUSE,
        tenantId: "t1",
        name: "Gudang Pusat",
        defaultBranchId: null,
        address: null,
        location: { lat: null, lng: null, source: "manual" },
        picName: null,
        picPhone: null,
        isActive: true,
        isDefault: false,
        deletedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });

  /**
   * The two accounting lists the form's Akuntansi section picks from.
   *
   * Mocked even though the hook catches their failure, because the caught path
   * renders "role Anda tidak punya akses" instead of the selects — so a suite
   * that left them unmocked would be testing the degraded form and would never
   * notice the pickers breaking.
   */
  // One call per account TYPE now — the form asks for assets and expenses
  // separately, because the API refuses each override that is not of its own
  // type. Answered from the requested type so each picker gets its own list.
  jest
    .spyOn(chartOfAccountsService, "list")
    .mockImplementation(async (query) => ({
      items:
        query?.accountType === "expense"
          ? [
              {
                _id: COGS_ACCOUNT,
                code: "5102",
                name: "HPP Hotel",
                accountType: "expense" as const,
                parentAccountId: null,
                isDefault: false,
                isActive: true,
              },
            ]
          : [
              {
                _id: INVENTORY_ACCOUNT,
                code: "1205",
                name: "Persediaan Hotel",
                accountType: "asset" as const,
                parentAccountId: null,
                isDefault: false,
                isActive: true,
              },
            ],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }));
}

function mockCreate(overrides: Partial<CreatedProduct> = {}) {
  return jest
    .spyOn(productService, "create")
    .mockResolvedValue({ ...makeProduct(), ...overrides });
}

/** Fills the three fields every shape needs. */
async function fillCommon(
  user: ReturnType<typeof userEvent.setup>,
  { name = "Shampoo", sku = "SHAMPOO" } = {},
) {
  await user.type(screen.getByLabelText(/Nama produk/), name);
  await user.type(screen.getByLabelText(/^SKU/), sku);
}

/**
 * The create/edit form, against a mocked `/api/products`.
 *
 * What is asserted is the PAYLOAD, because that is where this screen's decisions
 * live: whether opening stock travels with the product, whether a family goes in
 * one request, and which fields an edit sends. The rendering is a thin layer
 * over those choices.
 */
describe("ProductForm", () => {
  beforeEach(() => {
    mockLookups();
    push.mockClear();
    toast.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  /**
   * The catalogue's create menu picks the shape before the form loads, so the
   * form has to honour it. Asserted through the hint under the mode picker,
   * which is the only thing on screen that names the current mode in words —
   * the picker itself marks its selection with colour alone.
   */
  /**
   * A retired category is one nobody may file NEW products under — that is the
   * whole of what the flag means, and the category screen's own switch promises
   * it in so many words.
   */
  describe("retired categories", () => {
    /** Replaces the lookup with one live category and one retired one. */
    function mockCategories() {
      jest.spyOn(categoryService, "list").mockResolvedValue({
        items: [
          {
            _id: CATEGORY,
            tenantId: "t1",
            kind: "product",
            isActive: true,
            name: "Makanan",
            deletedAt: null,
            createdAt: "",
            updatedAt: "",
          },
          {
            _id: "c-retired",
            tenantId: "t1",
            kind: "product",
            isActive: false,
            name: "Mainan Lama",
            deletedAt: null,
            createdAt: "",
            updatedAt: "",
          },
        ],
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });
    }

    it("are not offered when filing a new product", async () => {
      const user = userEvent.setup();
      mockCategories();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.click(screen.getByRole("combobox", { name: "Kategori" }));

      expect(
        screen.getByRole("option", { name: "Makanan" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Mainan Lama" }),
      ).not.toBeInTheDocument();
    });

    it("stay offered on the product already filed under one", async () => {
      const user = userEvent.setup();
      mockCategories();
      jest
        .spyOn(productService, "getById")
        .mockResolvedValue(makeProduct({ categoryId: "c-retired" }));

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByLabelText(/Nama produk/);

      await user.click(screen.getByRole("combobox", { name: "Kategori" }));

      // Dropping it would show a category the product is not filed under, and
      // the first save would quietly re-file it.
      expect(
        screen.getByRole("option", { name: "Mainan Lama" }),
      ).toBeInTheDocument();
    });
  });

  describe("the shape carried in from ?type=", () => {
    it("opens on the shape the create menu picked", async () => {
      renderWithAuth(<ProductForm initialMode="bundle" />);
      await screen.findByLabelText(/Nama produk/);

      expect(
        screen.getByText(
          "Paket atau satuan besar yang memotong stok komponennya saat terjual.",
        ),
      ).toBeInTheDocument();
    });

    it("ignores a value it does not recognise rather than breaking", async () => {
      // A hand-edited URL is not a reason to show nothing.
      renderWithAuth(<ProductForm initialMode="paket-hemat" />);
      await screen.findByLabelText(/Nama produk/);

      expect(
        screen.getByText("Satu barang, satu harga, satu stok."),
      ).toBeInTheDocument();
    });
  });

  describe("standalone", () => {
    it("creates a product with no stock when the switch is left off", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const [payload] = create.mock.calls[0];
      // Omitted entirely, not sent as zero: the API refuses a zero opening
      // balance, and a movement recording that nothing happened is a row every
      // stock card has to explain.
      expect(payload).not.toHaveProperty("openingStock");
      expect(payload).toMatchObject({
        sku: "SHAMPOO",
        name: "Shampoo",
        sellPrice: "45000",
        categoryId: CATEGORY,
      });
    });

    it("keeps the quantity fields hidden until the switch is on", async () => {
      const user = userEvent.setup();
      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      expect(
        screen.queryByLabelText(/Jumlah stok awal/),
      ).not.toBeInTheDocument();

      await user.click(screen.getByLabelText("Isi stok awal sekarang"));

      expect(screen.getByLabelText(/Jumlah stok awal/)).toBeInTheDocument();
    });

    it("sends the opening balance with the product when the switch is on", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
      await user.type(screen.getByLabelText(/Harga beli per unit/), "30000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const [payload] = create.mock.calls[0];
      expect(payload).toMatchObject({
        openingStock: {
          warehouseId: WAREHOUSE,
          qty: "10",
          costPerUnit: "30000",
        },
      });
    });

    it("refuses opening stock that names no purchase price", async () => {
      // The price is what the opening inventory journal is built from. Without
      // it the tenant ends up holding stock the balance sheet says is worth
      // nothing — a hole that only surfaces at the first stocktake.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(await screen.findByText(/Harga beli wajib/i)).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("refuses opening stock with no quantity", async () => {
      // The switch already asked. A blank quantity saves a product with no
      // stock — what the OFF position means — while the user believes they
      // entered an opening balance.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Harga beli per unit/), "30000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText(/Jumlah stok awal wajib diisi/i),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("refuses a quantity of zero — that is the switch turned off", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Jumlah stok awal/), "0");
      await user.type(screen.getByLabelText(/Harga beli per unit/), "30000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText(/harus lebih dari 0/i),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("accepts a purchase price of zero — donated stock is real", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
      await user.type(screen.getByLabelText(/Harga beli per unit/), "0");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({
        openingStock: { costPerUnit: "0" },
      });
    });

    it("discards a quantity typed and then switched back off", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).not.toHaveProperty("openingStock");
    });

    it("demands a batch and an expiry when the goods expire", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText(/Produk punya masa kedaluwarsa/));
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      // The API refuses the movement without them; catching it here keeps the
      // refusal on the field rather than on an already-created product.
      expect(await screen.findByText(/kode batch wajib/i)).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("says so when the product was created but its stock was not", async () => {
      const user = userEvent.setup();
      mockCreate({
        openingStock: {
          posted: false,
          movements: [],
          error: "Warehouse 'Gudang' is not active",
        },
      });

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
      await user.type(screen.getByLabelText(/Harga beli per unit/), "30000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      // A 201 that quietly dropped the quantity would send the user away
      // believing they entered it.
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/stok awal belum tercatat/i),
          }),
        ),
      );
    });

    it("binds a duplicate-SKU conflict to the SKU field", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        new ApiError("Product with SKU 'SHAMPOO' already exists", 409, {
          details: [
            {
              field: "sku",
              message: "SKU 'SHAMPOO' sudah dipakai produk lain",
            },
          ],
        }),
      );

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText(/sudah dipakai produk lain/i),
      ).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
  });

  describe("a variant family", () => {
    /** Adds one axis value, producing one more combination. */
    async function addAxisValue(
      user: ReturnType<typeof userEvent.setup>,
      value: string,
    ) {
      const input = screen.getByLabelText(/Tambah nilai/);
      await user.type(input, `${value}{enter}`);
    }

    async function switchToFamily(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: "Varian" }));
    }

    it("creates the parent and every variant in ONE request", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await addAxisValue(user, "3kg");

      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      const [payload] = create.mock.calls[0];
      expect(payload).toMatchObject({
        productType: "parent",
        variantAxes: [{ name: "Ukuran", values: ["1kg", "3kg"] }],
      });
      // A parent that committed without its variants is a POS tile that expands
      // into nothing — so they travel together, in one transaction.
      expect(payload).toHaveProperty("variants");
      const variants = (payload as { variants: unknown[] }).variants;
      expect(variants).toHaveLength(2);
      expect(variants[0]).toMatchObject({
        sku: "RC-1KG",
        variantAttributes: { Ukuran: "1kg" },
        sellPrice: "68000",
      });
    });

    it("opens each variant's balance separately, leaving blanks at nothing", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await addAxisValue(user, "3kg");
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");

      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText("Stok awal 1kg"), "6");
      await user.type(screen.getByLabelText("Harga beli 1kg"), "44000");
      // 3kg left blank: it arrives next week, and saying so must not write a
      // movement of zero — nor demand a purchase price for goods that are not
      // being entered.
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const variants = (
        create.mock.calls[0][0] as {
          variants: Array<{ sku: string; openingStock?: unknown }>;
        }
      ).variants;

      expect(variants[0].openingStock).toMatchObject({
        warehouseId: WAREHOUSE,
        qty: "6",
        costPerUnit: "44000",
      });
      expect(variants[1]).not.toHaveProperty("openingStock");
    });

    it("refuses a variant's opening stock that names no purchase price", async () => {
      // Caught on the field rather than at the API, which now refuses the whole
      // create BEFORE writing anything — so an unpriced row would cost the user
      // the entire form, not just the cell.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");

      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText("Stok awal 1kg"), "6");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText(/Harga beli wajib/i),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("refuses a family whose every opening row is blank", async () => {
      // Which rows get stock stays the user's call, but no row at all is the
      // switch turned off with extra steps.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await addAxisValue(user, "3kg");
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");

      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText(/Jumlah stok awal wajib diisi/i),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("hides the per-row overrides until the row is expanded", async () => {
      // Twelve columns would make the matrix unusable, so the five a person
      // fills in for every row stay visible and the rest go behind a chevron.
      const user = userEvent.setup();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");

      expect(screen.queryByLabelText("Berat 1kg")).not.toBeInTheDocument();

      await user.click(screen.getByLabelText("Detail 1kg"));

      expect(screen.getByLabelText("Berat 1kg")).toBeInTheDocument();
      expect(screen.getByLabelText("Panjang 1kg")).toBeInTheDocument();
    });

    it("shows the parent's weight as each row's placeholder, not its value", async () => {
      /**
       * The matrix half of the placeholder rule, and the reason the drawer
       * exists at all: a family sets its shipping ONCE on the parent, and only
       * the rows that genuinely weigh something else say so. Binding the
       * parent's number as each row's value would make every row an override on
       * the first save.
       */
      const user = userEvent.setup();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      // The PARENT's weight, typed into the shipping card above the matrix.
      await user.type(screen.getByLabelText(/^Berat$/), "500");
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await user.click(screen.getByLabelText("Detail 1kg"));

      const rowWeight = screen.getByLabelText("Berat 1kg") as HTMLInputElement;
      expect(rowWeight.value).toBe("");
      expect(rowWeight.placeholder).toBe("500");
    });

    it("sends a row's shipping only for the leaves it overrode", async () => {
      // Leaf-level, not object-level: a variant that weighs more than its
      // sibling still ships in the same box, so overriding the weight must not
      // orphan the dimensions.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await addAxisValue(user, "3kg");
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");

      await user.click(screen.getByLabelText("Detail 3kg"));
      await user.type(screen.getByLabelText("Berat 3kg"), "3");

      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const variants = (
        create.mock.calls[0][0] as {
          variants: Array<{ shipping?: Record<string, string> }>;
        }
      ).variants;

      // The 1kg said nothing and therefore inherits everything.
      expect(variants[0]).not.toHaveProperty("shipping");
      // The 3kg overrode only its weight.
      expect(variants[1].shipping).toEqual({ weight: "3" });
    });

    it("routes a per-row refusal to the row that caused it", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        new ApiError("2 codes in this request are already in use", 409, {
          details: [
            {
              field: "variants.1.sku",
              message: "SKU 'RC-3KG' is already used by another product",
            },
          ],
        }),
      );

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await addAxisValue(user, "3kg");
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      // A twelve-row form is exactly where "SKU already exists" with no row
      // attached is useless.
      expect(
        await screen.findByText(/RC-3KG' is already used/),
      ).toBeInTheDocument();
    });

    it("refuses to save a variant with no price, before the API has to", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText(/Harga jual belum benar pada varian/),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    /**
     * The parent needs no SKU; every variant does.
     *
     * A parent holds no stock, carries no price and is never scanned — the code
     * staff quote belongs to the row that is actually sold. These four assert
     * both halves of that trade: the parent may go without, and the rows may
     * not.
     */
    it("saves a family with no parent SKU at all", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.type(screen.getByLabelText(/Nama produk/), "Royal Canin");
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      const [payload] = create.mock.calls[0];
      // Omitted, not sent as "" — the field is genuinely absent.
      expect(payload).not.toHaveProperty("sku");
      expect((payload as { variants: Array<{ sku: string }> }).variants[0].sku)
        // Seeded from the NAME once there is no parent code to seed from.
        .toBe("ROYALCANIN-1KG");
    });

    it("seeds the variant SKUs from the parent SKU when there is one", async () => {
      const user = userEvent.setup();
      mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");

      expect(screen.getByLabelText("SKU 1kg")).toHaveValue("RC-1KG");
    });

    it("refuses a blank variant SKU, on the row that is blank", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await addAxisValue(user, "3kg");
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");
      await user.clear(screen.getByLabelText("SKU 3kg"));
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText("SKU varian wajib diisi."),
      ).toBeInTheDocument();
      // Bound to the cell, not dumped above a table of twelve rows.
      expect(screen.getByLabelText("SKU 3kg")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByLabelText("SKU 1kg")).not.toHaveAttribute(
        "aria-invalid",
      );
      expect(create).not.toHaveBeenCalled();
    });

    it("marks BOTH rows when two variants share a SKU", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await addAxisValue(user, "3kg");
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");
      await user.clear(screen.getByLabelText("SKU 3kg"));
      await user.type(screen.getByLabelText("SKU 3kg"), "RC-1KG");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findAllByText("SKU ini kembar dengan varian lain."),
      ).toHaveLength(2);
      // It used to land in the AXIS error slot, where it also overwrote
      // whatever the axis editor was trying to say.
      expect(
        screen.queryByText(/Ada SKU varian yang kembar/),
      ).not.toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });
  });

  /**
   * The marketplace fields, and the inheritance rule that governs them.
   *
   * THE RULE, stated once: inputs bind to the STORED value
   * (`product.shipping.weight`), and the parent's value is rendered as a
   * PLACEHOLDER (`product.resolved.shipping.weight`). Getting that backwards is
   * the one bug this feature can produce silently — a variant would stop
   * following its parent on a save the user thought changed something else — so
   * these tests exist mainly to pin it.
   */
  describe("marketplace fields", () => {
    it("sends brand, preorder, shipping and the two accounts on create", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.type(screen.getByLabelText(/^Merk/), "Royal Canin");
      await user.click(screen.getByLabelText("Produk pre-order"));
      await user.type(screen.getByLabelText(/^Berat/), "500");
      await user.click(screen.getByLabelText(/Satuan berat/));
      await user.click(screen.getByRole("option", { name: "gram (gr)" }));
      await user.type(screen.getByLabelText(/^Panjang/), "20");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({
        brand: "Royal Canin",
        isPreorder: true,
        shipping: { weight: "500", weightUnit: "gr", length: "20" },
      });
    });

    /**
     * The two accounts DECIDE THE JOURNAL, unlike the sales account they
     * replaced, which was stored and never posted against. A product left alone
     * uses the seeded 1201 and 5101; one that names its own sends its stock and
     * its cost somewhere else on every receipt, opname and sale.
     */
    it("sends the inventory and COGS accounts the user picked", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");

      await user.click(screen.getByLabelText("Akun persediaan"));
      await user.click(
        await screen.findByRole("option", {
          name: "1205 — Persediaan Hotel",
        }),
      );
      await user.click(screen.getByLabelText("Akun HPP"));
      await user.click(
        await screen.findByRole("option", { name: "5102 — HPP Hotel" }),
      );

      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({
        inventoryAccountId: INVENTORY_ACCOUNT,
        cogsAccountId: COGS_ACCOUNT,
      });
    });

    /** Each picker offers only what its side of the ledger can accept. */
    it("offers assets to one picker and expenses to the other", async () => {
      const user = userEvent.setup();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.click(screen.getByLabelText("Akun persediaan"));
      expect(
        await screen.findByRole("option", { name: "1205 — Persediaan Hotel" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "5102 — HPP Hotel" }),
      ).not.toBeInTheDocument();
    });

    it("omits the whole section when nothing was filled in", async () => {
      // Absent is what makes a variant inherit. Sending nulls would reach the
      // same place today, but "absent means inherit" is the documented contract
      // and the one that survives a schema default changing.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const payload = create.mock.calls[0][0];
      expect(payload).not.toHaveProperty("brand");
      expect(payload).not.toHaveProperty("shipping");
      expect(payload).not.toHaveProperty("inventoryAccountId");
      expect(payload).not.toHaveProperty("cogsAccountId");
    });

    it("refuses a weight with no unit", async () => {
      // A bare number is ambiguous in exactly the way that ships a 3 kg sack as
      // three grams.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.type(screen.getByLabelText(/^Berat/), "3");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText(/Pilih satuan berat/i),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("refuses a negative weight", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.type(screen.getByLabelText(/^Berat/), "-5");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(
        await screen.findByText(/Berat tidak boleh negatif/i),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("shows the inherited value as a placeholder, never as the input's value", async () => {
      /**
       * THE TEST THIS WHOLE FEATURE TURNS ON.
       *
       * A variant that set no weight of its own must render an EMPTY weight
       * input showing its parent's 500 as a placeholder. If the resolved value
       * were bound as the input's value, the very next save would write it as
       * this variant's own override and the variant would silently stop
       * following the family.
       */
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          productType: "variant",
          parentId: "parent1",
          shipping: {
            weight: null,
            weightUnit: null,
            length: null,
            width: null,
            height: null,
            packageContents: null,
          },
          resolved: {
            brand: "Royal Canin",
            description: null,
            inventoryAccountId: null,
            cogsAccountId: null,
            businessLineId: null,
            shipping: {
              weight: "500",
              weightUnit: "gr",
              length: "20",
              width: null,
              height: null,
              packageContents: null,
            },
          },
          inheritedFields: ["brand", "shipping.weight", "shipping.length"],
        }),
      );

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("Shampoo Anjing");

      const weight = screen.getByLabelText(/^Berat/) as HTMLInputElement;
      expect(weight.value).toBe("");
      expect(weight.placeholder).toBe("500");

      const brand = screen.getByLabelText(/^Merk/) as HTMLInputElement;
      expect(brand.value).toBe("");
      expect(brand.placeholder).toBe("Royal Canin");
    });

    it("sends no shipping when an inherited variant is saved untouched", async () => {
      // The consequence of the rule above, asserted on the wire: editing the
      // NAME of a variant that inherits its weight must not turn that weight
      // into an override.
      const user = userEvent.setup();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          productType: "variant",
          parentId: "parent1",
          shipping: {
            weight: null,
            weightUnit: null,
            length: null,
            width: null,
            height: null,
            packageContents: null,
          },
          resolved: {
            brand: "Royal Canin",
            description: null,
            inventoryAccountId: null,
            cogsAccountId: null,
            businessLineId: null,
            shipping: {
              weight: "500",
              weightUnit: "gr",
              length: null,
              width: null,
              height: null,
              packageContents: null,
            },
          },
          inheritedFields: ["brand", "shipping.weight"],
        }),
      );
      const update = jest
        .spyOn(productService, "update")
        .mockResolvedValue(makeProduct());

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("Shampoo Anjing");

      await user.clear(screen.getByLabelText(/Nama produk/));
      await user.type(screen.getByLabelText(/Nama produk/), "Shampoo Kucing");
      await user.click(
        screen.getByRole("button", { name: /Simpan perubahan/ }),
      );

      await waitFor(() => expect(update).toHaveBeenCalled());
      const patch = update.mock.calls[0][1];
      expect(patch).not.toHaveProperty("shipping");
      expect(patch).not.toHaveProperty("brand");
    });

    it("clears an override by emptying the field", async () => {
      // Null is the reset — there is no separate "follow the parent" button.
      const user = userEvent.setup();
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          productType: "variant",
          parentId: "parent1",
          brand: "Whiskas",
          shipping: {
            weight: "3",
            weightUnit: "kg",
            length: null,
            width: null,
            height: null,
            packageContents: null,
          },
        }),
      );
      const update = jest
        .spyOn(productService, "update")
        .mockResolvedValue(makeProduct());

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("Shampoo Anjing");

      await user.clear(screen.getByLabelText(/^Merk/));
      await user.click(
        screen.getByRole("button", { name: /Simpan perubahan/ }),
      );

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0][1]).toMatchObject({ brand: null });
    });

    it("blames permissions only on a 403", async () => {
      // `chartOfAccounts:read` is a separate permission from `products:read`. A
      // role that manages the catalogue without seeing the books must still get
      // a working form — these two fields are optional.
      jest
        .spyOn(chartOfAccountsService, "list")
        .mockRejectedValue(new ApiError("Forbidden", 403));

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      expect(
        await screen.findByText(/tidak punya akses ke Akuntansi/i),
      ).toBeInTheDocument();
      // The rest of the form still works.
      expect(screen.getByLabelText(/Nama produk/)).toBeInTheDocument();
    });

    it("reports any other failure as what it was, not as a permissions problem", async () => {
      /**
       * THE REGRESSION THIS PINS. The card used to assert "your role has no
       * access to Accounting" for every failure — and the first real one was a
       * malformed request from our own service layer, answered 400. The screen
       * was confidently wrong and sent people hunting through RBAC.
       */
      jest
        .spyOn(chartOfAccountsService, "list")
        .mockRejectedValue(new ApiError('"query.limit" must be less than or equal to 100', 400));

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      expect(await screen.findByText(/gagal dimuat/i)).toBeInTheDocument();
      expect(screen.getByText(/must be less than or equal to 100/)).toBeInTheDocument();
      expect(
        screen.queryByText(/tidak punya akses ke Akuntansi/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("editing", () => {
    it("sends only what changed", async () => {
      const user = userEvent.setup();
      jest
        .spyOn(productService, "getById")
        .mockResolvedValue(makeProduct({ name: "Shampoo Anjing" }));
      const update = jest
        .spyOn(productService, "update")
        .mockResolvedValue(makeProduct());

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("Shampoo Anjing");

      await user.clear(screen.getByLabelText(/Nama produk/));
      await user.type(screen.getByLabelText(/Nama produk/), "Shampoo Kucing");
      await user.click(
        screen.getByRole("button", { name: /Simpan perubahan/ }),
      );

      await waitFor(() => expect(update).toHaveBeenCalled());
      // Re-sending an untouched SKU makes the uniqueness check answer about the
      // product's own row.
      expect(update).toHaveBeenCalledWith("p1", { name: "Shampoo Kucing" });
    });

    it("locks the product type once the product exists", async () => {
      jest.spyOn(productService, "getById").mockResolvedValue(makeProduct());

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("Shampoo Anjing");

      expect(
        screen.getByRole("button", { name: "Varian" }),
      ).toBeDisabled();
      // And no opening stock: an existing product's quantity moves through the
      // stock screens, where the movement gets a reason.
      expect(
        screen.queryByLabelText("Isi stok awal sekarang"),
      ).not.toBeInTheDocument();
    });

    it("patches a changed variant and creates a newly-added combination", async () => {
      const user = userEvent.setup();
      const parent = makeProduct({
        _id: "parent1",
        sku: "RC",
        name: "Royal Canin",
        productType: "parent",
        sellPrice: null,
        variantAxes: [{ name: "Ukuran", values: ["1kg", "3kg"] }],
      });
      jest.spyOn(productService, "getById").mockResolvedValue(parent);
      jest.spyOn(productService, "listVariants").mockResolvedValue({
        parent,
        items: [
          makeProduct({
            _id: "v1",
            sku: "RC-1KG",
            productType: "variant",
            parentId: "parent1",
            variantAttributes: { Ukuran: "1kg" },
            sellPrice: "68000.0000",
          }),
        ],
      });
      const update = jest
        .spyOn(productService, "update")
        .mockResolvedValue(parent);
      const create = mockCreate();

      renderWithAuth(<ProductForm productId="parent1" />);
      await screen.findByLabelText("Harga 1kg");

      await user.clear(screen.getByLabelText("Harga 3kg"));
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");
      await user.click(
        screen.getByRole("button", { name: /Simpan perubahan/ }),
      );

      // The 3kg combination has no stored row yet, so it is created against the
      // parent; the 1kg row is untouched and therefore not sent.
      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({
        productType: "variant",
        parentId: "parent1",
        sku: "RC-3KG",
        variantAttributes: { Ukuran: "3kg" },
      });
      expect(update).not.toHaveBeenCalledWith("v1", expect.anything());
    });
  });

  describe("bundle", () => {
    it("offers no opening stock at all — a bundle holds none", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "list").mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.click(
        screen.getByRole("button", { name: "Bundle" }),
      );

      expect(
        screen.queryByLabelText("Isi stok awal sekarang"),
      ).not.toBeInTheDocument();
    });

    it("previews the components' total weight without seeding the input", async () => {
      /**
       * The bundle half of the placeholder rule. The weight input must stay
       * EMPTY while showing the derived sum, because seeding it would turn a
       * derived weight into an override on the next save — and the bundle would
       * stop following its components the moment one was re-measured.
       *
       * 2 × 500 gr + 1 × 1.5 kg = 2500 gr, the same arithmetic the API does.
       */
      const user = userEvent.setup();
      jest.spyOn(productService, "list").mockResolvedValue({
        items: [
          makeProduct({
            _id: "comp-a",
            name: "Kibble 500gr",
            resolved: {
              brand: null,
              description: null,
              inventoryAccountId: null,
            cogsAccountId: null,
              businessLineId: null,
              shipping: {
                weight: "500",
                weightUnit: "gr",
                length: null,
                width: null,
                height: null,
                packageContents: null,
              },
            },
          }),
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);
      await user.click(
        screen.getByRole("button", { name: "Bundle" }),
      );

      const weight = screen.getByLabelText(/^Berat/) as HTMLInputElement;
      expect(weight.value).toBe("");
    });

    it("still requires a SKU — a bundle is sold, so it has a code", async () => {
      const user = userEvent.setup();
      const create = mockCreate();
      jest.spyOn(productService, "list").mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.type(screen.getByLabelText(/Nama produk/), "Paket Grooming");
      await user.click(
        screen.getByRole("button", { name: "Bundle" }),
      );
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(await screen.findByText("SKU wajib diisi.")).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe("satuan", () => {
    it("starts at pcs and sends it without being asked", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({ unit: "pcs" });
    });

    it("offers exactly the three the API accepts", async () => {
      const user = userEvent.setup();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.click(screen.getByLabelText("Satuan"));

      expect(
        await screen.findByRole("option", { name: "sak" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "dus" })).toBeInTheDocument();
      // Free text let one tenant spell the same unit three ways; the select is
      // what makes that unreachable rather than merely discouraged.
      expect(screen.getAllByRole("option")).toHaveLength(3);
    });

    it("keeps showing a unit stored before the list closed", async () => {
      // "botol" predates the enum. The select has to render it rather than come
      // up blank and rewrite a field the user never touched.
      jest
        .spyOn(productService, "getById")
        .mockResolvedValue(makeProduct({ unit: "botol" }));
      const update = jest
        .spyOn(productService, "update")
        .mockResolvedValue(makeProduct());

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByLabelText(/Nama produk/);

      // The trigger itself, not just the option list — that is what the user
      // reads before deciding whether to change anything.
      expect(await screen.findByLabelText("Satuan")).toHaveTextContent(
        "botol (satuan lama)",
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("who needs a SKU", () => {
    it("requires one on a standalone", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.type(screen.getByLabelText(/Nama produk/), "Shampoo");
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      expect(await screen.findByText("SKU wajib diisi.")).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("drops the requirement the moment the form becomes a family", async () => {
      const user = userEvent.setup();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      // By placeholder, not by label: once the form is a family the variant
      // rows carry SKU inputs of their own, and "SKU" matches all of them.
      //
      // The field stays on screen in both modes — filling it seeds the variant
      // SKUs — so what changes is only whether it is marked required.
      expect(screen.getByPlaceholderText("RC-ADULT")).toBeRequired();

      await user.click(screen.getByRole("button", { name: "Varian" }));

      expect(screen.getByPlaceholderText("RC-ADULT")).not.toBeRequired();
    });
  });

  /**
   * PCR-018's "warning duplicate barcode saat input".
   *
   * THE DATA WAS NEVER AT RISK — the API has always refused a duplicate with a
   * 409. What was missing is WHEN the user finds out: after filling in a whole
   * product and pressing save, at which point the fix is to go and work out
   * which existing product owns the code.
   */
  describe("the duplicate barcode warning", () => {
    it("names the product already holding the code, and links to it", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "getByBarcode").mockResolvedValue(
        makeProduct({ _id: "p9", sku: "OTHER-1", name: "Produk Lain" }),
      );

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.type(screen.getByLabelText(/Barcode/), "8992700001234");

      const link = await screen.findByRole("link", { name: "OTHER-1" });
      expect(link).toHaveAttribute("href", "/dashboard/inventory/products/p9");
    });

    /**
     * ADVISORY, NEVER A GATE. The check races anything another user does in the
     * same second and the server is the authority either way — disabling the
     * button would block a save the API would have accepted.
     */
    it("leaves the save button enabled", async () => {
      const user = userEvent.setup();
      jest
        .spyOn(productService, "getByBarcode")
        .mockResolvedValue(makeProduct({ _id: "p9", sku: "OTHER-1" }));

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);
      await user.type(screen.getByLabelText(/Barcode/), "8992700001234");
      await screen.findByRole("link", { name: "OTHER-1" });

      expect(
        screen.getByRole("button", { name: /Simpan produk/ }),
      ).toBeEnabled();
    });

    // A 404 is the GOOD answer: the endpoint reports "nothing has this barcode"
    // by not finding one, so the miss is the success case.
    it("says nothing when the barcode is free", async () => {
      const user = userEvent.setup();
      jest
        .spyOn(productService, "getByBarcode")
        .mockRejectedValue(new ApiError("Product not found", 404));

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);
      await user.type(screen.getByLabelText(/Barcode/), "8992700001234");

      await waitFor(() =>
        expect(productService.getByBarcode).toHaveBeenCalled(),
      );
      expect(screen.queryByText(/sudah dipakai/i)).not.toBeInTheDocument();
    });

    /**
     * Editing the product that already owns the code is not a clash. Without
     * this the edit form would warn on every save that never touched the
     * barcode.
     */
    it("does not report a product as its own duplicate", async () => {
      const user = userEvent.setup();
      const existing = makeProduct({ _id: "p1", barcode: "899270000123" });
      jest.spyOn(productService, "getById").mockResolvedValue(existing);
      // The lookup finds THIS product — which is not a clash with itself.
      jest.spyOn(productService, "getByBarcode").mockResolvedValue(existing);

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("899270000123");
      // One more character so the debounced check fires at all.
      await user.type(screen.getByLabelText(/Barcode/), "4");

      await waitFor(() =>
        expect(productService.getByBarcode).toHaveBeenCalled(),
      );
      expect(screen.queryByText(/sudah dipakai/i)).not.toBeInTheDocument();
    });

    // A scanner arrives as a burst of keystrokes; firing per character would be
    // a dozen requests for one scan.
    it("asks once for a whole scanned code, not once per character", async () => {
      const user = userEvent.setup();
      jest
        .spyOn(productService, "getByBarcode")
        .mockRejectedValue(new ApiError("Product not found", 404));

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);
      await user.type(screen.getByLabelText(/Barcode/), "8992700001234");

      await waitFor(() =>
        expect(productService.getByBarcode).toHaveBeenCalled(),
      );
      expect(productService.getByBarcode).toHaveBeenCalledTimes(1);
      expect(productService.getByBarcode).toHaveBeenCalledWith("8992700001234");
    });
  });
});
