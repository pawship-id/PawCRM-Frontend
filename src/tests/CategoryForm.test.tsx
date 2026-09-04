import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CategoryForm } from "@/features/categories";
import { categoryService } from "@/services/category.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { ApiError } from "@/services/api-error";
import { TOP_LEVEL_ONLY } from "@/types/api";
import type { Category, PageResult } from "@/types/api";
import type { ChartOfAccount } from "@/types/accounting";
import type { MediaAsset } from "@/types/inventory";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Both verbs toast on success; mock the library so no real dialog is created
// and the redirect assertion does not wait on one.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

/**
 * The picker is stubbed. Its own behaviour — pick, crop, upload, the purpose
 * segment, the failure paths — is covered in ImageField.test.tsx
 * against a mocked media service; here what matters is only what the form does
 * with the asset it is handed, and a real one would drag `react-easy-crop` and
 * a canvas into every case below.
 */
jest.mock("@/components/ImageField", () => ({
  ImageField: ({
    value,
    onChange,
  }: {
    value: MediaAsset | null;
    onChange: (next: MediaAsset | null) => void;
  }) => (
    <div>
      <span>{value ? `gambar: ${value.storageKey}` : "gambar: kosong"}</span>
      <button type="button" onClick={() => onChange(null)}>
        Hapus gambar
      </button>
    </div>
  ),
}));

const LIST_PATH = "/dashboard/inventory/categories";

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

/**
 * The chart, filtered the way the card asks for it.
 *
 * ONE SPY KEYED ON `accountType`, because the card fires all three requests at
 * once and a test that stubbed them positionally would pass while the component
 * asked for the wrong type — which is the one thing the API refuses.
 */
function account(
  _id: string,
  code: string,
  name: string,
  accountType: ChartOfAccount["accountType"],
): ChartOfAccount {
  return { _id, code, name, accountType } as ChartOfAccount;
}

const CHART = [
  account("a-income", "4103", "Penjualan Treats", "income"),
  account("a-asset", "1202", "Persediaan Treats", "asset"),
  account("a-expense", "5102", "HPP Treats", "expense"),
];

function mockChart(accounts: ChartOfAccount[] = CHART) {
  return jest
    .spyOn(chartOfAccountsService, "list")
    .mockImplementation(async (query = {}) => {
      const items = accounts.filter(
        (row) => row.accountType === query.accountType,
      );
      return {
        items,
        pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
      };
    });
}

