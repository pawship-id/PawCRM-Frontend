import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { CategoriesScreen } from "@/features/categories";
import { CategoriesTable } from "@/features/categories/components/CategoriesTable";
import { categoryService } from "@/services/category.service";
import { ApiError } from "@/services/api-error";
import type { Category, PageResult } from "@/types/api";
import type { MediaAsset } from "@/types/inventory";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Mutations fire a SweetAlert2 toast on success; mock the library so no real
// dialog is created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    _id: "c1",
    tenantId: "t1",
    kind: "product",
    // Posting defaults — null is the ordinary case, and posts exactly where the
    // system did before categories had a tier at all.
    salesAccountId: null,
    cogsAccountId: null,
    inventoryAccountId: null,
    isActive: true,
    name: "Makanan Kucing",
    parentId: null,
    parent: null,
    description: null,
    image: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** An asset shaped as the API stores one, for the rows that carry a picture. */
function makeImage(): MediaAsset {
  return {
    mediaType: "image",
    url: "http://localhost:5000/media/t1/category/2026/08/a.webp",
    storageKey: "t1/category/2026/08/a.webp",
    driver: "local",
    mimeType: "image/webp",
    thumbUrl: "http://localhost:5000/media/t1/category/2026/08/a_thumb.webp",
  };
}

function page(items: Category[]): PageResult<Category> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

/**
 * Opens the one filter panel and returns it.
 *
 * Every filter lives inside it — status, the deleted toggle and the ordering —
 * so each filter assertion starts here. The trigger's text carries a count
 * (`Filter (1)`); its accessible name does not, so it is found by the stable
 * half.
 */
async function openFilters() {
  await userEvent.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

/**
 * Opens a row's kebab menu. Every row action lives behind it — the same shape
 * the catalogue uses — so each action assertion starts here, which is also the
 * cheapest way to notice if the trigger stops being reachable by its name.
 */
async function openRowMenu(name = "Makanan Kucing") {
  await userEvent.click(
    screen.getByRole("button", { name: `Aksi untuk ${name}` }),
  );
  return screen.getByRole("menu");
}

/** Stubs the list call, which every screen render performs on mount. */
function mockList(items: Category[]) {
  return jest.spyOn(categoryService, "list").mockResolvedValue(page(items));
}

describe("CategoriesScreen", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lists the tenant's categories", async () => {
    mockList([makeCategory(), makeCategory({ _id: "c2", name: "Perawatan" })]);

    renderWithAuth(<CategoriesScreen />);

    expect(await screen.findByText("Makanan Kucing")).toBeInTheDocument();
    expect(screen.getByText("Perawatan")).toBeInTheDocument();
  });

  it("shows the empty state rather than a blank table", async () => {
    mockList([]);

    renderWithAuth(<CategoriesScreen />);

    expect(
      await screen.findByText(/belum ada kategori yang cocok/i),
    ).toBeInTheDocument();
  });

  it("surfaces a failed load instead of showing an empty list", async () => {
    jest
      .spyOn(categoryService, "list")
      .mockRejectedValue(new ApiError("Server error", 500));

    renderWithAuth(<CategoriesScreen />);

    // An error rendered as "no categories" would read as a true answer about
    // the tenant's data when it is really a broken request.
    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
  });

  it("sends the create button to its own route, as a real link", async () => {
    mockList([]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText(/belum ada kategori/i);

    // An <a href>, not a button wired to router.push: middle-click and "buka di
    // tab baru" are what a link buys, and the form outgrew the dialog it used
    // to open — see CategoryForm.
    expect(screen.getByRole("link", { name: /kategori baru/i })).toHaveAttribute(
      "href",
      "/dashboard/inventory/categories/new",
    );
  });

  it("narrows to one level through the panel", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Filter tingkat" }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Kategori induk saja" }),
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    // Narrowed on the SERVER, through the one parameter that carries all four
    // states — a client-side filter would leave the row count describing a
    // different set from the one on screen.
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ parentId: "none" }),
      ),
    );
  });

  it("asks for sub-categories with the other level word", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Filter tingkat" }),
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Sub-kategori saja" }),
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ parentId: "sub" }),
      ),
    );
  });

  it("opens on every category, retired ones included", async () => {
    const list = mockList([makeCategory({ isActive: false })]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    // No isActive in the first request: this screen manages the label set, and
    // the retired half is the part most likely to need attention.
    const [query] = list.mock.calls[0];
    expect(query).not.toHaveProperty("isActive");
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();
  });

  it("narrows to one status through the panel", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Filter status" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Nonaktif" }));
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    // isActive rather than a status string, and `false` rather than absent —
    // this is the pair that was silently dropped between the hook and the
    // request until category.service.test.ts pinned it.
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false }),
      ),
    );
  });

  it("holds every field as a draft until Terapkan", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");
    expect(list).toHaveBeenCalledTimes(1);

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByLabelText("Tampilkan kategori terhapus"),
    );

    // Composing a query does not query — the whole reason for a panel.
    expect(list).toHaveBeenCalledTimes(1);

    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeDeleted: true }),
      ),
    );
  });

  it("re-orders the list through the panel, by a name the API accepts", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    // Stated rather than omitted: every page of a walk has to agree.
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "newest" }),
    );

    const panel = await openFilters();
    await userEvent.click(within(panel).getByRole("button", { name: "Urutkan" }));
    await userEvent.click(screen.getByRole("option", { name: "Nama A–Z" }));
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "nameAsc" }),
      ),
    );
  });

  it("counts what is applied on the button, but never the ordering", async () => {
    mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    let panel = await openFilters();
    await userEvent.click(
      within(panel).getByLabelText("Tampilkan kategori terhapus"),
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    expect(
      await screen.findByRole("button", { name: "Filter" }),
    ).toHaveTextContent("Filter (1)");

    // Every list has an ordering, so counting it would put a (1) over a screen
    // showing everything and teach people to ignore the number.
    panel = await openFilters();
    await userEvent.click(within(panel).getByRole("button", { name: "Urutkan" }));
    await userEvent.click(screen.getByRole("option", { name: "Terlama" }));
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    expect(
      await screen.findByRole("button", { name: "Filter" }),
    ).toHaveTextContent("Filter (1)");
  });
});

