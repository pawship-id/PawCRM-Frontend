import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingSettingsScreen } from "@/features/grooming";
import { bookingService } from "@/services/booking.service";
import { petOptionService } from "@/services/petOption.service";
import { tenantService } from "@/services/tenant.service";
import type { GroomerCapacityDay, GroomingSettings, Tenant } from "@/types/api";

import {
  makePetOption,
  PET_OPTION_FIXTURES,
  primePetOptions,
} from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/layanan/grooming/pengaturan",
  useSearchParams: () => new URLSearchParams(),
}));

// A save toasts; mock the library so no real dialog is built.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

jest.mock("@/services/booking.service");
jest.mock("@/services/petOption.service");
jest.mock("@/services/tenant.service");
jest.mock("@/services/user.service");

/**
 * Layanan › Grooming › Pengaturan, "Nominal per ukuran" — on the TENANT'S sizes
 * (14 September 2026), not a fixed three.
 *
 * WHAT IS PINNED HERE:
 *  - a size the shop added is a box of its own, in the tenant's order;
 *  - the screen does not draw the size grid before the size list has loaded;
 *  - a save sends the new size's nominal AND carries back a stored nominal for
 *    a size that is not on screen, since the PATCH replaces the object whole;
 *  - the shared lists card leads to Data hewan, where sizes are edited, and to
 *    Tahapan's own list rather than the catalogue.
 */
const XL = makePetOption({
  type: "size",
  code: "xl",
  label: "Ekstra besar",
  sortOrder: 3,
});

const GROOMING: GroomingSettings = {
  commission: {
    service: {
      mode: "size_nominal",
      percent: 0,
      // "jumbo" is not one of the tenant's options — a size since deleted.
      sizeNominal: { small: 30000, medium: 45000, large: 60000, jumbo: 80000 },
    },
    addon: { enabled: false, mode: "percentage", percent: 0, fixed: 0 },
    travel: { enabled: false, mode: "percentage", percent: 0, fixed: 0 },
  },
  capacity: { defaultMinutes: 420, overLimit: "warn" },
};

const DAY: GroomerCapacityDay = {
  date: "2026-09-14",
  defaultMinutes: 420,
  overLimit: "warn",
  groomers: [],
};

function tenant(grooming: GroomingSettings = GROOMING): Tenant {
  return { _id: "t1", name: "Paw", settings: { grooming } } as unknown as Tenant;
}

beforeEach(() => {
  jest.clearAllMocks();
  primePetOptions(petOptionService.list, [...PET_OPTION_FIXTURES, XL]);
  (tenantService.me as jest.Mock).mockResolvedValue(tenant());
  (tenantService.updateSettings as jest.Mock).mockResolvedValue(tenant());
  (bookingService.capacity as jest.Mock).mockResolvedValue(DAY);
});

