import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PetOptionsScreen } from "@/features/settings";
import { invalidatePetOptions } from "@/hooks/usePetOptions";
import { ApiError } from "@/services/api-error";
import { petOptionService } from "@/services/petOption.service";
import type { PetOption } from "@/types/api";

import { PET_OPTION_FIXTURES, makePetOption } from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/petOption.service");

// The real store, with the one call this screen makes after a write swapped
// for a spy: whether every picker is told is half of what a write here means.
jest.mock("@/hooks/usePetOptions", () => ({
  ...jest.requireActual("@/hooks/usePetOptions"),
  invalidatePetOptions: jest.fn(),
}));

// Writes toast through SweetAlert2; no real popup in jsdom.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

/**
 * Pengaturan › Layanan › Data hewan.
 *
 * WHAT THESE TESTS ARE FOR. The screen is four small lists, and the ways it can
 * be quietly wrong are all about which list and which order:
 *
 *  1. the pills narrow ONE load, and count live options only;
 *  2. a new word goes into the list whose pill is on;
 *  3. a move is a sortOrder swap with the neighbour — or a renumber when the
 *     two are tied, or the click would do nothing;
 *  4. a refused delete keeps its dialog open and shows the server's counts;
 *  5. a role without `petOptions` grants sees the lists and nothing to press.
 */

function listing(items: PetOption[]) {
  jest.mocked(petOptionService.list).mockResolvedValue({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  });
}

const size = (code: string) =>
  PET_OPTION_FIXTURES.find((o) => o.type === "size" && o.code === code)!;

function pill(name: string) {
  return within(
    screen.getByRole("group", { name: "Jenis data hewan" }),
  ).getByRole("button", { name: new RegExp(`^${name}`) });
}

/** The name column, top to bottom. */
function namesInTable() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function openRowMenu(label: string) {
  await userEvent.click(
    screen.getByRole("button", { name: `Aksi untuk ${label}` }),
  );
  return screen.getByRole("menu");
}

async function renderOnSizes() {
  renderWithAuth(<PetOptionsScreen />);
  await screen.findByText("Kucing");
  await userEvent.click(pill("Ukuran"));
}

beforeEach(() => {
  jest.clearAllMocks();
  listing(PET_OPTION_FIXTURES);
  jest.mocked(petOptionService.update).mockResolvedValue(size("small"));
});