/** Opens one posting-account select and picks the option with that label. */
async function pickAccount(field: RegExp, option: RegExp) {
  await userEvent.click(screen.getByRole("combobox", { name: field }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

const nameField = () => screen.getByRole("textbox", { name: /nama kategori/i });
const descField = () => screen.getByRole("textbox", { name: /deskripsi/i });
const submit = (label: RegExp) =>
  userEvent.click(screen.getByRole("button", { name: label }));

/** Opens the parent select and picks the option with that label. */
async function pickParent(option: string) {
  // `find`, not `get`: the picker renders a spinner until its own list of
  // top-level categories lands, and a test that clicked before then would fail
  // on the spinner rather than on anything it meant to assert.
  await userEvent.click(
    await screen.findByRole("combobox", { name: /induk kategori/i }),
  );
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

/**
 * Stubs `list`, which BOTH the form and the parent picker call.
 *
 * The form asks for this category's children (`parentId: <id>`) to decide
 * whether the parent picker is usable at all; the picker asks for the tenant's
 * top-level categories (`parentId: "none"`) to fill its options. One spy, keyed
 * on which question was asked, so a test can set either without knowing the
 * order they fire in.
 */
function mockCategoryLists({
  roots = [] as Category[],
  childCount = 0,
} = {}) {
  return jest
    .spyOn(categoryService, "list")
    .mockImplementation(async (query = {}) =>
      query.parentId === TOP_LEVEL_ONLY
        ? page(roots)
        : { items: [], pagination: { page: 1, limit: 1, total: childCount, totalPages: 1 } },
    );
}

function page(items: Category[]): PageResult<Category> {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

/** Renders the edit route and waits for the fetched category to land. */
async function renderEdit(category: Category, lists = {}) {
  jest.spyOn(categoryService, "getById").mockResolvedValue(category);
  mockCategoryLists(lists);
  mockChart();
  render(<CategoryForm categoryId={category._id} />);
  await waitFor(() => expect(nameField()).toHaveValue(category.name));
}

/**
 * The category form, on its own route.
 *
 * ONE COMPONENT, TWO VERBS, so both are exercised here: `categoryId` absent
 * creates, present fetches and patches. What is asserted throughout is the
 * REQUEST BODY, because "only what moved" is load-bearing on this form — the
 * API rejects an empty patch, runs its 409 name check against whatever name it
 * is sent, and deletes the bytes an update drops.
 */
describe("CategoryForm", () => {
  beforeEach(() => {
    push.mockClear();
    // Every render mounts the accounting card, so the chart is stubbed for all
    // of them — an unstubbed one would reach the real fetch, fail, and render
    // the "gagal dimuat" branch while the test still passed.
    mockChart();
  });
  afterEach(() => jest.restoreAllMocks());

  describe("creating", () => {
    it("creates a category and returns to the list", async () => {
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory({ name: "Aksesoris" }));

      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.type(nameField(), "Aksesoris");
      await submit(/buat kategori/i);

      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({ name: "Aksesoris" }),
      );
      // Back to the list, where the toast lands — the same order the branch
      // forms use.
      await waitFor(() => expect(push).toHaveBeenCalledWith(LIST_PATH));
    });

    it("trims the name before sending it", async () => {
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory());

      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.type(nameField(), "  Snack  ");
      await submit(/buat kategori/i);

      // Otherwise " Snack " and "Snack" become two categories the unique index
      // considers different and every human reads as one.
      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({ name: "Snack" }),
      );
    });

    it("refuses an empty name without calling the API", async () => {
      const create = jest.spyOn(categoryService, "create");

      mockCategoryLists();
      render(<CategoryForm />);
      await submit(/buat kategori/i);

      expect(
        await screen.findByText(/nama kategori wajib diisi/i),
      ).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    it("sends a description alongside the name", async () => {
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory());

      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.type(nameField(), "Makanan");
      await userEvent.type(descField(), "  Basah dan kering  ");
      await submit(/buat kategori/i);

      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({
          name: "Makanan",
          description: "Basah dan kering",
        }),
      );
    });

    it("leaves the description out of a create that did not fill it in", async () => {
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory());

      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.type(nameField(), "Makanan");
      await submit(/buat kategori/i);

      // Not `description: ""`. The API stores a blank as null either way, but a
      // create carrying keys nobody filled in reads as though it did.
      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({ name: "Makanan" }),
      );
    });

    it("offers no active switch — a category is made because it is wanted", () => {
      mockCategoryLists();
      render(<CategoryForm />);

      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });

    it("files the category under the parent that was picked", async () => {
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory());
      mockCategoryLists({
        roots: [makeCategory({ _id: "p1", name: "Makanan" })],
      });

      render(<CategoryForm />);

      await userEvent.type(nameField(), "Kering");
      await pickParent("Makanan");
      await submit(/buat kategori/i);

      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({
          name: "Kering",
          parentId: "p1",
        }),
      );
    });

    it("leaves parentId out when no parent was picked", async () => {
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory());
      mockCategoryLists({
        roots: [makeCategory({ _id: "p1", name: "Makanan" })],
      });

      render(<CategoryForm />);

      await userEvent.type(nameField(), "Makanan Anjing");
      await submit(/buat kategori/i);

      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({ name: "Makanan Anjing" }),
      );
    });

    it("offers only top-level categories as parents", async () => {
      // The tree is two deep, so a sub-category cannot hold sub-categories.
      // Asked of the API rather than filtered here, so the options are exactly
      // the set the save would accept.
      const list = mockCategoryLists();
      render(<CategoryForm />);

      await waitFor(() =>
        expect(list).toHaveBeenCalledWith(
          expect.objectContaining({ parentId: TOP_LEVEL_ONLY }),
        ),
      );
    });

    it("puts a duplicate-name 409 on the field, and mentions deleted categories", async () => {
      jest
        .spyOn(categoryService, "create")
        .mockRejectedValue(new ApiError("Category 'Snack' already exists", 409));

      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.type(nameField(), "Snack");
      await submit(/buat kategori/i);

      // The name is what is wrong, so the message goes on the name — and it
      // names both surprises: uniqueness is scoped to the LEVEL, so the same
      // name is legal under a different parent, and a deleted category still
      // holds its name because the index is partial on `deletedAt: null`.
      expect(
        await screen.findByText(/sudah dipakai di tingkat yang sama/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/induk yang berbeda/i)).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });

    it("shows anything that is not a name clash as a banner", async () => {
      jest
        .spyOn(categoryService, "create")
        .mockRejectedValue(new ApiError("Server error", 500));

      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.type(nameField(), "Snack");
      await submit(/buat kategori/i);

      // Not something the user can fix by retyping, so it does not belong
      // against a field.
      expect(await screen.findByText("Server error")).toBeInTheDocument();
    });
  });

  describe("editing", () => {
    it("opens pre-filled from the fetched category", async () => {
      await renderEdit(
        makeCategory({ description: "Basah dan kering", image: makeImage() }),
      );

      expect(descField()).toHaveValue("Basah dan kering");
      expect(
        screen.getByText(`gambar: ${makeImage().storageKey}`),
      ).toBeInTheDocument();
    });

    it("surfaces a failed load rather than an empty form", async () => {
      jest
        .spyOn(categoryService, "getById")
        .mockRejectedValue(new ApiError("Category not found", 404));

      mockCategoryLists();
      render(<CategoryForm categoryId="c1" />);

      // A blank form here would invite somebody to retype a category that is
      // already there, and then fail with a 409 they cannot explain.
      expect(await screen.findByText("Category not found")).toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: /nama kategori/i }),
      ).not.toBeInTheDocument();
    });

    it("renames without resending anything else", async () => {
      const update = jest
        .spyOn(categoryService, "update")
        .mockResolvedValue(makeCategory());

      await renderEdit(makeCategory({ image: makeImage() }));

      await userEvent.clear(nameField());
      await userEvent.type(nameField(), "Makanan Anjing");
      await submit(/^simpan kategori$/i);

      // The image especially: the API deletes the bytes an update drops, so
      // resending an unchanged asset is one dropped connection away from
      // losing the picture.
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("c1", { name: "Makanan Anjing" }),
      );
    });

    it("leaves without a request when nothing moved", async () => {
      const update = jest.spyOn(categoryService, "update");

      await renderEdit(makeCategory());
      await submit(/^simpan kategori$/i);

      // The API rejects an empty patch body, and "save" on an untouched form is
      // a close that should not look like a failure.
      expect(update).not.toHaveBeenCalled();
      await waitFor(() => expect(push).toHaveBeenCalledWith(LIST_PATH));
    });

    it("does not call an emptied box a change on a category that never had one", async () => {
      const update = jest.spyOn(categoryService, "update");

      await renderEdit(makeCategory({ description: null }));
      await submit(/^simpan kategori$/i);

      // `null` and `""` both mean "no description", so an untouched form is
      // still a patch that changes nothing.
      expect(update).not.toHaveBeenCalled();
    });

    it("edits the description on its own", async () => {
      const update = jest
        .spyOn(categoryService, "update")
        .mockResolvedValue(makeCategory());

      await renderEdit(makeCategory({ description: "Basah dan kering" }));

      await userEvent.clear(descField());
      await userEvent.type(descField(), "Bukan camilan");
      await submit(/^simpan kategori$/i);

      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("c1", {
          description: "Bukan camilan",
        }),
      );
    });

    it("clears the description with an empty box", async () => {
      const update = jest
        .spyOn(categoryService, "update")
        .mockResolvedValue(makeCategory());

      await renderEdit(makeCategory({ description: "Basah dan kering" }));

      await userEvent.clear(descField());
      await submit(/^simpan kategori$/i);

      // "" is what the API reads as "clear it"; it stores null.
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("c1", { description: "" }),
      );
    });

    it("removes a picture by sending null", async () => {
      const update = jest
        .spyOn(categoryService, "update")
        .mockResolvedValue(makeCategory());

      await renderEdit(makeCategory({ image: makeImage() }));

      await userEvent.click(
        screen.getByRole("button", { name: /hapus gambar/i }),
      );
      await submit(/^simpan kategori$/i);

      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("c1", { image: null }),
      );
    });

    it("retires a category without touching its name", async () => {
      const update = jest
        .spyOn(categoryService, "update")
        .mockResolvedValue(makeCategory({ isActive: false }));

      await renderEdit(makeCategory());

      await userEvent.click(screen.getByRole("switch", { name: /aktif/i }));
      await submit(/^simpan kategori$/i);

      // The name is deliberately absent: sending it would run the 409 check
      // against the category's own name for an edit that never touched it.
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("c1", { isActive: false }),
      );
    });

    it("offers no delete button — that lives in the list's row menu", async () => {
      await renderEdit(makeCategory());

      // Its confirmation names how many products are in the way, which is the
      // number that tells you what to do next. A second copy here would be a
      // second copy of that reasoning to keep in step.
      expect(
        screen.queryByRole("button", { name: /^hapus$/i }),
      ).not.toBeInTheDocument();
    });

    it("moves a sub-category to another parent", async () => {
      const update = jest
        .spyOn(categoryService, "update")
        .mockResolvedValue(makeCategory());

      await renderEdit(makeCategory({ parentId: "p1" }), {
        roots: [
          makeCategory({ _id: "p1", name: "Makanan Kucing" }),
          makeCategory({ _id: "p2", name: "Makanan Anjing" }),
        ],
      });

      await pickParent("Makanan Anjing");
      await submit(/^simpan kategori$/i);

      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("c1", { parentId: "p2" }),
      );
    });

    it("promotes a sub-category back to the top level", async () => {
      const update = jest
        .spyOn(categoryService, "update")
        .mockResolvedValue(makeCategory());

      await renderEdit(makeCategory({ parentId: "p1" }), {
        roots: [makeCategory({ _id: "p1", name: "Makanan Kucing" })],
      });

      await pickParent("Tidak ada — kategori induk");
      await submit(/^simpan kategori$/i);

      // `null`, the same clear-by-null idiom the image field uses.
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("c1", { parentId: null }),
      );
    });

    it("does not resend an unchanged parent", async () => {
      const update = jest.spyOn(categoryService, "update");

      await renderEdit(makeCategory({ parentId: "p1" }), {
        roots: [makeCategory({ _id: "p1", name: "Makanan Kucing" })],
      });
      await submit(/^simpan kategori$/i);

      expect(update).not.toHaveBeenCalled();
    });

    it("locks the parent picker on a category that already has children", async () => {
      await renderEdit(makeCategory(), {
        roots: [makeCategory({ _id: "p1", name: "Makanan Kucing" })],
        childCount: 3,
      });

      // A parent cannot become a child without making the tree three deep, and
      // the API refuses it with a 409 — so the form does not offer the move.
      expect(
        screen.getByRole("combobox", { name: /induk kategori/i }),
      ).toBeDisabled();
      expect(screen.getByText(/sudah punya 3 sub-kategori/i)).toBeInTheDocument();
    });

    it("explains itself when there is no other category to sit under", async () => {
      await renderEdit(makeCategory(), { roots: [] });

      expect(
        screen.getByRole("combobox", { name: /induk kategori/i }),
      ).toBeDisabled();
      expect(screen.getByText(/belum ada kategori lain/i)).toBeInTheDocument();
    });

    it("never offers the category itself as its own parent", async () => {
      await renderEdit(makeCategory({ _id: "c1", name: "Makanan Kucing" }), {
        roots: [
          makeCategory({ _id: "c1", name: "Makanan Kucing" }),
          makeCategory({ _id: "p2", name: "Makanan Anjing" }),
        ],
      });

      await userEvent.click(
        screen.getByRole("combobox", { name: /induk kategori/i }),
      );

      // A category filed under itself is a one-node cycle. The API refuses it;
      // the picker does not offer it in the first place.
      expect(
        screen.queryByRole("option", { name: "Makanan Kucing" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Makanan Anjing" }),
      ).toBeInTheDocument();
    });

    it("shows a refused move as a banner, not against the name", async () => {
      jest.spyOn(categoryService, "update").mockRejectedValue(
        new ApiError("Cannot move this category", 409, {
          reason: "It already holds 3 sub-categories",
        }),
      );

      await renderEdit(makeCategory(), {
        roots: [makeCategory({ _id: "p1", name: "Makanan Kucing" })],
      });

      await pickParent("Makanan Kucing");
      await submit(/^simpan kategori$/i);

      // Not something the user can fix by retyping the name, so it does not
      // belong against the name field.
      expect(
        await screen.findByText(/already holds 3 sub-categories/i),
      ).toBeInTheDocument();
    });

    it("goes back without saving on Batal", async () => {
      const update = jest.spyOn(categoryService, "update");

      await renderEdit(makeCategory());

      await userEvent.clear(nameField());
      await userEvent.type(nameField(), "Dibatalkan");
      await userEvent.click(screen.getByRole("button", { name: /batal/i }));

      expect(update).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(LIST_PATH);
    });
  });

  /**
   * PCR-009's middle tier, from the form's side.
   *
   * WHAT IS ASSERTED IS THE REQUEST BODY, like everywhere else on this form,
   * and the two halves of that are what the card is for: `""` must reach the
   * server as `null` on an update — because that is how an account is CLEARED —
   * and must be left out of a create entirely, because a create carrying three
   * keys nobody filled in reads as though it did.
   */
  describe("akun jurnal", () => {
    it("leaves the three accounts out of a create nobody filled in", async () => {
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory());
      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.type(nameField(), "Treats");
      await submit(/buat kategori/i);

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).not.toHaveProperty("salesAccountId");
      expect(create.mock.calls[0][0]).not.toHaveProperty("cogsAccountId");
      expect(create.mock.calls[0][0]).not.toHaveProperty("inventoryAccountId");
    });

    it("sends the account a create picked", async () => {
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory());
      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.type(nameField(), "Treats");
      await pickAccount(/akun penjualan/i, /4103/);
      await submit(/buat kategori/i);

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0][0]).toMatchObject({
        salesAccountId: "a-income",
      });
    });

    it("offers only the accounts of each field's own type", async () => {
      mockCategoryLists();
      render(<CategoryForm />);

      await userEvent.click(
        screen.getByRole("combobox", { name: /akun hpp/i }),
      );

      expect(await screen.findByRole("option", { name: /5102/ })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /4103/ })).not.toBeInTheDocument();
    });

    /*
      THE CASE THE SENTINEL EXISTS FOR. Radix forbids `value=""`, so without an
      explicit "Akun bawaan" option there is no way back to empty once an
      account has been picked — while the hint under every one of these pickers
      tells people to leave it empty for the ordinary case.
    */
    it("clears an account back to null", async () => {
      const update = jest.spyOn(categoryService, "update").mockResolvedValue(
        makeCategory(),
      );
      await renderEdit(makeCategory({ salesAccountId: "a-income" }));

      await pickAccount(/akun penjualan/i, /akun bawaan/i);
      await submit(/simpan kategori/i);

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0][1]).toEqual({ salesAccountId: null });
    });

    it("leaves untouched accounts out of the patch", async () => {
      const update = jest
        .spyOn(categoryService, "update")
        .mockResolvedValue(makeCategory());
      await renderEdit(makeCategory({ salesAccountId: "a-income" }));

      await userEvent.clear(nameField());
      await userEvent.type(nameField(), "Treats Premium");
      await submit(/simpan kategori/i);

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0][1]).toEqual({ name: "Treats Premium" });
    });

    /*
      A SAVE THAT MOVED NOTHING STILL HAS TO LEAVE RATHER THAN PATCH. The three
      account fields are `null` on the server and `""` in the form, and comparing
      them carelessly would make every category with no accounts set look
      changed — turning "nothing moved" into three nulls that were already null.
    */
    it("does not patch when only the accounts were looked at", async () => {
      const update = jest.spyOn(categoryService, "update");
      await renderEdit(makeCategory());

      await submit(/simpan kategori/i);

      await waitFor(() => expect(push).toHaveBeenCalledWith(LIST_PATH));
      expect(update).not.toHaveBeenCalled();
    });

    /*
      `chartOfAccounts:read` IS A SEPARATE GRANT. Somebody who organises the
      catalogue without seeing the books is an ordinary arrangement, so the
      refusal collapses this one card rather than the form around it.
    */
    it("keeps the form usable when the chart is refused", async () => {
      jest
        .spyOn(chartOfAccountsService, "list")
        .mockRejectedValue(new ApiError("Forbidden", 403));
      const create = jest
        .spyOn(categoryService, "create")
        .mockResolvedValue(makeCategory());
      mockCategoryLists();
      render(<CategoryForm />);

      expect(await screen.findByText(/tidak punya akses ke Akuntansi/i)).toBeInTheDocument();

      await userEvent.type(nameField(), "Treats");
      await submit(/buat kategori/i);

      await waitFor(() => expect(create).toHaveBeenCalled());
    });

    /*
      ON A CHILD, "EMPTY" MEANS THE PARENT'S ANSWER, not the seeded one — one
      level of inheritance, which is the whole of it since the tree is capped at
      two. The copy has to say which, or somebody setting accounts on "Makanan"
      would read "pakai 4101" under "Makanan Kering" and conclude the setting was
      ignored.
    */
    it("says it follows the parent once the category has one", async () => {
      mockCategoryLists({ roots: [makeCategory({ _id: "p1", name: "Makanan" })] });
      render(<CategoryForm />);

      expect(
        await screen.findByText(/pakai 4101 Penjualan Barang/i),
      ).toBeInTheDocument();

      await pickParent("Makanan");

      // All three, not one: the parent answers every field it filled in, and a
      // card that switched only the revenue hint would be lying about the other
      // two.
      expect(await screen.findAllByText(/ikut kategori induknya/i)).toHaveLength(
        3,
      );
    });
  });
});
