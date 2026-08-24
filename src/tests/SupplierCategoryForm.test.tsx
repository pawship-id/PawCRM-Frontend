import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { SupplierCategoryForm } from "@/features/purchasing";
import { supplierCategoryService } from "@/services/supplierCategory.service";
import { ApiError } from "@/services/api-error";
import type { SupplierCategory } from "@/types/api";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Saving fires a SweetAlert2 toast; mock the library so no real dialog is
// created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

const LIST_PATH = "/dashboard/purchasing/supplier-categories";

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

/** Renders the edit form and waits for the fetched category to land. */
async function renderEditing(category = makeCategory()) {
  jest
    .spyOn(supplierCategoryService, "getById")
    .mockResolvedValue(category);

  renderWithAuth(<SupplierCategoryForm categoryId={category._id} />);

  await screen.findByDisplayValue(category.name);
}

describe("SupplierCategoryForm", () => {
  beforeEach(() => push.mockClear());
  afterEach(() => jest.restoreAllMocks());

  describe("creating", () => {
    it("shows one input and nothing the resource cannot hold", () => {
      renderWithAuth(<SupplierCategoryForm />);

      expect(screen.getByLabelText(/nama kategori/i)).toBeInTheDocument();
      // The product form's other fields. The API refuses all three on this
      // resource, so offering any of them would be a control that silently does
      // nothing — which is the whole reason this is a separate form.
      expect(screen.queryByLabelText(/deskripsi/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/induk/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/gambar/i)).not.toBeInTheDocument();
    });

    it("does not offer the active switch — a new category is one somebody wants", () => {
      renderWithAuth(<SupplierCategoryForm />);

      expect(screen.queryByLabelText("Aktif")).not.toBeInTheDocument();
    });

    it("creates from the trimmed name and returns to the list", async () => {
      const create = jest
        .spyOn(supplierCategoryService, "create")
        .mockResolvedValue(makeCategory());

      renderWithAuth(<SupplierCategoryForm />);

      await userEvent.type(
        screen.getByLabelText(/nama kategori/i),
        "  Distributor  ",
      );
      await userEvent.click(
        screen.getByRole("button", { name: /buat kategori/i }),
      );

      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({ name: "Distributor" }),
      );
      expect(push).toHaveBeenCalledWith(LIST_PATH);
    });

    it("refuses an empty name in the browser rather than round-tripping a 400", async () => {
      const create = jest.spyOn(supplierCategoryService, "create");

      renderWithAuth(<SupplierCategoryForm />);
      await userEvent.click(
        screen.getByRole("button", { name: /buat kategori/i }),
      );

      expect(await screen.findByText(/wajib diisi/i)).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("puts a name clash on the field, not in a banner", async () => {
      jest
        .spyOn(supplierCategoryService, "create")
        .mockRejectedValue(
          new ApiError("Supplier category 'Distributor' already exists", 409),
        );

      renderWithAuth(<SupplierCategoryForm />);

      await userEvent.type(
        screen.getByLabelText(/nama kategori/i),
        "Distributor",
      );
      await userEvent.click(
        screen.getByRole("button", { name: /buat kategori/i }),
      );

      // A clash is fixable by retyping, so it belongs beside the box being
      // retyped. It also names the deleted-holds-its-name rule, which is the
      // one cause a user cannot see from the list.
      expect(await screen.findByText(/sudah dipakai/i)).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });

    it("shows any other failure as a banner and stays on the form", async () => {
      jest
        .spyOn(supplierCategoryService, "create")
        .mockRejectedValue(new ApiError("Server error", 500));

      renderWithAuth(<SupplierCategoryForm />);

      await userEvent.type(screen.getByLabelText(/nama kategori/i), "Agen");
      await userEvent.click(
        screen.getByRole("button", { name: /buat kategori/i }),
      );

      expect(await screen.findByText(/server error/i)).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
  });

  describe("editing", () => {
    it("loads the category into the fields", async () => {
      await renderEditing();

      expect(screen.getByLabelText(/nama kategori/i)).toHaveValue("Distributor");
      expect(screen.getByLabelText("Aktif")).toBeInTheDocument();
    });

    it("surfaces a failed load rather than an empty form", async () => {
      jest
        .spyOn(supplierCategoryService, "getById")
        .mockRejectedValue(new ApiError("Supplier category not found", 404));

      renderWithAuth(<SupplierCategoryForm categoryId="sc1" />);

      expect(
        await screen.findByText(/supplier category not found/i),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/nama kategori/i)).not.toBeInTheDocument();
    });

    it("sends only the name when only the name moved", async () => {
      const update = jest
        .spyOn(supplierCategoryService, "update")
        .mockResolvedValue(makeCategory({ name: "Agen" }));

      await renderEditing();

      await userEvent.clear(screen.getByLabelText(/nama kategori/i));
      await userEvent.type(screen.getByLabelText(/nama kategori/i), "Agen");
      await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("sc1", { name: "Agen" }),
      );
    });

    it("sends only isActive when only the switch moved", async () => {
      const update = jest
        .spyOn(supplierCategoryService, "update")
        .mockResolvedValue(makeCategory({ isActive: false }));

      await renderEditing();

      await userEvent.click(screen.getByLabelText("Aktif"));
      await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

      // The name is deliberately left out: resending it would put it through
      // the server's 409 check against itself.
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("sc1", { isActive: false }),
      );
    });

    it("leaves without a request when nothing moved", async () => {
      const update = jest.spyOn(supplierCategoryService, "update");

      await renderEditing();
      await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

      // The API rejects an empty body outright, so a "save" that sent one would
      // come back a 400 and read as a failure. Leaving is the honest outcome.
      await waitFor(() => expect(push).toHaveBeenCalledWith(LIST_PATH));
      expect(update).not.toHaveBeenCalled();
    });

    it("returns to the list on Batal without saving", async () => {
      const update = jest.spyOn(supplierCategoryService, "update");

      await renderEditing();
      await userEvent.type(screen.getByLabelText(/nama kategori/i), " lain");
      await userEvent.click(screen.getByRole("button", { name: "Batal" }));

      expect(push).toHaveBeenCalledWith(LIST_PATH);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
