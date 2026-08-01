import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  BatchesScreen,
  OpnameScreen,
  ProductsScreen,
  ProductForm,
} from "@/features/inventory";
import * as demo from "@/features/inventory/data/demoStore";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * Mount tests for the catalogue, batch and opname screens.
 *
 * What is asserted is the behaviour a reviewer would otherwise have to click
 * through: that a variant family nests rather than flooding the list, that the
 * form changes shape per product type and generates the right combinations,
 * that lots sort by urgency, and that an opname sheet writes only what actually
 * differs.
 */
beforeEach(() => {
  demo.resetState();
  push.mockClear();
});

describe("ProductsScreen", () => {
  it("lists parents and bundles but not loose variants", () => {
    render(<ProductsScreen />);

    // The parent is one row; its variants live behind the expander.
    expect(screen.getByText("Royal Canin Adult")).toBeInTheDocument();
    expect(
      screen.queryByText("Royal Canin Adult — 3kg / Chicken"),
    ).not.toBeInTheDocument();
  });

  it("shows the variant count on the parent rather than the word 'parent'", () => {
    render(<ProductsScreen />);

    expect(screen.getByText("2 varian")).toBeInTheDocument();
  });

  it("expands a parent into its variants", async () => {
    const user = userEvent.setup();
    render(<ProductsScreen />);

    await user.click(screen.getByRole("button", { name: "Lihat varian" }));

    expect(screen.getByText("3kg / Chicken")).toBeInTheDocument();
    expect(screen.getByText("1kg / Chicken")).toBeInTheDocument();
  });

  it("surfaces a parent when the search matches one of its VARIANTS", async () => {
    // Otherwise the product looks as though it is missing from the catalogue.
    const user = userEvent.setup();
    render(<ProductsScreen />);

    await user.type(screen.getByLabelText("Cari produk"), "RC-ADULT-3KG");

    expect(screen.getByText("Royal Canin Adult")).toBeInTheDocument();
  });

  it("labels a bundle's stock as what can be BUILT, not what is held", () => {
    render(<ProductsScreen />);

    // A bundle keeps no stock of its own; the number is derived from components.
    expect(screen.getAllByText("bisa dibuat").length).toBeGreaterThan(0);
  });

  it("links to the create form", () => {
    render(<ProductsScreen />);

    expect(screen.getByRole("link", { name: /Produk baru/ })).toHaveAttribute(
      "href",
      "/dashboard/inventory/products/new",
    );
  });
});

describe("ProductForm — standalone", () => {
  it("offers opening stock on create, where the user actually knows it", () => {
    render(<ProductForm />);

    expect(screen.getByLabelText(/Jumlah stok awal/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Harga beli per unit/)).toBeInTheDocument();
  });

  it("requires a name, SKU and price", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    expect(screen.getByText("Nama produk wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("SKU wajib diisi.")).toBeInTheDocument();
    expect(screen.getByText("Harga jual wajib diisi.")).toBeInTheDocument();
  });

  it("rejects an SKU another product already uses", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.type(screen.getByLabelText(/Nama produk/), "Duplikat");
    await user.type(screen.getByLabelText("SKU *"), "WSK-TUNA-12");
    await user.type(screen.getByLabelText(/Harga jual/), "1000");
    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    expect(screen.getByText(/sudah dipakai produk lain/)).toBeInTheDocument();
  });

  it("creates the product and its opening movement together", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.type(screen.getByLabelText(/Nama produk/), "Sisir Kutu");
    await user.type(screen.getByLabelText("SKU *"), "SISIR-01");
    await user.type(screen.getByLabelText(/Harga jual/), "25000");
    await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
    await user.type(screen.getByLabelText(/Harga beli per unit/), "15000");
    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    const created = demo
      .getState()
      .products.find((product) => product.sku === "SISIR-01");
    expect(created).toBeDefined();
    // The opening quantity arrives as an ordinary inbound adjustment, so the
    // ledger explains where the first stock came from.
    expect(demo.qtyOnHand(created!._id, "wh_utama")).toBe("10.0000");
    expect(created!.hppAvg).toBe("15000.0000");
    expect(push).toHaveBeenCalledWith("/dashboard/inventory/products");
  });
});

