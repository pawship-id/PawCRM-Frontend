import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ZonesPanel } from "@/features/settings/components/ZonesPanel";
import { useZoneList } from "@/features/settings/hooks/useZoneList";
import { ApiError } from "@/services/api-error";
import { zoneService } from "@/services/zone.service";
import type { Zone } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/zone.service");
jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

/**
 * Pengaturan › Layanan › Zona.
 *
 * WHAT THESE TESTS ARE FOR. A zone is `[min, max)` and no two overlap. The
 * dialog checks that before sending, so the ways it can go wrong are at the
 * edges: refusing two zones that only touch, letting a sliver through, reading
 * "2,5" wrongly, or losing the server's 409 when somebody saved meanwhile.
 */
function zone(overrides: Partial<Zone> & Pick<Zone, "_id" | "name" | "minKm" | "maxKm">): Zone {
  return {
    tenantId: "t1",
    nameKey: overrides.name.toLowerCase(),
    description: null,
    createdBy: null,
    deletedAt: null,
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

const ZONA_A = zone({ _id: "z1", name: "Zona A", minKm: 1, maxKm: 3, description: "Citraland" });
const ZONA_LAMA = zone({
  _id: "z9",
  name: "Zona Lama",
  minKm: 10,
  maxKm: 20,
  deletedAt: "2026-09-10T00:00:00.000Z",
});

function Harness() {
  const list = useZoneList();
  return <ZonesPanel list={list} />;
}

async function openCreate() {
  renderWithAuth(<Harness />);
  await screen.findByText("Zona A");
  await userEvent.click(screen.getByRole("button", { name: "Tambah zona" }));
  return screen.getByRole("dialog");
}

async function fill(dialog: HTMLElement, name: string, min: string, max: string) {
  await userEvent.type(within(dialog).getByLabelText(/Nama zona/), name);
  await userEvent.type(within(dialog).getByLabelText(/Jarak minimal/), min);
  await userEvent.type(within(dialog).getByLabelText(/Jarak maksimal/), max);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(zoneService.list).mockResolvedValue({
    items: [ZONA_A, ZONA_LAMA],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
  jest.mocked(zoneService.create).mockResolvedValue(ZONA_A);
});

describe("ZonesPanel", () => {
  it("lists live zones with their range, and deleted ones behind the toggle", async () => {
    renderWithAuth(<Harness />);

    const row = (await screen.findByText("Zona A")).closest("tr")!;
    expect(within(row).getByText("1–3 km")).toBeInTheDocument();
    expect(within(row).getByText("Citraland")).toBeInTheDocument();
    expect(screen.queryByText("Zona Lama")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Tampilkan yang dihapus/ }));
    const old = screen.getByText("Zona Lama").closest("tr")!;
    expect(within(old).getByText("Dihapus")).toBeInTheDocument();
    expect(within(old).getByRole("button", { name: /Pulihkan/ })).toBeInTheDocument();
  });

  it("creates a zone that starts exactly where another ends", async () => {
    const dialog = await openCreate();
    await fill(dialog, "Zona B", "3", "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah zona" }));

    await waitFor(() =>
      expect(zoneService.create).toHaveBeenCalledWith({
        name: "Zona B",
        description: null,
        minKm: 3,
        maxKm: 5,
      }),
    );
  });

  it("refuses an overlap before sending, naming the zone in the way", async () => {
    const dialog = await openCreate();
    await fill(dialog, "Zona B", "2,999", "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah zona" }));

    expect(within(dialog).getByText("Bertabrakan dengan Zona A (1–3 km).")).toBeInTheDocument();
    expect(zoneService.create).not.toHaveBeenCalled();
  });

  it("ignores a deleted zone's range, as the server does", async () => {
    const dialog = await openCreate();
    await fill(dialog, "Zona D", "12", "15");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah zona" }));

    await waitFor(() =>
      expect(zoneService.create).toHaveBeenCalledWith(
        expect.objectContaining({ minKm: 12, maxKm: 15 }),
      ),
    );
  });

  it("refuses a maximum not above the minimum, and more than three decimals", async () => {
    const dialog = await openCreate();
    await fill(dialog, "Zona B", "5", "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah zona" }));
    expect(within(dialog).getByText("Harus lebih besar dari jarak minimal.")).toBeInTheDocument();

    const max = within(dialog).getByLabelText(/Jarak maksimal/);
    await userEvent.clear(max);
    await userEvent.type(max, "6,1234");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah zona" }));
    expect(within(dialog).getAllByText(/maksimal 3 angka di belakang koma/)).toHaveLength(1);

    expect(zoneService.create).not.toHaveBeenCalled();
  });

  it("shows the server's 409 on the range when somebody saved meanwhile", async () => {
    jest.mocked(zoneService.create).mockRejectedValue(
      new ApiError("Zone range overlaps another zone", 409, {
        reason: "Rentang 3–5 km bertabrakan dengan Zona Baru (4–6 km).",
        details: [{ field: "minKm", message: "Bertabrakan dengan Zona Baru" }],
      }),
    );

    const dialog = await openCreate();
    await fill(dialog, "Zona B", "3", "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah zona" }));

    expect(
      await within(dialog).findByText("Rentang 3–5 km bertabrakan dengan Zona Baru (4–6 km)."),
    ).toBeInTheDocument();
  });

  it("lets an edit keep its own range", async () => {
    jest.mocked(zoneService.update).mockResolvedValue(ZONA_A);
    renderWithAuth(<Harness />);

    await userEvent.click(await screen.findByRole("button", { name: "Ubah Zona A" }));
    const dialog = screen.getByRole("dialog");
    const max = within(dialog).getByLabelText(/Jarak maksimal/);
    await userEvent.clear(max);
    await userEvent.type(max, "4");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan zona" }));

    await waitFor(() =>
      expect(zoneService.update).toHaveBeenCalledWith("z1", {
        name: "Zona A",
        description: "Citraland",
        minKm: 1,
        maxKm: 4,
      }),
    );
  });
});
