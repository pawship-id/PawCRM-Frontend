import { screen, waitFor, within } from "@testing-library/react";
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
/*
  THE RICH-TEXT EDITOR IS MOCKED, and it is worth saying why in a suite about a
  product form.

  `RichTextEditor` builds a full ProseMirror instance on every mount. Not one of
  the 88 tests below drives it — `description` appears only as `null` in the
  fixtures — so the suite was constructing 88 editors to test SKU validation.
  That was most of its 40-second runtime and why it timed out under a parallel
  run while passing alone.

  The mock is a real textarea with the same accessible name (see
  src/components/__mocks__/RichTextEditor.tsx), so a test that later wants to
  type a description still can.
*/
jest.mock("@/components/RichTextEditor");

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
    isConsignment: false,
    isPreorder: false,
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
        description: null,
        image: null,
        parentId: null,
        parent: null,
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
                businessLineId: null,
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
                businessLineId: null,
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
            description: null,
            image: null,
            parentId: null,
            parent: null,
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
            description: null,
            image: null,
            parentId: null,
            parent: null,
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

    /**
     * ZERO IS REFUSED, and this test used to assert the opposite.
     *
     * The old rule let it through because donated stock and free samples are
     * real — which they are. What it missed is that this is one of the three
     * paths that ESTABLISH a product's weighted average, so a zero taken here is
     * not corrected later: it BECOMES the average, every sale of those goods is
     * costed at nothing and reads as 100% margin, and nobody notices until a
     * stocktake. A mistyped zero is far commoner than a genuinely free opening
     * balance, and only one of the two is silent.
     */
    it("refuses a purchase price of zero — it would fix HPP at zero", async () => {
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

      expect(
        await screen.findByText(/Harga beli harus lebih dari 0/i),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
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

    it("demands an expiry date when the goods expire", async () => {
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

      // The API refuses the movement without one; catching it here keeps the
      // refusal on the field rather than on an already-created product. The
      // CODE is not demanded — a blank one is filled with `sku:tanggal-expired`.
      expect(
        await screen.findByText(/tanggal kedaluwarsa wajib/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/kode batch wajib/i)).not.toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("saves an expiring product whose opening lot has a date but no code", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText(/Produk punya masa kedaluwarsa/));
      await user.click(screen.getByLabelText("Isi stok awal sekarang"));
      await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
      await user.type(screen.getByLabelText(/Harga beli per unit/), "30000");
      await user.type(
        screen.getByLabelText(/Tanggal kedaluwarsa/),
        "2027-03-01",
      );
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      const { openingStock } = create.mock.calls[0][0] as unknown as {
        openingStock: Record<string, unknown>;
      };
      expect(openingStock.expiryDate).toBe("2027-03-01");
      expect(openingStock).not.toHaveProperty("batchCode");
    });

    it("says so when the product was created but its stock was not", async () => {
      const user = userEvent.setup();
      mockCreate({
        openingStock: {
          posted: false,
          entries: [],
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

    it("asks for what is MISSING before what is merely wrong", async () => {
      // The same ladder every mode is ranked on: an empty required field first,
      // a badly-formed one after. A brand that is 200 characters long is a real
      // refusal, but it is not why the save cannot happen.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.type(screen.getByLabelText(/Nama produk/), "Shampoo");
      await user.type(screen.getByLabelText(/^SKU/), "SHAMPOO");
      await user.type(screen.getByLabelText(/Merk/), "x".repeat(121));
      // Harga jual left empty.
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() =>
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({ title: "Harga jual wajib diisi." }),
        ),
      );
      // Both are marked and captioned; only the order of the telling differs.
      expect(screen.getByLabelText(/Merk/)).toHaveAccessibleDescription(
        "Maksimal 120 karakter.",
      );

      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() =>
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({ title: "Maksimal 120 karakter." }),
        ),
      );
      expect(create).not.toHaveBeenCalled();
    });

    it("binds a duplicate-SKU conflict to the SKU field", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        // Verbatim from the API, which answers in English.
        new ApiError("Product with SKU 'SHAMPOO' already exists", 409, {
          details: [
            {
              field: "sku",
              message: "SKU 'SHAMPOO' is already used by another product",
            },
          ],
        }),
      );

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      // Bound to the field, so the red is where the fix has to be typed.
      await waitFor(() =>
        expect(screen.getByLabelText(/^SKU/)).toHaveAccessibleDescription(
          /sudah dipakai produk lain/i,
        ),
      );
      // And said out loud, top-right, because a banner at the top of a form the
      // user has scrolled past is a message nobody reads before pressing Simpan
      // a second time.
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: "error",
          position: "top-end",
          title: expect.stringMatching(/sudah dipakai produk lain/i),
        }),
      );
      expect(push).not.toHaveBeenCalled();
    });

    it("says a duplicate barcode in Indonesian, on the barcode field", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        // Verbatim from the API, which answers in English.
        new ApiError("Barcode '8991' is already used by another product", 409, {
          details: [
            {
              field: "barcode",
              message: "Barcode '8991' is already used by another product",
            },
          ],
        }),
      );

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.type(screen.getByLabelText(/^Barcode/), "8991");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() =>
        expect(screen.getByLabelText(/^Barcode/)).toHaveAccessibleDescription(
          "Barcode 8991 sudah dipakai produk lain.",
        ),
      );
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: "error",
          title: "Barcode 8991 sudah dipakai produk lain.",
        }),
      );
    });

    it("leaves a complaint that is NOT a conflict exactly as the server said it", async () => {
      // The rewrite is matched on the phrase, not on the field: a length or
      // format refusal arrives on `sku` too, and turning that into "sudah
      // dipakai" would tell the user the opposite of what happened.
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        new ApiError("Validation failed", 400, {
          details: [{ field: "sku", message: "sku must be at most 64 chars" }],
        }),
      );

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() =>
        expect(screen.getByLabelText(/^SKU/)).toHaveAccessibleDescription(
          "sku must be at most 64 chars",
        ),
      );
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

      expect(await screen.findByText(/Harga beli wajib/i)).toBeInTheDocument();
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
      // attached is useless — and it is said in Indonesian, like everything
      // else on this screen.
      await waitFor(() =>
        expect(screen.getByLabelText("SKU 3kg")).toHaveAccessibleDescription(
          "SKU RC-3KG sudah dipakai produk lain.",
        ),
      );
      // The row that was fine stays clean.
      expect(screen.getByLabelText("SKU 1kg")).not.toHaveAccessibleDescription(
        /sudah dipakai/,
      );
      // The toast names the row, since the table may be scrolled away from it.
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: "error",
          position: "top-end",
          title: "Varian 3kg: SKU RC-3KG sudah dipakai produk lain.",
        }),
      );
    });

    it("puts a duplicate BARCODE on the barcode cell, not on the SKU one", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        new ApiError("Barcode '8991' is already used by another product", 409, {
          details: [
            {
              field: "variants.1.barcode",
              message: "Barcode '8991' is already used by another product",
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
      await user.type(screen.getByLabelText("Barcode 3kg"), "8991");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      // MARKED, not captioned — the sentence is in the toast, which names the
      // row, and the cell carries the red.
      await waitFor(() =>
        expect(screen.getByLabelText("Barcode 3kg")).toHaveAttribute(
          "aria-invalid",
          "true",
        ),
      );
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: "error",
          position: "top-end",
          title: "Varian 3kg: Barcode 8991 sudah dipakai produk lain.",
        }),
      );
      // The bug this test exists for: the message used to land on the SKU input,
      // pointing the user at the one code in the row that was actually fine.
      expect(screen.getByLabelText("SKU 3kg")).not.toHaveAccessibleDescription(
        /sudah dipakai/,
      );
      expect(screen.getByLabelText("SKU 3kg")).not.toHaveAttribute(
        "aria-invalid",
      );
    });

    it("describes no variants at all until an axis has values", async () => {
      const user = userEvent.setup();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await switchToFamily(user);

      // The cartesian product of nothing is `[[]]`, and the table used to
      // render that faithfully: "1 kombinasi", a nameless row, a SKU of "-",
      // and a refusal reading "Harga jual belum benar pada varian ."
      expect(
        await screen.findByText("Belum ada kombinasi"),
      ).toBeInTheDocument();
      expect(screen.getByText("0 kombinasi")).toBeInTheDocument();
      expect(screen.queryByLabelText(/^SKU /)).not.toBeInTheDocument();
    });

    /**
     * THE TOAST AND THE RED TEXT SAY THE SAME THING.
     *
     * Every field that was refused is marked and captioned where it sits — that
     * is how the user sees which ones there are. The toast repeats ONE of them
     * verbatim: the one to fix first. Fix it, save again, and the toast moves on
     * to whatever is now at the top. Two surfaces, one sentence at a time, never
     * a summary that matches nothing on the page.
     */
    it("says the same sentence in the toast as under the field, and moves on", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      // Nothing filled in at all: a missing name and a missing SKU.
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() =>
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({
            icon: "error",
            title: "Nama produk wajib diisi.",
          }),
        ),
      );
      // The very same words, under the very input the toast is about.
      expect(screen.getByLabelText(/Nama produk/)).toHaveAccessibleDescription(
        "Nama produk wajib diisi.",
      );
      // The others are marked and captioned too — the toast just is not about
      // them yet.
      expect(screen.getByLabelText(/^SKU/)).toHaveAccessibleDescription(
        "SKU wajib diisi.",
      );

      // Name filled in — the toast moves to what is now first.
      await user.type(screen.getByLabelText(/Nama produk/), "Shampoo");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() =>
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({
            icon: "error",
            title: "SKU wajib diisi.",
          }),
        ),
      );
      expect(create).not.toHaveBeenCalled();
    });

    /**
     * ONE PROBLEM PER SAVE, in the order the work has to be done.
     *
     * A blank price and a duplicate barcode are not equally urgent: the price
     * is why the save cannot happen at all, and being told about the barcode
     * first asks the user to fix the smaller thing and watch the save fail
     * again. So the price is named, and the barcode waits its turn.
     */
    it("asks for the missing price first, and the duplicate barcode only after", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user, { name: "Royal Canin", sku: "RC" });
      await switchToFamily(user);
      await addAxisValue(user, "1kg");
      await addAxisValue(user, "3kg");
      // Both wrong at once: no price on one row, one barcode on two.
      await user.type(screen.getByLabelText("Harga 1kg"), "68000");
      await user.type(screen.getByLabelText("Barcode 1kg"), "123");
      await user.type(screen.getByLabelText("Barcode 3kg"), "123");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() =>
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({
            icon: "error",
            title: "Varian 3kg: Harga jual belum benar.",
          }),
        ),
      );

      // Price fixed — now, and only now, the barcode is what stands in the way.
      await user.type(screen.getByLabelText("Harga 3kg"), "185000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() =>
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({
            icon: "error",
            title: "Barcode 123 kembar dengan varian lain.",
          }),
        ),
      );
      expect(create).not.toHaveBeenCalled();

      // And once that is fixed too, nothing stands in the way.
      await user.clear(screen.getByLabelText("Barcode 3kg"));
      await user.type(screen.getByLabelText("Barcode 3kg"), "124");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    });

    it("says a barcode repeated between two rows in Indonesian, without asking the API", async () => {
      // The API refuses a request that repeats a code BEFORE it looks at what is
      // stored, and that refusal ("appears more than once in this request") is a
      // different English sentence from the conflict one — which is how an
      // untranslated string used to reach the toast. Caught on the form now, so
      // the round trip never happens.
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
      await user.type(screen.getByLabelText("Barcode 1kg"), "8991");
      await user.type(screen.getByLabelText("Barcode 3kg"), "8991");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      // The mistake itself, naming the code — not a count of the red boxes.
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            icon: "error",
            title: "Barcode 8991 kembar dengan varian lain.",
          }),
        ),
      );
      // Both offenders marked, because either one is the one to change.
      expect(screen.getByLabelText("Barcode 1kg")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByLabelText("Barcode 3kg")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(create).not.toHaveBeenCalled();
    });

    it("translates the API's repeated-code refusal if one ever reaches it", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        new ApiError("This request repeats a value that must be unique", 400, {
          details: [
            {
              field: "variants.1.barcode",
              message: "Barcode '8991' appears more than once in this request",
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

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            icon: "error",
            title:
              "Varian 3kg: Barcode 8991 dipakai lebih dari sekali di form ini.",
          }),
        ),
      );
    });

    it("never puts an English sentence in the toast", async () => {
      // A refusal this form cannot translate — a Joi complaint, a new backend
      // message — keeps its exact words ON THE FIELD, where precision helps, and
      // the toast falls back to Indonesian rather than reciting English.
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        new ApiError("Validation failed", 400, {
          details: [
            {
              field: "variants.1.sellPrice",
              message: "sellPrice must be a positive decimal",
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

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            icon: "error",
            title:
              "Varian 3kg: Ada isian yang ditolak server — lihat kolom yang ditandai merah.",
          }),
        ),
      );
      // The server's own words survive next to the row they are about.
      expect(
        await screen.findByText("sellPrice must be a positive decimal"),
      ).toBeInTheDocument();
    });

    it("names one problem to fix, not a count, when several come back", async () => {
      const user = userEvent.setup();
      jest.spyOn(productService, "create").mockRejectedValue(
        new ApiError("2 codes in this request are already in use", 409, {
          details: [
            {
              field: "variants.0.sku",
              message: "SKU 'RC-1KG' is already used by another product",
            },
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

      // Both rows still say their own refusal on the field. The toast names ONE
      // thing to go and fix — a family can come back with twelve, and neither a
      // recital of twelve nor a bare count is worth reading.
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            icon: "error",
            title: "Varian 1kg: SKU RC-1KG sudah dipakai produk lain.",
          }),
        ),
      );
      expect(screen.getByLabelText("SKU 1kg")).toHaveAccessibleDescription(
        "SKU RC-1KG sudah dipakai produk lain.",
      );
      expect(screen.getByLabelText("SKU 3kg")).toHaveAccessibleDescription(
        "SKU RC-3KG sudah dipakai produk lain.",
      );
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
        await screen.findByText("Harga jual belum benar."),
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
        await screen.findAllByText("SKU RC-1KG kembar dengan varian lain."),
      ).toHaveLength(2);
      // TWO CELLS, ONE PROBLEM. The toast says the mistake once — counting the
      // marked inputs instead would read as "2 isian belum benar", which tells
      // the user only that something somewhere is wrong.
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: "error",
          title: "SKU RC-1KG kembar dengan varian lain.",
        }),
      );
      // It used to land in the AXIS error slot, where it also overwrote
      // whatever the axis editor was trying to say.
      expect(
        screen.queryByText(/Ada SKU varian yang kembar/),
      ).not.toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    /**
     * Ticking rows and filling a column in one go.
     *
     * What is pinned here is the RULE, not the widget: a bulk apply writes the
     * ticked rows and NOTHING ELSE, an empty value clears rather than does
     * nothing, and a tick cannot survive the combination it was put on. Twelve
     * rows priced identically is the ordinary case this exists for; twelve rows
     * where an eleventh was written by accident is the failure it must not have.
     */
    describe("bulk edit", () => {
      /** Picks a column in the bulk strip and applies `value` to the ticks. */
      async function applyBulk(
        user: ReturnType<typeof userEvent.setup>,
        column: string,
        value: string,
      ) {
        await user.click(screen.getByLabelText("Kolom yang diubah massal"));
        await user.click(await screen.findByRole("option", { name: column }));
        if (value)
          await user.type(screen.getByLabelText("Nilai massal"), value);
        await user.click(
          screen.getByRole("button", {
            name: value ? "Terapkan" : "Kosongkan",
          }),
        );
      }

      it("shows no strip at all until something is ticked", async () => {
        const user = userEvent.setup();
        mockCreate();

        renderWithAuth(<ProductForm />);
        await screen.findByLabelText(/Nama produk/);

        await fillCommon(user, { name: "Royal Canin", sku: "RC" });
        await switchToFamily(user);
        await addAxisValue(user, "1kg");

        expect(screen.queryByText(/varian dipilih/)).not.toBeInTheDocument();
      });

      it("writes one price onto every row the header box ticked", async () => {
        const user = userEvent.setup();
        const create = mockCreate();

        renderWithAuth(<ProductForm />);
        await screen.findByLabelText(/Nama produk/);

        await fillCommon(user, { name: "Royal Canin", sku: "RC" });
        await switchToFamily(user);
        await addAxisValue(user, "1kg");
        await addAxisValue(user, "3kg");
        await addAxisValue(user, "10kg");

        await user.click(screen.getByLabelText("Pilih semua varian"));
        expect(screen.getByText("3 varian dipilih")).toBeInTheDocument();

        await applyBulk(user, "Harga jual", "68000");

        expect(screen.getByLabelText("Harga 1kg")).toHaveValue("68000");
        expect(screen.getByLabelText("Harga 3kg")).toHaveValue("68000");
        expect(screen.getByLabelText("Harga 10kg")).toHaveValue("68000");

        await user.click(screen.getByRole("button", { name: /Simpan produk/ }));
        await waitFor(() => expect(create).toHaveBeenCalled());
        const variants = (
          create.mock.calls[0][0] as { variants: Array<{ sellPrice: string }> }
        ).variants;
        expect(variants.map((variant) => variant.sellPrice)).toEqual([
          "68000",
          "68000",
          "68000",
        ]);
      });

      it("leaves an unticked row exactly as it was", async () => {
        const user = userEvent.setup();
        mockCreate();

        renderWithAuth(<ProductForm />);
        await screen.findByLabelText(/Nama produk/);

        await fillCommon(user, { name: "Royal Canin", sku: "RC" });
        await switchToFamily(user);
        await addAxisValue(user, "1kg");
        await addAxisValue(user, "3kg");

        await user.click(screen.getByLabelText("Pilih 1kg"));
        await applyBulk(user, "Harga jual", "68000");

        expect(screen.getByLabelText("Harga 1kg")).toHaveValue("68000");
        // The whole reason the tick exists. A bulk edit that reached the row
        // nobody chose would be worse than no bulk edit at all.
        expect(screen.getByLabelText("Harga 3kg")).toHaveValue("");
      });

      it("clears the column when the value is left blank", async () => {
        const user = userEvent.setup();
        mockCreate();

        renderWithAuth(<ProductForm />);
        await screen.findByLabelText(/Nama produk/);

        await fillCommon(user, { name: "Royal Canin", sku: "RC" });
        await switchToFamily(user);
        await addAxisValue(user, "1kg");
        await addAxisValue(user, "3kg");

        await user.click(screen.getByLabelText("Pilih semua varian"));
        await applyBulk(user, "Harga jual", "68000");
        // The button renames itself rather than silently doing nothing — an
        // empty box is how a column is emptied, and it has to say so first.
        await applyBulk(user, "Harga jual", "");

        expect(screen.getByLabelText("Harga 1kg")).toHaveValue("");
        expect(screen.getByLabelText("Harga 3kg")).toHaveValue("");
      });

      it("reaches the per-row overrides without opening a single drawer", async () => {
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

        await user.click(screen.getByLabelText("Pilih semua varian"));
        await applyBulk(user, "Berat", "1200");

        await user.click(screen.getByRole("button", { name: /Simpan produk/ }));
        await waitFor(() => expect(create).toHaveBeenCalled());
        const variants = (
          create.mock.calls[0][0] as {
            variants: Array<{ shipping?: Record<string, string> }>;
          }
        ).variants;
        // Only the leaf that was applied: the rest of the box still resolves
        // from the parent, which is the same rule a typed override follows.
        expect(variants[0].shipping).toEqual({ weight: "1200" });
        expect(variants[1].shipping).toEqual({ weight: "1200" });
      });

      it("fills the opening balance from the same ticks", async () => {
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
        await user.click(screen.getAllByLabelText("Pilih semua varian")[0]);

        // The strip appears over BOTH tables from the one set of ticks, so the
        // second copy — the one over the opening table — is scoped into rather
        // than reached by index across the whole screen.
        const openingStrip = screen.getAllByText("2 varian dipilih")[1]
          .parentElement as HTMLElement;
        await user.click(
          within(openingStrip).getByLabelText("Kolom yang diubah massal"),
        );
        await user.click(
          await screen.findByRole("option", { name: "Stok awal" }),
        );
        await user.type(
          within(openingStrip).getByLabelText("Nilai massal"),
          "6",
        );
        await user.click(
          within(openingStrip).getByRole("button", { name: "Terapkan" }),
        );

        expect(screen.getByLabelText("Stok awal 1kg")).toHaveValue("6");
        expect(screen.getByLabelText("Stok awal 3kg")).toHaveValue("6");

        await user.type(screen.getByLabelText("Harga beli 1kg"), "44000");
        await user.type(screen.getByLabelText("Harga beli 3kg"), "120000");
        await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

        await waitFor(() => expect(create).toHaveBeenCalled());
        const variants = (
          create.mock.calls[0][0] as {
            variants: Array<{ openingStock?: { qty: string } }>;
          }
        ).variants;
        expect(variants[0].openingStock).toMatchObject({ qty: "6" });
        expect(variants[1].openingStock).toMatchObject({ qty: "6" });
      });

      it("forgets a tick whose combination was deleted", async () => {
        const user = userEvent.setup();
        mockCreate();

        renderWithAuth(<ProductForm />);
        await screen.findByLabelText(/Nama produk/);

        await fillCommon(user, { name: "Royal Canin", sku: "RC" });
        await switchToFamily(user);
        await addAxisValue(user, "1kg");
        await addAxisValue(user, "3kg");

        await user.click(screen.getByLabelText("Pilih semua varian"));
        expect(screen.getByText("2 varian dipilih")).toBeInTheDocument();

        await user.click(screen.getByLabelText("Hapus 3kg"));

        // Not "2 dipilih" over a table showing one row — and re-adding 3kg must
        // not bring its old tick back with it.
        expect(screen.getByText("1 varian dipilih")).toBeInTheDocument();
        await addAxisValue(user, "3kg");
        expect(screen.getByText("1 varian dipilih")).toBeInTheDocument();
      });

      it("offers no SKU and no barcode — both must stay unique", async () => {
        const user = userEvent.setup();
        mockCreate();

        renderWithAuth(<ProductForm />);
        await screen.findByLabelText(/Nama produk/);

        await fillCommon(user, { name: "Royal Canin", sku: "RC" });
        await switchToFamily(user);
        await addAxisValue(user, "1kg");
        await user.click(screen.getByLabelText("Pilih semua varian"));

        await user.click(screen.getByLabelText("Kolom yang diubah massal"));
        const columns = (await screen.findAllByRole("option")).map(
          (option) => option.textContent,
        );
        // Stamping one code onto twelve rows is eleven rows the API refuses,
        // discovered after the value was typed.
        expect(columns).not.toContain("SKU");
        expect(columns).not.toContain("Barcode");
        expect(columns).toContain("Harga jual");
      });
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
     * Titipan — the tenant holds the goods and does not own them.
     *
     * Three assertions rather than one, because the field's rule is not "send a
     * boolean": it is owned by a standalone or a parent, COPIED down to every
     * variant by the API, and refused on the two types that cannot hold it. An
     * input rendered where the API answers 400 is a save that fails on a field
     * the user never chose.
     */
    it("states all three flags on create, even the ones left unticked", async () => {
      // The flags are the exception to "omit what is blank" that governs every
      // other field on this form. Those store null to mean "ask the parent"; a
      // flag has no such state, so the payload says yes or no rather than
      // saying nothing and relying on the API to guess the same way.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Produk pre-order"));
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({
        isPreorder: true,
        hasExpiry: false,
        isConsignment: false,
      });
    });

    it("sends the titipan flag on create, true or false", async () => {
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByLabelText("Produk konsinyasi (titipan)"));
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({ isConsignment: true });
    });

    it("states the flag even when it is false, unlike the optional fields", async () => {
      // Sent rather than omitted: `hasExpiry` beside it is sent unconditionally
      // too, and a family relies on this value to stamp its variant rows. An
      // omitted `false` would leave that to two defaults agreeing.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await fillCommon(user);
      await user.type(screen.getByLabelText(/Harga jual/), "45000");
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({ isConsignment: false });
    });

    it("does not offer the flag on a bundle, which owns no stock", async () => {
      const user = userEvent.setup();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      expect(
        screen.getByLabelText("Produk konsinyasi (titipan)"),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Bundle" }));

      expect(
        screen.queryByLabelText("Produk konsinyasi (titipan)"),
      ).not.toBeInTheDocument();
    });

    it("does not offer the flag on a variant, which is told by its parent", async () => {
      // A variant opens this form in standalone mode — everything else it is
      // asked is the same — so hiding this one is a decision the form has to
      // make from `productType`, not from the mode.
      jest.spyOn(productService, "getById").mockResolvedValue(
        makeProduct({
          productType: "variant",
          parentId: "parent1",
          isConsignment: true,
        }),
      );

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("Shampoo Anjing");

      expect(
        screen.queryByLabelText("Produk konsinyasi (titipan)"),
      ).not.toBeInTheDocument();
    });

    it("patches the flag when it is toggled on an existing product", async () => {
      const user = userEvent.setup();
      jest
        .spyOn(productService, "getById")
        .mockResolvedValue(makeProduct({ isConsignment: false }));
      const update = jest
        .spyOn(productService, "update")
        .mockResolvedValue(makeProduct());

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("Shampoo Anjing");

      await user.click(screen.getByLabelText("Produk konsinyasi (titipan)"));
      await user.click(
        screen.getByRole("button", { name: /Simpan produk/ }),
      );

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0][1]).toMatchObject({ isConsignment: true });
    });

    it("leaves the flag out of a patch that did not touch it", async () => {
      // The API refuses an empty patch, and a field echoed back unchanged is one
      // that can collide with itself — the same rule every other field here
      // follows.
      const user = userEvent.setup();
      jest
        .spyOn(productService, "getById")
        .mockResolvedValue(makeProduct({ isConsignment: true }));
      const update = jest
        .spyOn(productService, "update")
        .mockResolvedValue(makeProduct());

      renderWithAuth(<ProductForm productId="p1" />);
      await screen.findByDisplayValue("Shampoo Anjing");

      await user.clear(screen.getByLabelText(/Nama produk/));
      await user.type(screen.getByLabelText(/Nama produk/), "Shampoo Kucing");
      await user.click(
        screen.getByRole("button", { name: /Simpan produk/ }),
      );

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0][1]).not.toHaveProperty("isConsignment");
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
        screen.getByRole("button", { name: /Simpan produk/ }),
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
        screen.getByRole("button", { name: /Simpan produk/ }),
      );

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0][1]).toMatchObject({ brand: null });
    });

    /**
     * The failures with no field to point at — a 500, a timeout, a malformed
     * body. Each one has to answer two questions in Indonesian: what happened,
     * and is my product saved. The server's own words ("Internal server error",
     * "Request timed out after 15000ms") answer neither and are not shown.
     */
    describe("a failure with nothing to point at", () => {
      const cases: Array<[string, ApiError, RegExp]> = [
        [
          "a server fault is not blamed on the user",
          new ApiError("Internal server error", 500),
          /Server sedang bermasalah — bukan isian Anda/,
        ],
        [
          "a timeout says the product is not saved",
          new ApiError("Request timed out after 15000ms", 0, {
            isNetworkError: true,
          }),
          /Server terlalu lama merespons/,
        ],
        [
          "a dead connection points at the connection",
          ApiError.network(),
          /Periksa koneksi internet/,
        ],
        [
          "a field-less 400 asks the user to re-check what they changed",
          new ApiError("Malformed JSON in request body", 400),
          /Data produk ditolak server/,
        ],
        [
          "an expired session says to sign in again",
          new ApiError("Unauthorized", 401),
          /Sesi Anda sudah berakhir/,
        ],
      ];

      it.each(cases)("%s", async (_name, failure, expected) => {
        const user = userEvent.setup();
        jest.spyOn(productService, "create").mockRejectedValue(failure);
        // The server's words go to the console, not to the screen.
        jest.spyOn(console, "error").mockImplementation(() => {});

        renderWithAuth(<ProductForm />);
        await screen.findByLabelText(/Nama produk/);

        await fillCommon(user);
        await user.type(screen.getByLabelText(/Harga jual/), "45000");
        await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

        await waitFor(() =>
          expect(toast).toHaveBeenLastCalledWith(
            expect.objectContaining({
              icon: "error",
              title: expect.stringMatching(expected),
            }),
          ),
        );
        // Never the server's own sentence, whatever it was.
        expect(toast).not.toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(
              /error|timed out|Malformed|Unauthorized/i,
            ),
          }),
        );
      });
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
        .mockRejectedValue(
          new ApiError('"query.limit" must be less than or equal to 100', 400),
        );

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      expect(await screen.findByText(/gagal dimuat/i)).toBeInTheDocument();
      expect(
        screen.getByText(/must be less than or equal to 100/),
      ).toBeInTheDocument();
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
        screen.getByRole("button", { name: /Simpan produk/ }),
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

      expect(screen.getByRole("button", { name: "Varian" })).toBeDisabled();
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
        screen.getByRole("button", { name: /Simpan produk/ }),
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

      await user.click(screen.getByRole("button", { name: "Bundle" }));

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
      await user.click(screen.getByRole("button", { name: "Bundle" }));

      const weight = screen.getByLabelText(/^Berat/) as HTMLInputElement;
      expect(weight.value).toBe("");
    });

    it("refuses one thing at a time here too, missing before malformed", async () => {
      // A bundle with no components is the same kind of unfinished as a
      // standalone with no name — ranked by what the sentence asks for, not by
      // which card it came from.
      const user = userEvent.setup();
      const create = mockCreate();

      renderWithAuth(<ProductForm />);
      await screen.findByLabelText(/Nama produk/);

      await user.click(screen.getByRole("button", { name: "Bundle" }));
      await fillCommon(user, { name: "Paket Grooming", sku: "PKT-1" });
      await user.click(screen.getByRole("button", { name: /Simpan produk/ }));

      // Components first: it is checked before the price, and both are missing.
      await waitFor(() =>
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({
            icon: "error",
            title: "Bundle butuh minimal satu komponen.",
          }),
        ),
      );
      // Said in red where it belongs, exactly as the toast said it.
      expect(
        screen.getByText("Bundle butuh minimal satu komponen."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Harga bundle/)).toHaveAccessibleDescription(
        "Harga bundle wajib diisi.",
      );
      expect(create).not.toHaveBeenCalled();
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
      await user.click(screen.getByRole("button", { name: "Bundle" }));
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
      jest
        .spyOn(productService, "getByBarcode")
        .mockResolvedValue(
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