describe("GroomingSettingsScreen — nominal per size", () => {
  it("draws one box per size the tenant has, a size the shop added included", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const xl = await screen.findByLabelText("Ekstra besar");
    expect(xl).toHaveValue("");
    expect(screen.getByLabelText("Kecil")).toHaveValue("30000");
    expect(screen.getByLabelText("Sedang")).toHaveValue("45000");
    expect(screen.getByLabelText("Besar")).toHaveValue("60000");
    // A stored key for a size that is not an option is not a row.
    expect(screen.queryByDisplayValue("80000")).not.toBeInTheDocument();
  });

  it("does not draw the size grid while the size list is still loading", async () => {
    (petOptionService.list as jest.Mock).mockReturnValue(new Promise(() => {}));

    renderWithAuth(<GroomingSettingsScreen />);

    // The tenant has loaded — the header's buttons are drawn for its draft…
    const save = await screen.findByRole("button", { name: "Simpan pengaturan" });
    // …but nothing is editable and nothing can be saved until the sizes are in.
    expect(screen.getByText(/Memuat pengaturan grooming/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Kecil")).not.toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it("sends the added size's nominal and keeps the one for a size not on screen", async () => {
    const user = userEvent.setup();
    renderWithAuth(<GroomingSettingsScreen />);

    const xl = await screen.findByLabelText("Ekstra besar");
    await user.type(xl, "55000");
    await user.click(screen.getByRole("button", { name: "Simpan pengaturan" }));

    await waitFor(() => expect(tenantService.updateSettings).toHaveBeenCalledTimes(1));
    expect(
      (tenantService.updateSettings as jest.Mock).mock.calls[0][0].grooming.commission
        .service.sizeNominal,
    ).toEqual({ small: 30000, medium: 45000, large: 60000, jumbo: 80000, xl: 55000 });
  });

  it("holds up the save while an added size is still empty", async () => {
    const user = userEvent.setup();
    renderWithAuth(<GroomingSettingsScreen />);

    const medium = await screen.findByLabelText("Sedang");
    await user.clear(medium);
    await user.type(medium, "50000");

    expect(screen.getByRole("button", { name: "Simpan pengaturan" })).toBeDisabled();
    expect(screen.getByText(/isian di tab Komisi belum benar/)).toBeInTheDocument();
  });

  it("says the rule once under the row, in default colours rather than red", async () => {
    (tenantService.me as jest.Mock).mockResolvedValue(
      tenant({
        ...GROOMING,
        commission: {
          ...GROOMING.commission,
          service: { ...GROOMING.commission.service, sizeNominal: {} },
        },
      }),
    );

    renderWithAuth(<GroomingSettingsScreen />);

    const boxes = await Promise.all(
      ["Kecil", "Sedang", "Besar", "Ekstra besar"].map((label) =>
        screen.findByLabelText(label),
      ),
    );
    const notes = screen.getAllByText(/Isi angka saja tanpa titik/);
    expect(notes).toHaveLength(1);
    expect(notes[0]).not.toHaveClass("text-danger");

    boxes.forEach((box) => {
      expect(box).not.toHaveClass("border-danger");
      // `ui/input` paints a red border on aria-invalid, so it must stay off.
      expect(box).not.toHaveAttribute("aria-invalid");
      expect(box).toHaveAttribute("aria-describedby", notes[0].id);
    });
  });
});

describe("GroomingSettingsScreen — lists shared by every service", () => {
  it("leads to Data hewan for species, breeds, sizes and coats", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /Data hewan/ });
    expect(link).toHaveAttribute("href", "/dashboard/pengaturan/layanan");
    expect(screen.queryByText("Opsi Varian")).not.toBeInTheDocument();
    // Nothing is waiting on anything any more.
    expect(screen.queryByText("Segera")).not.toBeInTheDocument();
  });

  it("leads Ras to the Ras section, right before Tahapan", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /^Ras/ });
    expect(link).toHaveAttribute("href", "/dashboard/pengaturan/layanan?bagian=ras");

    const titles = screen
      .getAllByRole("link")
      .map((item) => item.textContent ?? "")
      .filter((text) => /^(Tahapan|Ras)/.test(text));
    expect(titles.map((text) => text.split(/\s|Buka/)[0])).toEqual(["Ras", "Tahapan"]);
  });

  it("leads Add-on to the Add-on section, not the catalogue", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /^Add-on/ });
    expect(link).toHaveAttribute("href", "/dashboard/pengaturan/layanan?bagian=addon");
  });

  it("leads Zona & Perjalanan to the Zona section", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /Zona & Perjalanan/ });
    expect(link).toHaveAttribute("href", "/dashboard/pengaturan/layanan?bagian=zona");
  });

  it("leads to the Tahapan list, not the catalogue", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /Tahapan/ });
    expect(link).toHaveAttribute("href", "/dashboard/pengaturan/layanan?bagian=tahapan");
    expect(link).toHaveTextContent("Urutan kerja yang dipakai jadwal dan komisi");
  });

  it("does not link a role that may not open Pengaturan › Layanan", async () => {
    renderWithAuth(<GroomingSettingsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "tenants", actions: ["read"] }],
    });

    expect(await screen.findByText("Data hewan")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Data hewan/ })).not.toBeInTheDocument();
    expect(screen.getByText("Tahapan")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tahapan/ })).not.toBeInTheDocument();
  });
});
