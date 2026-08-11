import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { ProductForm } from "@/features/inventory";
import { productService } from "@/services/product.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
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
      await user.click(screen.getByRole("button", { name: "Punya varian" }));
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
      // 3kg left blank: it arrives next week, and saying so must not write a
      // movement of zero.
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
      });
      expect(variants[1]).not.toHaveProperty("openingStock");
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
        screen.getByRole("button", { name: "Punya varian" }),
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
        screen.getByRole("button", { name: /Bundle \/ multi-satuan/ }),
      );

      expect(
        screen.queryByLabelText("Isi stok awal sekarang"),
      ).not.toBeInTheDocument();
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
        screen.getByRole("button", { name: /Bundle \/ multi-satuan/ }),
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

      await user.click(screen.getByRole("button", { name: "Punya varian" }));

      expect(screen.getByPlaceholderText("RC-ADULT")).not.toBeRequired();
    });
  });
});
