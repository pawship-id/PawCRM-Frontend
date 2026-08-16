import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { CategoriesScreen } from "@/features/categories";
import { CategoriesTable } from "@/features/categories/components/CategoriesTable";
import { categoryService } from "@/services/category.service";
import { ApiError } from "@/services/api-error";
import type { Category, PageResult } from "@/types/api";

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
    isActive: true,
    name: "Makanan Kucing",
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
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

  it("creates a category from the dialog, then refetches", async () => {
    const list = mockList([]);
    const create = jest
      .spyOn(categoryService, "create")
      .mockResolvedValue(makeCategory({ name: "Aksesoris" }));

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText(/belum ada kategori/i);

    await userEvent.click(
      screen.getByRole("button", { name: /kategori baru/i }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /nama kategori/i }),
      "Aksesoris",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /buat kategori/i }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ name: "Aksesoris" }),
    );
    // The list is re-read so the new row appears without a manual reload.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("trims the name before sending it", async () => {
    mockList([]);
    const create = jest
      .spyOn(categoryService, "create")
      .mockResolvedValue(makeCategory());

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText(/belum ada kategori/i);

    await userEvent.click(
      screen.getByRole("button", { name: /kategori baru/i }),
    );
    await userEvent.type(screen.getByRole("textbox", { name: /nama kategori/i }), "  Snack  ");
    await userEvent.click(
      screen.getByRole("button", { name: /buat kategori/i }),
    );

    // Otherwise " Snack " and "Snack" become two categories the unique index
    // considers different and every human reads as one.
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Snack" }));
  });

  it("refuses an empty name without calling the API", async () => {
    mockList([]);
    const create = jest.spyOn(categoryService, "create");

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText(/belum ada kategori/i);

    await userEvent.click(
      screen.getByRole("button", { name: /kategori baru/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /buat kategori/i }),
    );

    expect(
      await screen.findByText(/nama kategori wajib diisi/i),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("puts a duplicate-name 409 on the field, and mentions deleted categories", async () => {
    mockList([]);
    jest
      .spyOn(categoryService, "create")
      .mockRejectedValue(new ApiError("Category already exists", 409));

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText(/belum ada kategori/i);

    await userEvent.click(
      screen.getByRole("button", { name: /kategori baru/i }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /nama kategori/i }),
      "Makanan Kucing",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /buat kategori/i }),
    );

    // The unique index is partial on deletedAt: null, so a deleted category
    // still holds its name — the surprising case, said out loud.
    expect(
      await screen.findByText(/sudah dipakai kategori lain/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/sudah dihapus/i)).toBeInTheDocument();
  });

  it("renames through the same dialog, pre-filled", async () => {
    mockList([makeCategory()]);
    const update = jest
      .spyOn(categoryService, "update")
      .mockResolvedValue(makeCategory({ name: "Makanan Anjing" }));

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^edit$/i }),
    );

    const field = screen.getByRole("textbox", { name: /nama kategori/i });
    expect(field).toHaveValue("Makanan Kucing");

    await userEvent.clear(field);
    await userEvent.type(field, "Makanan Anjing");
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("c1", { name: "Makanan Anjing" }),
    );
  });

  it("does not send a rename that changes nothing", async () => {
    mockList([makeCategory()]);
    const update = jest.spyOn(categoryService, "update");

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^edit$/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    // The API rejects an empty patch body, and "save" on an untouched form is
    // a close that should not look like a failure.
    expect(update).not.toHaveBeenCalled();
  });

  it("retires a category without touching its name", async () => {
    mockList([makeCategory()]);
    const update = jest
      .spyOn(categoryService, "update")
      .mockResolvedValue(makeCategory({ isActive: false }));

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^edit$/i }),
    );
    await userEvent.click(screen.getByRole("switch", { name: /aktif/i }));
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    // The name is deliberately absent: sending it would run the 409 check
    // against the category's own name for an edit that never touched it.
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("c1", { isActive: false }),
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
        onEdit={jest.fn()}
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
        onEdit={jest.fn()}
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
        onEdit={jest.fn()}
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
        onEdit={jest.fn()}
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