describe("PetOptionsScreen", () => {
  it("opens on Jenis hewan, counts live options per pill, and switches lists from one load", async () => {
    listing([
      // Reversed, so the order on screen can only have come from sortOrder.
      ...[...PET_OPTION_FIXTURES].reverse(),
      makePetOption({
        type: "size",
        code: "giant",
        label: "Raksasa",
        sortOrder: 3,
        deletedAt: "2026-09-10T00:00:00.000Z",
      }),
    ]);

    renderWithAuth(<PetOptionsScreen />);

    expect(await screen.findByText("Kucing")).toBeInTheDocument();
    expect(screen.getByText("Anjing")).toBeInTheDocument();
    expect(screen.queryByText("Kecil")).not.toBeInTheDocument();
    expect(pill("Jenis hewan")).toHaveAttribute("aria-pressed", "true");

    expect(pill("Jenis hewan")).toHaveTextContent("2");
    expect(pill("Ras")).toHaveTextContent("2");
    // The deleted Raksasa is not counted.
    expect(pill("Ukuran")).toHaveTextContent("3");
    expect(pill("Jenis bulu")).toHaveTextContent("2");

    expect(screen.getByRole("link", { name: "Layanan" })).toHaveAttribute(
      "href",
      "/dashboard/master/layanan",
    );

    await userEvent.click(pill("Ukuran"));
    expect(namesInTable()).toEqual(["Kecil", "Sedang", "Besar"]);
    expect(screen.queryByText("Kucing")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Tampilkan yang dihapus"));
    expect(namesInTable()).toEqual(["Kecil", "Sedang", "Besar", "Raksasa"]);
    expect(screen.getByText("Dihapus")).toBeInTheDocument();
    expect(pill("Ukuran")).toHaveTextContent("3");

    // Narrowed on the client: switching pills and toggling asked for nothing.
    expect(petOptionService.list).toHaveBeenCalledTimes(1);
    expect(petOptionService.list).toHaveBeenCalledWith(
      expect.objectContaining({ includeDeleted: true }),
    );
  });

  it("reads every page before drawing the lists", async () => {
    const [first, ...rest] = PET_OPTION_FIXTURES;
    const total = PET_OPTION_FIXTURES.length;
    jest
      .mocked(petOptionService.list)
      .mockResolvedValueOnce({
        items: [first],
        pagination: { page: 1, limit: 100, total, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        items: rest,
        pagination: { page: 2, limit: 100, total, totalPages: 2 },
      });

    renderWithAuth(<PetOptionsScreen />);

    expect(await screen.findByText("Kucing")).toBeInTheDocument();
    expect(screen.getByText("Anjing")).toBeInTheDocument();
    expect(petOptionService.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2 }),
    );
  });

  it("adds to the list whose pill is on, then re-reads it and refreshes every picker", async () => {
    jest.mocked(petOptionService.create).mockResolvedValue(
      makePetOption({
        type: "size",
        code: "ekstra-besar",
        label: "Ekstra besar",
        sortOrder: 3,
      }),
    );

    await renderOnSizes();
    await userEvent.click(screen.getByRole("button", { name: "Tambah ukuran" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/kodenya dibuat otomatis dari nama/i);

    await userEvent.type(
      within(dialog).getByLabelText(/Nama ukuran/),
      "Ekstra besar",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Tambah ukuran" }),
    );

    await waitFor(() =>
      expect(petOptionService.create).toHaveBeenCalledWith({
        type: "size",
        label: "Ekstra besar",
      }),
    );
    await waitFor(() => expect(petOptionService.list).toHaveBeenCalledTimes(2));
    expect(invalidatePetOptions).toHaveBeenCalled();
  });

  it("renames without touching the code, which it shows read-only", async () => {
    await renderOnSizes();

    const menu = await openRowMenu("Kecil");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Ubah nama/ }));

    const dialog = screen.getByRole("dialog");
    const code = within(dialog).getByLabelText("Kode");
    expect(code).toHaveValue("small");
    expect(code).toHaveAttribute("readonly");

    const name = within(dialog).getByLabelText(/Nama ukuran/);
    await userEvent.clear(name);
    await userEvent.type(name, "Mungil");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Simpan ukuran" }),
    );

    await waitFor(() =>
      expect(petOptionService.update).toHaveBeenCalledWith("opt-size-small", {
        label: "Mungil",
      }),
    );
  });

  it("keeps the delete dialog open on a 409 and shows the server's counts", async () => {
    jest.mocked(petOptionService.remove).mockRejectedValue(
      new ApiError("Cannot delete pet option", 409, {
        reason:
          "3 pet(s) and 1 service(s) still use 'Kucing'. Retire it instead, or change them first.",
      }),
    );

    renderWithAuth(<PetOptionsScreen />);
    await screen.findByText("Kucing");

    const menu = await openRowMenu("Kucing");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Hapus/ }));

    const dialog = screen.getByRole("dialog");
    // Said before the click, not only after the refusal.
    expect(dialog).toHaveTextContent(/ditolak selama masih ada hewan atau layanan/);
    expect(dialog).toHaveTextContent(/Nonaktifkan/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Hapus" }));

    expect(
      await within(dialog).findByText(
        /3 pet\(s\) and 1 service\(s\) still use 'Kucing'/,
      ),
    ).toBeInTheDocument();
    expect(petOptionService.remove).toHaveBeenCalledWith("opt-species-cat");
    expect(invalidatePetOptions).not.toHaveBeenCalled();
  });

  it("moves a size up by swapping sortOrder with the one above", async () => {
    await renderOnSizes();

    // Nothing above the smallest.
    const top = await openRowMenu("Kecil");
    expect(within(top).getByRole("menuitem", { name: /Naikkan/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.keyboard("{Escape}");

    const menu = await openRowMenu("Sedang");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Naikkan/ }));

    await waitFor(() => expect(petOptionService.update).toHaveBeenCalledTimes(2));
    expect(petOptionService.update).toHaveBeenCalledWith("opt-size-medium", {
      sortOrder: 0,
    });
    expect(petOptionService.update).toHaveBeenCalledWith("opt-size-small", {
      sortOrder: 1,
    });
    await waitFor(() => expect(petOptionService.list).toHaveBeenCalledTimes(2));
    expect(invalidatePetOptions).toHaveBeenCalled();
  });

  it("renumbers when the two rows share a sortOrder, so the move still lands", async () => {
    // All three at 0: shown in label order, and a swap of 0 for 0 moves nothing.
    listing([
      makePetOption({ type: "species", code: "cat", label: "Kucing" }),
      makePetOption({ type: "species", code: "dog", label: "Anjing" }),
      makePetOption({ type: "species", code: "rabbit", label: "Kelinci" }),
    ]);

    renderWithAuth(<PetOptionsScreen />);
    await screen.findByText("Kucing");
    expect(namesInTable()).toEqual(["Anjing", "Kelinci", "Kucing"]);

    const menu = await openRowMenu("Kucing");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Naikkan/ }));

    await waitFor(() => expect(petOptionService.update).toHaveBeenCalledTimes(2));
    // Anjing is already at 0 and is not written.
    expect(petOptionService.update).toHaveBeenCalledWith("opt-species-cat", {
      sortOrder: 1,
    });
    expect(petOptionService.update).toHaveBeenCalledWith("opt-species-rabbit", {
      sortOrder: 2,
    });
  });

  it("retires and reactivates without deleting", async () => {
    listing([
      makePetOption({ type: "species", code: "cat", label: "Kucing" }),
      makePetOption({
        type: "species",
        code: "dog",
        label: "Anjing",
        sortOrder: 1,
        isActive: false,
      }),
    ]);

    renderWithAuth(<PetOptionsScreen />);
    await screen.findByText("Kucing");

    const retiredRow = screen.getByText("Anjing").closest("tr")!;
    expect(within(retiredRow).getByText("Nonaktif")).toBeInTheDocument();

    const menu = await openRowMenu("Kucing");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /Nonaktifkan/ }),
    );
    await waitFor(() =>
      expect(petOptionService.update).toHaveBeenCalledWith("opt-species-cat", {
        isActive: false,
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Aksi untuk Anjing" }),
      ).toBeEnabled(),
    );
    const other = await openRowMenu("Anjing");
    expect(
      within(other).getByRole("menuitem", { name: /Aktifkan/ }),
    ).toBeInTheDocument();
    expect(petOptionService.remove).not.toHaveBeenCalled();
  });

  it("offers Pulihkan, and only that, on a deleted row", async () => {
    jest.mocked(petOptionService.restore).mockResolvedValue(size("small"));
    listing([
      makePetOption({ type: "species", code: "cat", label: "Kucing" }),
      makePetOption({
        type: "species",
        code: "dog",
        label: "Anjing",
        deletedAt: "2026-09-10T00:00:00.000Z",
      }),
    ]);

    renderWithAuth(<PetOptionsScreen />);
    await screen.findByText("Kucing");
    await userEvent.click(screen.getByLabelText("Tampilkan yang dihapus"));

    const menu = await openRowMenu("Anjing");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Pulihkan/ }));

    await waitFor(() =>
      expect(petOptionService.restore).toHaveBeenCalledWith("opt-species-dog"),
    );
    expect(invalidatePetOptions).toHaveBeenCalled();
  });

  it("says a list is empty and offers the first entry", async () => {
    listing(PET_OPTION_FIXTURES.filter((o) => o.type === "species"));

    renderWithAuth(<PetOptionsScreen />);
    await screen.findByText("Kucing");
    await userEvent.click(pill("Ras"));

    expect(screen.getByText("Belum ada ras.")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Tambah yang pertama/ }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", {
        name: "Tambah ras",
      }),
    ).toBeInTheDocument();
  });

  it("gives a role without petOptions grants the lists and nothing to press", async () => {
    renderWithAuth(<PetOptionsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read"] }],
    });

    expect(await screen.findByText("Kucing")).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Aksi" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Aksi untuk/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Tambah/ }),
    ).not.toBeInTheDocument();
  });

  it("offers only the actions the grant covers", async () => {
    renderWithAuth(<PetOptionsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "petOptions", actions: ["delete"] }],
    });
    await screen.findByText("Kucing");

    const menu = await openRowMenu("Kucing");
    expect(within(menu).getByRole("menuitem", { name: /Hapus/ })).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /Ubah nama|Naikkan|Nonaktifkan/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tambah jenis hewan" }),
    ).not.toBeInTheDocument();
  });
});
