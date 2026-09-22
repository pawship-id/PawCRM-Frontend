import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ServiceStepsPanel } from "@/features/settings/components/ServiceStepsPanel";
import { useServiceStepList } from "@/features/settings/hooks/useServiceStepList";
import { invalidateServiceSteps } from "@/hooks/useServiceSteps";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { serviceStepService } from "@/services/serviceStep.service";
import type { ServiceStep } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { makeServiceStep, primeServiceSteps } from "./helpers/serviceSteps";

/** The panel with its own load — the hub passes both in; here the harness does. */
function ServiceStepsScreen() {
  const list = useServiceStepList();
  return <ServiceStepsPanel list={list} />;
}

jest.mock("@/services/serviceStep.service");

// The real store, with the one call this screen makes after a write swapped
// for a spy: whether a service's Tahapan card is told is half of what a write
// here means.
jest.mock("@/hooks/useServiceSteps", () => ({
  ...jest.requireActual("@/hooks/useServiceSteps"),
  invalidateServiceSteps: jest.fn(),
}));

// The toast text is part of the contract — a rename says how many services
// followed it.
jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

/**
 * Pengaturan › Layanan › Tahapan.
 *
 * WHAT THESE TESTS ARE FOR. The screen is one small list per Kelompok layanan
 * (22 September 2026 — per business line before), and the ways it can be
 * quietly wrong are about which kind, what a rename reaches, and who may press
 * what:
 *
 *  1. it opens on Grooming, and the pills count live steps per kind from ONE
 *     load;
 *  2. a new step goes into the kind whose pill is on;
 *  3. a rename says how many services follow BEFORE the click and after it;
 *  4. a refused delete keeps its dialog open and shows the server's count;
 *  5. a move is a sortOrder swap with the neighbour;
 *  6. the grants are `services:*` — read sees no actions, update cannot delete,
 *     and no business-line grant is needed at all.
 */

const MANDI = makeServiceStep({ name: "Mandi", sortOrder: 0, serviceCount: 3 });
const GUNTING = makeServiceStep({ name: "Gunting", sortOrder: 1, serviceCount: 0 });
const BLOW_DRY = makeServiceStep({ name: "Blow dry", sortOrder: 2, serviceCount: 1 });
const POTONG_KUKU = makeServiceStep({
  name: "Potong kuku",
  sortOrder: 3,
  deletedAt: "2026-09-10T00:00:00.000Z",
});
const CEK_KESEHATAN = makeServiceStep({
  name: "Cek kesehatan",
  serviceKind: "hotel",
  serviceCount: 2,
});

const STEPS: ServiceStep[] = [
  // Reversed, so the order on screen can only have come from sortOrder.
  POTONG_KUKU,
  BLOW_DRY,
  GUNTING,
  MANDI,
  CEK_KESEHATAN,
];

function pill(name: string) {
  return within(screen.getByRole("group", { name: "Kelompok layanan" })).getByRole(
    "button",
    { name: new RegExp(`^${name}`) },
  );
}

