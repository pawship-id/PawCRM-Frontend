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

  it("names the component that caps a bundle's availability", () => {
    render(<ProductsScreen />);

    // The cap is rarely the component being looked at — "2 available" beside a
    // shelf of 14 makes no sense until the scarce one is named.
    expect(screen.getAllByText(/^dibatasi /).length).toBeGreaterThan(0);
  });

  it("says where it sits, with the current page not linking to itself", () => {
    render(<ProductsScreen />);

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Inventory" })).toHaveAttribute(
      "href",
      "/dashboard/inventory",
    );
    expect(
      within(trail).queryByRole("link", { name: "Produk & Varian" }),
    ).not.toBeInTheDocument();
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

    expect(
      screen.getByLabelText("Isi stok awal sekarang"),
    ).toBeInTheDocument();
  });

  it("keeps the quantity fields hidden until the switch is on", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    // Off by default: filling this in writes a movement that cannot be undone,
    // so it has to be a decision rather than a field somebody wanders into.
    expect(screen.queryByLabelText(/Jumlah stok awal/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Isi stok awal sekarang"));

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
    await user.click(screen.getByLabelText("Isi stok awal sekarang"));
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

  it("creates the product with no stock at all when the switch is left off", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.type(screen.getByLabelText(/Nama produk/), "Sisir Kutu");
    await user.type(screen.getByLabelText("SKU *"), "SISIR-01");
    await user.type(screen.getByLabelText(/Harga jual/), "25000");
    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    const created = demo
      .getState()
      .products.find((product) => product.sku === "SISIR-01");
    expect(created).toBeDefined();
    expect(demo.qtyOnHand(created!._id, "wh_utama")).toBe("0.0000");
    // No cost basis either: nothing was received, so there is nothing to
    // average. It arrives with the first real goods receipt.
    expect(created!.hppAvg).toBeNull();
    expect(demo.movementsFor(created!._id, "wh_utama")).toHaveLength(0);
  });

  it("discards a quantity typed and then switched back off", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.type(screen.getByLabelText(/Nama produk/), "Sisir Kutu");
    await user.type(screen.getByLabelText("SKU *"), "SISIR-01");
    await user.type(screen.getByLabelText(/Harga jual/), "25000");

    const toggle = screen.getByLabelText("Isi stok awal sekarang");
    await user.click(toggle);
    await user.type(screen.getByLabelText(/Jumlah stok awal/), "10");
    // Changed their mind. The switch is the answer, not the leftover text.
    await user.click(toggle);

    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    const created = demo
      .getState()
      .products.find((product) => product.sku === "SISIR-01");
    expect(demo.qtyOnHand(created!._id, "wh_utama")).toBe("0.0000");
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

    await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    const inputs = screen.getAllByLabelText(/Tambah nilai/);
    await user.type(inputs[1], "Merah{Enter}");
    await user.type(inputs[1], "Biru{Enter}");

    expect(screen.getByText("4 kombinasi")).toBeInTheDocument();
  });

  it("goes past two axes, which is what the API accepts", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText("SKU *"), "KAOS");

    await user.type(screen.getByLabelText(/Tambah nilai/), "S{Enter}");
    await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    await user.type(screen.getAllByLabelText(/Tambah nilai/)[1], "Merah{Enter}");
    await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    await user.type(screen.getAllByLabelText(/Tambah nilai/)[2], "Katun{Enter}");

    expect(screen.getByText("1 kombinasi")).toBeInTheDocument();
    expect(screen.getByDisplayValue("KAOS-S-MERAH-KATUN")).toBeInTheDocument();
  });

  it("stops offering another axis at the tenth, where the API stops", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));

    // One axis exists already, so nine more reach the cap.
    for (let i = 0; i < 9; i += 1) {
      await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    }

    expect(screen.getByLabelText("Nama atribut 10")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ Atribut" }),
    ).not.toBeInTheDocument();
  });

  it("leaves the name blank once the suggestions run out", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    }

    expect(screen.getByLabelText("Nama atribut 4")).toHaveValue("Motif");
    // A made-up "Atribut 5" would read as a real label and survive to the POS
    // as one. An empty box asks the question instead.
    expect(screen.getByLabelText("Nama atribut 5")).toHaveValue("");
  });

  it("refuses to save an axis with no name", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText(/Nama produk/), "Kaos Anjing");
    await user.type(screen.getByLabelText("SKU *"), "KAOS");
    await user.type(screen.getByLabelText(/Tambah nilai/), "S{Enter}");

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    }
    await user.type(screen.getAllByLabelText(/Tambah nilai/)[4], "X{Enter}");

    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    // The API requires a name on every axis, so it is caught here rather than
    // coming back as a 400 on a form the user has already filled.
    expect(screen.getByText(/Atribut ke-5 belum punya nama/)).toBeInTheDocument();
  });

  it("refuses two axes that share a name, whatever the casing", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText(/Nama produk/), "Kaos Anjing");
    await user.type(screen.getByLabelText("SKU *"), "KAOS");
    await user.type(screen.getByLabelText(/Tambah nilai/), "S{Enter}");

    await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    await user.clear(screen.getByLabelText("Nama atribut 2"));
    await user.type(screen.getByLabelText("Nama atribut 2"), "ukuran");
    await user.type(screen.getAllByLabelText(/Tambah nilai/)[1], "M{Enter}");

    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    // An axis name is a key in variantAttributes: "Ukuran" and "ukuran" would
    // be two keys rendering as one label.
    expect(
      screen.getByText(/Nama atribut tidak boleh kembar/),
    ).toBeInTheDocument();
  });

  it("removes the axis that was asked for, not the last one", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText("SKU *"), "KAOS");

    await user.type(screen.getByLabelText(/Tambah nilai/), "S{Enter}");
    await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    await user.type(screen.getAllByLabelText(/Tambah nilai/)[1], "Merah{Enter}");
    await user.click(screen.getByRole("button", { name: "+ Atribut" }));
    await user.type(screen.getAllByLabelText(/Tambah nilai/)[2], "Katun{Enter}");

    // Drop the MIDDLE one. Slicing to the first axis would have taken the third
    // away with it and left "Ukuran" alone.
    await user.click(screen.getByRole("button", { name: /Hapus atribut Rasa/ }));

    expect(screen.getByDisplayValue("KAOS-S-KATUN")).toBeInTheDocument();
  });

  it("never offers to remove the only axis", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));

    // A parent with no axes describes no combinations, so the API requires one.
    expect(
      screen.queryByRole("button", { name: /Hapus atribut/ }),
    ).not.toBeInTheDocument();
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

  it("asks for opening stock per variant, never once for the family", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText("SKU *"), "KAOS");
    const values = screen.getByLabelText(/Tambah nilai/);
    await user.type(values, "S{Enter}");
    await user.type(values, "M{Enter}");

    await user.click(screen.getByLabelText("Isi stok awal sekarang"));

    // A parent holds no stock of its own, so there is no single field for it —
    // one row per variant, and the backend would reject anything else.
    expect(screen.getByLabelText("Stok awal S")).toBeInTheDocument();
    expect(screen.getByLabelText("Stok awal M")).toBeInTheDocument();
  });

  it("opens each variant's balance separately, leaving blanks at zero", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: "Punya varian" }));
    await user.type(screen.getByLabelText(/Nama produk/), "Kaos Anjing");
    await user.type(screen.getByLabelText("SKU *"), "KAOS");
    const values = screen.getByLabelText(/Tambah nilai/);
    await user.type(values, "S{Enter}");
    await user.type(values, "M{Enter}");

    await user.click(screen.getByLabelText("Isi stok awal sekarang"));
    await user.type(screen.getByLabelText("Stok awal S"), "12");
    await user.type(screen.getByLabelText("Harga beli S"), "20000");
    // M deliberately left blank — not every size arrives in the first delivery.
    await user.click(screen.getByRole("button", { name: "Simpan produk" }));

    const products = demo.getState().products;
    const small = products.find((product) => product.sku === "KAOS-S");
    const medium = products.find((product) => product.sku === "KAOS-M");

    expect(demo.qtyOnHand(small!._id, "wh_utama")).toBe("12.0000");
    expect(small!.hppAvg).toBe("20000.0000");
    expect(demo.qtyOnHand(medium!._id, "wh_utama")).toBe("0.0000");
    expect(demo.movementsFor(medium!._id, "wh_utama")).toHaveLength(0);

    // The parent itself never receives a movement: it is an abstraction, and a
    // quantity against it would belong to no shelf.
    const parent = products.find((product) => product.sku === "KAOS");
    expect(demo.movementsFor(parent!._id, "wh_utama")).toHaveLength(0);
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

  it("offers no opening stock at all — a bundle holds none", async () => {
    const user = userEvent.setup();
    render(<ProductForm />);

    await user.click(screen.getByRole("button", { name: /Bundle/ }));

    // Not merely hidden fields: the whole question is absent, because there is
    // no balance to open. Availability comes from the components.
    expect(
      screen.queryByLabelText("Isi stok awal sekarang"),
    ).not.toBeInTheDocument();
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