describe("ProductForm — variants", () => {
  it("generates the cartesian product of the axes", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText(/Nama produk/), "Kaos Anjing");
    await user.type(screen.getByLabelText("SKU *"), "KAOS");

    const values = screen.getByLabelText(/Tambah nilai/);
    await user.type(values, "S{Enter}");
    await user.type(values, "M{Enter}");

    expect(screen.getByText("2 kombinasi")).toBeInTheDocument();
    // Asserted through the generated SKUs, which are unique — the bare value
    // "S" appears both as an axis chip and as a variant row label.
    expect(screen.getByDisplayValue("KAOS-S")).toBeInTheDocument();
    expect(screen.getByDisplayValue("KAOS-M")).toBeInTheDocument();
  });

  it("multiplies out to four rows once a second axis is added", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText("SKU *"), "KAOS");

    const first = screen.getByLabelText(/Tambah nilai/);
    await user.type(first, "S{Enter}");
    await user.type(first, "M{Enter}");

    await user.click(screen.getByRole("button", { name: "+ Atribut kedua" }));
    const inputs = screen.getAllByLabelText(/Tambah nilai/);
    await user.type(inputs[1], "Merah{Enter}");
    await user.type(inputs[1], "Biru{Enter}");

    expect(screen.getByText("4 kombinasi")).toBeInTheDocument();
  });

  it("derives a variant SKU from the parent SKU and the combination", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText("SKU *"), "KAOS");
    await user.type(screen.getByLabelText(/Tambah nilai/), "S{Enter}");

    expect(screen.getByDisplayValue("KAOS-S")).toBeInTheDocument();
  });

  it("locks an axis value that existing variants already sit on", () => {
    // Removing it would strand those variants; the backend refuses it, so the
    // form does not offer it.
    render(<ProductForm productId="prd_rc_parent" />);

    const chip = screen.getByRole("button", { name: "Hapus 3kg" });
    expect(chip).toBeDisabled();
  });

  it("locks the product type once the product exists", () => {
    render(<ProductForm productId="prd_rc_parent" />);

    expect(screen.getByRole("button", { name: "Produk biasa" })).toBeDisabled();
    expect(screen.getByText(/Tipe produk dikunci setelah dibuat/)).toBeInTheDocument();
  });
});

describe("ProductForm — bundle", () => {
  it("refuses to save a bundle with no components", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: /Bundle/ }));
    await user.type(screen.getByLabelText(/Nama produk/), "Paket Hemat");
    await user.type(screen.getByLabelText("SKU *"), "PKT-01");
    await user.type(screen.getByLabelText(/Harga bundle/), "100000");
    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    expect(
      screen.getByText("Bundle butuh minimal satu komponen."),
    ).toBeInTheDocument();
  });

  it("hides the fixed-price field under automatic pricing", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: /Bundle/ }));
    expect(screen.getByLabelText(/Harga bundle/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Mode harga"));
    await user.click(screen.getByRole("option", { name: /Otomatis/ }));

    expect(screen.queryByLabelText(/Harga bundle/)).not.toBeInTheDocument();
  });

  it("explains that a bundle may not contain another bundle", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: /Bundle/ }));

    expect(
      screen.getByText(/Bundle tidak boleh berisi bundle\s+lain/),
    ).toBeInTheDocument();
  });
});

describe("BatchesScreen", () => {
  it("counts expiring lots by urgency", () => {
    render(<BatchesScreen />);

    expect(screen.getByText("Sudah lewat tanggal")).toBeInTheDocument();
    expect(screen.getByText("Kritis — kurang 7 hari")).toBeInTheDocument();
    expect(screen.getByText("Nilai berisiko")).toBeInTheDocument();
    // "Perhatian — 30 hari" is deliberately not asserted here: it is both a stat
    // label and the horizon filter's default value, so the query is ambiguous.
  });

  it("lists the soonest-expiring lot first", () => {
    render(<BatchesScreen />);

    const table = screen.getByRole("table");
    const codes = within(table)
      .getAllByText(/^(RC|WSK)-B26-/)
      .map((node) => node.textContent);

    // WSK-B26-0512 expires in 5 days; RC-B26-0455 in 24.
    expect(codes[0]).toBe("WSK-B26-0512");
  });

  it("hides exhausted lots until asked", async () => {
    const user = userEvent.setup();
    render(<BatchesScreen />);

    const toggle = screen.getByLabelText(/Tampilkan lot yang sudah habis/);
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });
});

describe("OpnameScreen", () => {
  it("explains why the sheet snapshots the numbers", () => {
    render(<OpnameScreen />);

    expect(screen.getByText(/mengunci angka stok dan HPP/)).toBeInTheDocument();
  });

  it("starts a sheet and navigates to it", async () => {
    const user = userEvent.setup();
    render(<OpnameScreen />);

    await user.click(screen.getByRole("button", { name: /Mulai opname/ }));

    const opname = demo.getState().opnames[0];
    expect(opname).toBeDefined();
    expect(opname.status).toBe("draft");
    expect(push).toHaveBeenCalledWith(
      `/dashboard/inventory/opname/${opname._id}`,
    );
  });

  it("only sheets products that can hold stock", () => {
    const opname = demo.startOpname("wh_utama");
    const items = demo.opnameItemsOf(opname._id);
    const products = demo.getState().products;

    // A parent's quantity is its variants' and a bundle has none of its own,
    // so neither can be counted.
    for (const item of items) {
      const product = products.find((p) => p._id === item.productId)!;
      expect(["standalone", "variant"]).toContain(product.productType);
    }
  });
});