/** The name column, top to bottom. */
function namesInTable() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function openRowMenu(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Aksi untuk ${name}` }));
  return screen.getByRole("menu");
}

beforeEach(() => {
  jest.clearAllMocks();
  primeServiceSteps(serviceStepService.list, STEPS);
  // Priming drops the shared cache through the spied `invalidateServiceSteps`;
  // forget that call so only the screen's own writes are counted.
  jest.mocked(invalidateServiceSteps).mockClear();
  jest.mocked(serviceStepService.update).mockResolvedValue(MANDI);
});

describe("ServiceStepsScreen", () => {
  it("opens on Grooming, counts live steps per kind, and narrows one load", async () => {
    renderWithAuth(<ServiceStepsScreen />);

    expect(await screen.findByText("Mandi")).toBeInTheDocument();
    expect(pill("Grooming")).toHaveAttribute("aria-pressed", "true");
    expect(namesInTable()).toEqual(["Mandi", "Gunting", "Blow dry"]);

    // The deleted Potong kuku is not counted.
    expect(pill("Grooming")).toHaveTextContent("3");
    expect(pill("Hotel")).toHaveTextContent("1");
    expect(pill("Antar-Jemput")).toHaveTextContent("0");

    const mandiRow = screen.getByText("Mandi").closest("tr")!;
    expect(within(mandiRow).getByText("3 layanan")).toBeInTheDocument();
    const guntingRow = screen.getByText("Gunting").closest("tr")!;
    expect(within(guntingRow).getByText("Belum dipakai")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Tampilkan yang dihapus"));
    expect(namesInTable()).toEqual(["Mandi", "Gunting", "Blow dry", "Potong kuku"]);
    const deletedRow = screen.getByText("Potong kuku").closest("tr")!;
    expect(within(deletedRow).getByText("Dihapus")).toBeInTheDocument();
    expect(within(deletedRow).getByText("—")).toBeInTheDocument();
    expect(pill("Grooming")).toHaveTextContent("3");

    await userEvent.click(pill("Hotel"));
    expect(namesInTable()).toEqual(["Cek kesehatan"]);

    // Narrowed on the client: switching pills and toggling asked for nothing.
    expect(serviceStepService.list).toHaveBeenCalledTimes(1);
    expect(serviceStepService.list).toHaveBeenCalledWith(
      expect.objectContaining({ includeDeleted: true }),
    );
    expect(serviceStepService.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ serviceKind: expect.anything() }),
    );
  });

  it("adds to the kind whose pill is on, then re-reads and refreshes that kind's pickers", async () => {
    jest
      .mocked(serviceStepService.create)
      .mockResolvedValue(
        makeServiceStep({ name: "Mandi", serviceKind: "hotel", sortOrder: 1 }),
      );

    renderWithAuth(<ServiceStepsScreen />);
    await screen.findByText("Mandi");
    await userEvent.click(pill("Hotel"));

    await userEvent.click(screen.getByRole("button", { name: "Tambah tahapan" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/daftar tahapan Hotel/);

    const field = within(dialog).getByLabelText(/Nama tahapan/);
    expect(field).toHaveAttribute("placeholder", "mis. Mandi");
    await userEvent.type(field, "  Mandi  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah tahapan" }));

    await waitFor(() =>
      expect(serviceStepService.create).toHaveBeenCalledWith({
        serviceKind: "hotel",
        name: "Mandi",
      }),
    );
    await waitFor(() => expect(serviceStepService.list).toHaveBeenCalledTimes(2));
    expect(invalidateServiceSteps).toHaveBeenCalledWith("hotel");
    expect(swalToast).toHaveBeenCalledWith("Tahapan ditambahkan.");
  });

  it("puts a name clash on the field", async () => {
    jest
      .mocked(serviceStepService.create)
      .mockRejectedValue(new ApiError("Step 'Mandi' already exists", 409));

    renderWithAuth(<ServiceStepsScreen />);
    await screen.findByText("Mandi");

    await userEvent.click(screen.getByRole("button", { name: "Tambah tahapan" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Nama tahapan/), "mandi");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah tahapan" }));

    expect(
      await within(dialog).findByText('"mandi" sudah ada di tahapan Grooming. Pakai nama lain.'),
    ).toBeInTheDocument();
    expect(invalidateServiceSteps).not.toHaveBeenCalled();
  });

  it("warns how many services a rename reaches, and toasts how many it rewrote", async () => {
    jest
      .mocked(serviceStepService.update)
      .mockResolvedValue({ ...MANDI, name: "Mandi kutu", renamedServiceCount: 3 });

    renderWithAuth(<ServiceStepsScreen />);
    await screen.findByText("Mandi");

    const menu = await openRowMenu("Mandi");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Ubah nama/ }));

    const dialog = screen.getByRole("dialog");
    // Said before the click.
    expect(dialog).toHaveTextContent(
      "3 layanan memakai tahapan ini dan ikut berganti nama.",
    );
    expect(dialog).toHaveTextContent(
      "Booking yang sudah dibuat tetap memakai nama lama.",
    );

    const name = within(dialog).getByLabelText(/Nama tahapan/);
    await userEvent.clear(name);
    await userEvent.type(name, "Mandi kutu");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan tahapan" }));

    await waitFor(() =>
      expect(serviceStepService.update).toHaveBeenCalledWith("step-mandi", {
        name: "Mandi kutu",
      }),
    );
    expect(swalToast).toHaveBeenCalledWith(
      "Nama tahapan disimpan. 3 layanan ikut diperbarui.",
    );
    expect(invalidateServiceSteps).toHaveBeenCalledWith("grooming");
  });

  it("renames an unused step with no warning and no count in the toast", async () => {
    jest
      .mocked(serviceStepService.update)
      .mockResolvedValue({ ...GUNTING, name: "Cukur", renamedServiceCount: 0 });

    renderWithAuth(<ServiceStepsScreen />);
    await screen.findByText("Gunting");

    const menu = await openRowMenu("Gunting");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Ubah nama/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent(/ikut berganti nama/);

    const name = within(dialog).getByLabelText(/Nama tahapan/);
    await userEvent.clear(name);
    await userEvent.type(name, "Cukur");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan tahapan" }));

    await waitFor(() =>
      expect(swalToast).toHaveBeenCalledWith("Nama tahapan disimpan."),
    );
  });

  it("keeps the delete dialog open on a 409 and shows the server's count", async () => {
    jest.mocked(serviceStepService.remove).mockRejectedValue(
      new ApiError("Cannot delete service step", 409, {
        reason:
          "3 service(s) still use 'Mandi'. Retire it instead, or remove it from those services first.",
      }),
    );

    renderWithAuth(<ServiceStepsScreen />);
    await screen.findByText("Mandi");

    const menu = await openRowMenu("Mandi");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Hapus/ }));

    const dialog = screen.getByRole("dialog");
    // Said before the click, not only after the refusal.
    expect(dialog).toHaveTextContent(/ditolak selama masih ada layanan yang memakainya/);
    expect(dialog).toHaveTextContent(/sekarang 3 layanan/);
    expect(dialog).toHaveTextContent(/Nonaktifkan/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Hapus" }));

    expect(
      await within(dialog).findByText(/3 service\(s\) still use 'Mandi'/),
    ).toBeInTheDocument();
    expect(serviceStepService.remove).toHaveBeenCalledWith("step-mandi");
    expect(invalidateServiceSteps).not.toHaveBeenCalled();
  });

  it("moves a step up by swapping sortOrder with the one above", async () => {
    renderWithAuth(<ServiceStepsScreen />);
    await screen.findByText("Mandi");

    // Nothing above the first.
    const top = await openRowMenu("Mandi");
    expect(within(top).getByRole("menuitem", { name: /Naikkan/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.keyboard("{Escape}");

    const menu = await openRowMenu("Gunting");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Naikkan/ }));

    await waitFor(() => expect(serviceStepService.update).toHaveBeenCalledTimes(2));
    expect(serviceStepService.update).toHaveBeenCalledWith("step-gunting", {
      sortOrder: 0,
    });
    expect(serviceStepService.update).toHaveBeenCalledWith("step-mandi", {
      sortOrder: 1,
    });
    await waitFor(() => expect(serviceStepService.list).toHaveBeenCalledTimes(2));
    expect(invalidateServiceSteps).toHaveBeenCalledWith("grooming");
    expect(swalToast).toHaveBeenCalledWith("Urutan tahapan disimpan.");
  });

  it("offers Pulihkan, and only that, on a deleted row", async () => {
    jest.mocked(serviceStepService.restore).mockResolvedValue(POTONG_KUKU);

    renderWithAuth(<ServiceStepsScreen />);
    await screen.findByText("Mandi");
    await userEvent.click(screen.getByLabelText("Tampilkan yang dihapus"));

    const menu = await openRowMenu("Potong kuku");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Pulihkan/ }));

    await waitFor(() =>
      expect(serviceStepService.restore).toHaveBeenCalledWith("step-potong-kuku"),
    );
    expect(invalidateServiceSteps).toHaveBeenCalledWith("grooming");
  });

  it("says a kind has no steps yet and offers the first", async () => {
    renderWithAuth(<ServiceStepsScreen />);
    await screen.findByText("Mandi");
    await userEvent.click(pill("Antar-Jemput"));

    expect(screen.getByText("Belum ada tahapan di Antar-Jemput.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Tambah yang pertama/ }));
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", { name: "Tambah tahapan" }),
    ).toBeInTheDocument();
  });

  it("gives a read-only role the lists and nothing to press", async () => {
    renderWithAuth(<ServiceStepsScreen />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "services", actions: ["read"] },
      ],
    });

    expect(await screen.findByText("Mandi")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Aksi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Aksi untuk/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Tambah/ })).not.toBeInTheDocument();
  });

  it("lets services:update add, rename, move and retire, but not delete", async () => {
    renderWithAuth(<ServiceStepsScreen />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "services", actions: ["read", "update"] },
      ],
    });
    await screen.findByText("Mandi");

    expect(screen.getByRole("button", { name: "Tambah tahapan" })).toBeInTheDocument();

    const menu = await openRowMenu("Gunting");
    for (const item of [/Ubah nama/, /Naikkan/, /Turunkan/, /Nonaktifkan/]) {
      expect(within(menu).getByRole("menuitem", { name: item })).toBeInTheDocument();
    }
    expect(within(menu).queryByRole("menuitem", { name: /Hapus/ })).not.toBeInTheDocument();
  });

  it("needs no business-line grant — the kinds are the product's own", async () => {
    renderWithAuth(<ServiceStepsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "services", actions: ["read", "update"] }],
    });

    expect(await screen.findByText("Mandi")).toBeInTheDocument();
    expect(pill("Grooming")).toHaveAttribute("aria-pressed", "true");
  });
});