describe("CategoriesTable", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shows the description under the name", async () => {
    renderWithAuth(
      <CategoriesTable
        categories={[makeCategory({ description: "Basah dan kering" })]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText("Basah dan kering")).toBeInTheDocument();
  });

  it("renders the thumbnail, not the full-size image", async () => {
    const { container } = renderWithAuth(
      <CategoriesTable
        categories={[makeCategory({ image: makeImage() })]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    // A list of forty categories must not download forty full-size images —
    // the whole reason the 320px derivative exists.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "http://localhost:5000/media/t1/category/2026/08/a_thumb.webp",
    );
  });

  it("draws a placeholder rather than a broken image when there is none", async () => {
    const { container } = renderWithAuth(
      <CategoriesTable
        categories={[makeCategory({ image: null })]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    // Most categories will never have a picture; an <img> with no src is a
    // broken-image icon in every browser.
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Makanan Kucing")).toBeInTheDocument();
  });

  it("shows a sub-category's parent above its own name", async () => {
    renderWithAuth(
      <CategoriesTable
        categories={[
          makeCategory({
            name: "Kering",
            parentId: "p1",
            parent: { _id: "p1", name: "Makanan Kucing" },
          }),
        ]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    // Two rows both called "Kering" are unreadable without it — which is the
    // ambiguity sub-categories were added to remove, not to create.
    expect(screen.getByText(/Makanan Kucing/)).toBeInTheDocument();
    expect(screen.getByText("Kering")).toBeInTheDocument();
  });

  it("shows no trail on a top-level category", async () => {
    renderWithAuth(
      <CategoriesTable
        categories={[makeCategory({ name: "Makanan Kucing", parent: null })]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.queryByText("›", { exact: false })).not.toBeInTheDocument();
  });

  it("points Edit at that category's own route", async () => {
    renderWithAuth(
      <CategoriesTable
        categories={[makeCategory()]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    const menu = await openRowMenu();

    // A real link inside the menu item, so middle-click and "buka di tab baru"
    // work — the row used to raise this to the screen, which turned it into a
    // dialog.
    expect(
      within(menu).getByRole("menuitem", { name: /^edit$/i }),
    ).toHaveAttribute("href", "/dashboard/inventory/categories/c1");
  });

  it("confirms and deletes a category, then refetches", async () => {
    const remove = jest
      .spyOn(categoryService, "remove")
      .mockResolvedValue(makeCategory());
    const onChanged = jest.fn();

    renderWithAuth(
      <CategoriesTable
        categories={[makeCategory()]}
        loading={false}
        onChanged={onChanged}
      />,
    );

    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /hapus/i }),
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^hapus$/i }),
    );

    expect(remove).toHaveBeenCalledWith("c1");
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows the server's refusal verbatim, so the product count survives", async () => {
    jest
      .spyOn(categoryService, "remove")
      .mockRejectedValue(
        new ApiError(
          "7 product(s) are still filed under this category. Move them to another category first.",
          409,
        ),
      );

    renderWithAuth(
      <CategoriesTable
        categories={[makeCategory()]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /hapus/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^hapus$/i }),
    );

    // "7" is the whole value of the message — a generic failure would leave the
    // user with no idea how much is in the way.
    expect(await screen.findByText(/7 product/i)).toBeInTheDocument();
  });

  it("offers restore, not edit or delete, on a deleted category", async () => {
    const restore = jest
      .spyOn(categoryService, "restore")
      .mockResolvedValue(makeCategory());

    renderWithAuth(
      <CategoriesTable
        categories={[makeCategory({ deletedAt: "2026-02-01T00:00:00.000Z" })]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText("Dihapus")).toBeInTheDocument();

    const menu = await openRowMenu();
    expect(
      within(menu).queryByRole("menuitem", { name: /^edit$/i }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /hapus/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /pulihkan/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^pulihkan$/i }),
    );

    expect(restore).toHaveBeenCalledWith("c1");
  });

  it("hides the Actions column entirely for a read-only role", () => {
    renderWithAuth(
      <CategoriesTable
        categories={[makeCategory()]}
        loading={false}
        onChanged={jest.fn()}
      />,
      {
        isSuperAdmin: false,
        permissions: [{ feature: "categories", actions: ["read"] }],
      },
    );

    expect(
      screen.queryByRole("columnheader", { name: /aksi/i }),
    ).not.toBeInTheDocument();
    // Not even the kebab: unlike a product row, a category has no detail page,
    // so a menu here would open onto nothing.
    expect(
      screen.queryByRole("button", { name: /^Aksi untuk/ }),
    ).not.toBeInTheDocument();
  });
});
