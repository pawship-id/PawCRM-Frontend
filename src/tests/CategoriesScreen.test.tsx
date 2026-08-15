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

    await userEvent.click(screen.getByRole("button", { name: /ubah nama/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /ubah nama/i }));
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

    await userEvent.click(screen.getByRole("button", { name: /ubah nama/i }));
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

  it("narrows to one status through the bar", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    await userEvent.click(screen.getByRole("button", { name: "Filter status" }));
    await userEvent.click(screen.getByRole("option", { name: "Nonaktif" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false }),
      ),
    );
  });

  it("keeps deleted categories behind Filter lain, applied on Terapkan", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    await userEvent.click(screen.getByRole("button", { name: "Filter lain" }));
    await userEvent.click(
      screen.getByLabelText("Tampilkan kategori terhapus"),
    );

    // Ticking inside the popover composes; it does not query.
    expect(list).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeDeleted: true }),
      ),
    );
  });
});

/**
 * Below 600px both triggers collapse into one button opening a panel, exactly
 * as the catalogue does.
 *
 * jsdom implements no matchMedia at all, so every test above lands on the
 * toolbar's wide fallback. These install one that says "narrow" — the only way
 * to reach this branch, since the two arrangements are deliberately not both in
 * the DOM.
 */
describe("CategoriesToolbar on a narrow screen", () => {
  beforeEach(() => {
    window.matchMedia = ((media: string) => ({
      media,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    delete (window as Partial<Window & typeof globalThis>).matchMedia;
    jest.restoreAllMocks();
  });

  it("puts both filters behind one button instead of a row of triggers", async () => {
    mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    // Not hidden — absent. Two controls named "Filter status" on one page is
    // one control to look at and two to a screen reader.
    expect(
      screen.queryByRole("button", { name: "Filter lain" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");

    expect(
      within(panel).getByRole("button", { name: "Filter status" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByLabelText("Tampilkan kategori terhapus"),
    ).toBeInTheDocument();
  });

  it("holds the panel's fields as a draft until Terapkan", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");
    expect(list).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Filter status" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Nonaktif" }));

    // Status auto-applies on the wide bar; inside a panel it waits.
    expect(list).toHaveBeenCalledTimes(1);

    await userEvent.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false }),
      ),
    );
  });

  it("counts what is applied on the button, so a closed panel is not a hidden filter", async () => {
    mockList([makeCategory()]);

    renderWithAuth(<CategoriesScreen />);
    await screen.findByText("Makanan Kucing");

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await userEvent.click(
      within(panel).getByLabelText("Tampilkan kategori terhapus"),
    );
    await userEvent.click(within(panel).getByRole("button", { name: "Terapkan" }));

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

    await userEvent.click(screen.getByRole("button", { name: /hapus/i }));

    const dialog = screen.getByRole("dialog");
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

    await userEvent.click(screen.getByRole("button", { name: /hapus/i }));
    const dialog = screen.getByRole("dialog");
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

    expect(
      screen.queryByRole("button", { name: /ubah nama/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Dihapus")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /pulihkan/i }));
    const dialog = screen.getByRole("dialog");
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
    expect(
      screen.queryByRole("button", { name: /hapus/i }),
    ).not.toBeInTheDocument();
  });
});
