import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { SupplierCategoriesScreen } from "@/features/purchasing";
import { supplierCategoryService } from "@/services/supplierCategory.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, SupplierCategory } from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Mutations fire a SweetAlert2 toast on success; mock the library so no real
// dialog is created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function makeCategory(
  overrides: Partial<SupplierCategory> = {},
): SupplierCategory {
  return {
    _id: "sc1",
    tenantId: "t1",
    kind: "supplier",
    name: "Distributor",
    isActive: true,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function page(items: SupplierCategory[]): PageResult<SupplierCategory> {
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

/** Opens a row's kebab menu. Every row action lives behind it. */
async function openRowMenu(name = "Distributor") {
  await userEvent.click(
    screen.getByRole("button", { name: `Aksi untuk ${name}` }),
  );
  return screen.getByRole("menu");
}

/** Stubs the list call, which every screen render performs on mount. */
function mockList(items: SupplierCategory[]) {
  return jest
    .spyOn(supplierCategoryService, "list")
    .mockResolvedValue(page(items));
}

describe("SupplierCategoriesScreen", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lists the tenant's supplier categories", async () => {
    mockList([makeCategory(), makeCategory({ _id: "sc2", name: "Agen" })]);

    renderWithAuth(<SupplierCategoriesScreen />);

    expect(await screen.findByText("Distributor")).toBeInTheDocument();
    expect(screen.getByText("Agen")).toBeInTheDocument();
  });

  it("shows the empty state rather than a blank table", async () => {
    mockList([]);

    renderWithAuth(<SupplierCategoriesScreen />);

    expect(
      await screen.findByText(/belum ada kategori supplier yang cocok/i),
    ).toBeInTheDocument();
  });

  it("surfaces a failed load instead of showing an empty list", async () => {
    jest
      .spyOn(supplierCategoryService, "list")
      .mockRejectedValue(new ApiError("Server error", 500));

    renderWithAuth(<SupplierCategoriesScreen />);

    // An error rendered as "no categories" would read as a true answer about
    // the tenant's data when it is really a broken request.
    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
  });

  it("sends the create button to its own route, as a real link", async () => {
    mockList([]);

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText(/belum ada kategori supplier/i);

    expect(screen.getByRole("link", { name: /kategori baru/i })).toHaveAttribute(
      "href",
      "/dashboard/purchasing/supplier-categories/new",
    );
  });

  it("opens on every category, retired ones included", async () => {
    const list = mockList([makeCategory({ isActive: false })]);

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    // This screen exists to manage the label set, and the retired labels are the
    // half most likely to need attention. Defaulting to Aktif would hide them
    // from the only screen that can bring them back.
    expect(list.mock.calls[0][0]).not.toHaveProperty("isActive");
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();
  });

  it("narrows to the retired ones through the panel", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Filter status" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Nonaktif" }));
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    // Narrowed on the SERVER — a client-side filter would leave the row count
    // describing a different set from the one on screen.
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false }),
      ),
    );
  });

  it("has no Tingkat filter — this kind has no tree", async () => {
    mockList([makeCategory()]);

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    const panel = await openFilters();

    // The product screen's fourth field. The API refuses a `parentId` on this
    // resource entirely, so a control for it would narrow nothing.
    expect(
      within(panel).queryByRole("button", { name: "Filter tingkat" }),
    ).not.toBeInTheDocument();
  });

  it("asks for deleted rows only when the toggle is on", async () => {
    const list = mockList([makeCategory()]);

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    expect(list.mock.calls[0][0]).toMatchObject({ includeDeleted: undefined });

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByLabelText("Tampilkan kategori terhapus"),
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeDeleted: true }),
      ),
    );
  });

  it("does not count the ordering in the filter badge", async () => {
    mockList([makeCategory()]);

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    const panel = await openFilters();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Urutkan" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Nama A–Z" }));
    await userEvent.click(
      within(panel).getByRole("button", { name: "Terapkan" }),
    );

    // Every list has an ordering, so it is never "on". A badge reading
    // `Filter (1)` over an unnarrowed list would train people to ignore the
    // number, which is the one thing that must stay worth reading.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
        /^Filter$/,
      ),
    );
  });

  it("routes Edit at the category's own page", async () => {
    mockList([makeCategory()]);

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    const menu = await openRowMenu();

    expect(within(menu).getByRole("menuitem", { name: /edit/i })).toHaveAttribute(
      "href",
      "/dashboard/purchasing/supplier-categories/sc1",
    );
  });

  it("deletes after a confirmation and refetches", async () => {
    const list = mockList([makeCategory()]);
    const remove = jest
      .spyOn(supplierCategoryService, "remove")
      .mockResolvedValue(makeCategory({ deletedAt: "2026-02-01T00:00:00.000Z" }));

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    const menu = await openRowMenu();
    await userEvent.click(within(menu).getByRole("menuitem", { name: /hapus/i }));
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("sc1"));
    // The list is re-read rather than patched in place: the row's new state is
    // the server's answer, not one the browser guessed at.
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));
  });

  it("shows the server's refusal verbatim rather than a generic failure", async () => {
    mockList([makeCategory()]);
    jest
      .spyOn(supplierCategoryService, "remove")
      .mockRejectedValue(new ApiError("Cannot delete category", 409));

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    const menu = await openRowMenu();
    await userEvent.click(within(menu).getByRole("menuitem", { name: /hapus/i }));
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));

    expect(
      await screen.findByText(/cannot delete category/i),
    ).toBeInTheDocument();
  });

  it("offers Pulihkan on a deleted row and nothing else", async () => {
    mockList([makeCategory({ deletedAt: "2026-02-01T00:00:00.000Z" })]);

    renderWithAuth(<SupplierCategoriesScreen />);
    await screen.findByText("Distributor");

    const menu = await openRowMenu();

    // Deleted outranks retired in the badge, and a deleted row has one action.
    expect(screen.getByText("Dihapus")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /pulihkan/i }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /edit/i }),
    ).not.toBeInTheDocument();
  });

  it("gives a read-only role no action column and no kebab", async () => {
    mockList([makeCategory()]);

    renderWithAuth(<SupplierCategoriesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "supplierCategories", actions: ["read"] }],
    });
    await screen.findByText("Distributor");

    expect(
      screen.queryByRole("columnheader", { name: /aksi/i }),
    ).not.toBeInTheDocument();
    // Not even the kebab: a supplier category has no detail page, so a menu
    // here would open onto nothing.
    expect(
      screen.queryByRole("button", { name: /^Aksi untuk/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /kategori baru/i }),
    ).not.toBeInTheDocument();
  });

  it("does not accept a `categories` grant in place of its own", async () => {
    mockList([makeCategory()]);

    renderWithAuth(<SupplierCategoriesScreen />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "categories", actions: ["read", "create", "update"] },
        { feature: "supplierCategories", actions: ["read"] },
      ],
    });
    await screen.findByText("Distributor");

    // The product taxonomy and the vendor groups are separate features on the
    // server too — this mirrors the route's own gate rather than assuming it.
    expect(
      screen.queryByRole("link", { name: /kategori baru/i }),
    ).not.toBeInTheDocument();
  });
});
