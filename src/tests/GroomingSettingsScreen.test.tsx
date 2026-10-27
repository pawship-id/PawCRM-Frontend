import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingSettingsScreen } from "@/features/grooming";
import { bookingService } from "@/services/booking.service";
import { petOptionService } from "@/services/petOption.service";
import { tenantService } from "@/services/tenant.service";
import { zoneService } from "@/services/zone.service";
import type { GroomerCapacityDay, GroomingSettings, Tenant, Zone } from "@/types/api";

import {
  makePetOption,
  petOptionId,
  PET_OPTION_FIXTURES,
  primePetOptions,
} from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";
import { primeVariantOptions } from "./helpers/variantOptions";
import { variantOptionService } from "@/services/variantOption.service";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/service/grooming/settings",
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
jest.mock("@/services/zone.service");
jest.mock("@/services/variantOption.service");

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
  label: "Ekstra besar",
  sortOrder: 3,
});

const GROOMING: GroomingSettings = {
  homeGrooming: { feeUnit: "per_visit", fees: [] },
  commission: {
    service: {
      mode: "size_nominal",
      percent: 0,
      /*
        KEYED BY THE OPTION'S `_id` (25 September 2026), which here is what
        `makePetOption` derives from the seeded codes. "jumbo" is not one of
        the tenant's options at all — a size since deleted.
      */
      sizeNominal: {
        "opt-size-kecil": 30000,
        "opt-size-sedang": 45000,
        "opt-size-besar": 60000,
        jumbo: 80000,
      },
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
    ).toEqual({
      "opt-size-kecil": 30000,
      "opt-size-sedang": 45000,
      "opt-size-besar": 60000,
      jumbo: 80000,
      "opt-size-ekstra-besar": 55000,
    });
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
    expect(link).toHaveAttribute("href", "/dashboard/settings/services");
    expect(screen.queryByText("Opsi Varian")).not.toBeInTheDocument();
    // Nothing is waiting on anything any more.
    expect(screen.queryByText("Segera")).not.toBeInTheDocument();
  });

  it("leads Ras to the Ras section, right before Tahapan", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /^Ras/ });
    expect(link).toHaveAttribute("href", "/dashboard/settings/services?bagian=ras");

    const titles = screen
      .getAllByRole("link")
      .map((item) => item.textContent ?? "")
      .filter((text) => /^(Tahapan|Ras)/.test(text));
    expect(titles.map((text) => text.split(/\s|Buka/)[0])).toEqual(["Ras", "Tahapan"]);
  });

  it("leads Add-on to the Add-on section, not the catalogue", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /^Add-on/ });
    expect(link).toHaveAttribute("href", "/dashboard/settings/services?bagian=addon");
  });

  it("leads Zona & Perjalanan to the Zona section", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /Zona & Perjalanan/ });
    expect(link).toHaveAttribute("href", "/dashboard/settings/services?bagian=zona");
  });

  it("leads to the Tahapan list, not the catalogue", async () => {
    renderWithAuth(<GroomingSettingsScreen />);

    const link = await screen.findByRole("link", { name: /Tahapan/ });
    expect(link).toHaveAttribute("href", "/dashboard/settings/services?bagian=tahapan");
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

/*
  ─── HOME GROOMING (10 October 2026) ───────────────────────────────────────────

  Every home-grooming setting is in one tab: how a visit's fee is counted, and
  what each ZONE costs. The zones are the ones made under Pengaturan › Layanan ›
  Zona — chosen here, never created here, and carrying no money themselves.
*/
describe("GroomingSettingsScreen — Home grooming", () => {
  const zone = (id: string, name: string, minKm: number, maxKm: number): Zone => ({
    _id: id,
    tenantId: "t1",
    name,
    nameKey: name.toLowerCase(),
    description: null,
    minKm,
    maxKm,
    createdBy: null,
    deletedAt: null,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
  });

  const ZONES = [zone("zone-a", "Zona A", 0, 3), zone("zone-b", "Zona B", 3, 6)];

  /* Every size priced, so nothing on Komisi holds up a save made from here. */
  const priced: GroomingSettings = {
    ...GROOMING,
    commission: {
      ...GROOMING.commission,
      service: {
        ...GROOMING.commission.service,
        sizeNominal: {
          ...GROOMING.commission.service.sizeNominal,
          "opt-size-ekstra-besar": 55000,
        },
      },
    },
  };

  const withFees = (feeUnit: "per_visit" | "per_pet", fees: { zoneId: string; fee: number }[]) =>
    tenant({ ...priced, homeGrooming: { feeUnit, fees } });

  async function openTab() {
    const user = userEvent.setup();
    renderWithAuth(<GroomingSettingsScreen />);
    await user.click(await screen.findByRole("tab", { name: "Home grooming" }));
    return user;
  }

  beforeEach(() => {
    primeVariantOptions(variantOptionService.list, zoneService.list, { zones: ZONES });
    (tenantService.me as jest.Mock).mockResolvedValue(withFees("per_visit", []));
  });

  it("is a tab of its own, beside Komisi and Kapasitas", async () => {
    await openTab();

    expect(screen.getByText("Biaya kunjungan dihitung", { selector: "h2, h3, div" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /per kunjungan/i })).toBeChecked();
  });

  it("shows the zones that already have a fee, with their range", async () => {
    (tenantService.me as jest.Mock).mockResolvedValue(
      withFees("per_visit", [{ zoneId: "zone-a", fee: 40000 }]),
    );
    await openTab();

    expect(await screen.findByLabelText("Biaya kunjungan Zona A")).toHaveValue("40000");
    expect(screen.getByText("0–3 km")).toBeInTheDocument();
    /* Zona B has no row: it is offered to add, not drawn as a zero. */
    expect(screen.queryByLabelText("Biaya kunjungan Zona B")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Zona B/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Zona A ·/ })).not.toBeInTheDocument();
  });

  it("adds a zone from the list, holds the save until it is priced, then sends it", async () => {
    const user = await openTab();

    await user.selectOptions(await screen.findByLabelText("Tambah zona"), "zone-b");

    const box = await screen.findByLabelText("Biaya kunjungan Zona B");
    expect(box).toHaveValue("");
    expect(screen.getByRole("button", { name: "Simpan pengaturan" })).toBeDisabled();

    await user.type(box, "70000");
    await user.click(screen.getByRole("button", { name: "Simpan pengaturan" }));

    await waitFor(() => expect(tenantService.updateSettings).toHaveBeenCalledTimes(1));
    expect(
      (tenantService.updateSettings as jest.Mock).mock.calls[0][0].grooming.homeGrooming,
    ).toEqual({ feeUnit: "per_visit", fees: [{ zoneId: "zone-b", fee: 70000 }] });
  });

  it("sends the unit that was chosen", async () => {
    const user = await openTab();

    await user.click(screen.getByRole("radio", { name: /per hewan/i }));
    await user.click(screen.getByRole("button", { name: "Simpan pengaturan" }));

    await waitFor(() => expect(tenantService.updateSettings).toHaveBeenCalledTimes(1));
    expect(
      (tenantService.updateSettings as jest.Mock).mock.calls[0][0].grooming.homeGrooming
        .feeUnit,
    ).toBe("per_pet");
  });

  it("removes a fee, so the zone costs nothing again", async () => {
    (tenantService.me as jest.Mock).mockResolvedValue(
      withFees("per_visit", [{ zoneId: "zone-a", fee: 40000 }]),
    );
    const user = await openTab();

    await user.click(await screen.findByRole("button", { name: "Hapus biaya Zona A" }));
    await user.click(screen.getByRole("button", { name: "Simpan pengaturan" }));

    await waitFor(() => expect(tenantService.updateSettings).toHaveBeenCalledTimes(1));
    expect(
      (tenantService.updateSettings as jest.Mock).mock.calls[0][0].grooming.homeGrooming.fees,
    ).toEqual([]);
  });

  it("draws a fee for a zone that is gone as such, with a way to clear it", async () => {
    (tenantService.me as jest.Mock).mockResolvedValue(
      withFees("per_visit", [{ zoneId: "zone-lama", fee: 9000 }]),
    );
    await openTab();

    expect(await screen.findByText("Zona sudah dihapus")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hapus biaya zona yang sudah dihapus" }),
    ).toBeInTheDocument();
  });

  it("points at the zone page when there is no zone yet", async () => {
    primeVariantOptions(variantOptionService.list, zoneService.list, { zones: [] });
    await openTab();

    expect(await screen.findByText(/Belum ada zona/)).toBeInTheDocument();
  });

  it("names the tab when a fee on it is wrong", async () => {
    (tenantService.me as jest.Mock).mockResolvedValue(
      withFees("per_visit", [{ zoneId: "zone-a", fee: 40000 }]),
    );
    const user = userEvent.setup();
    renderWithAuth(<GroomingSettingsScreen />);
    await user.click(await screen.findByRole("tab", { name: "Home grooming" }));
    const box = await screen.findByLabelText("Biaya kunjungan Zona A");
    await user.clear(box);
    await user.type(box, "empat");

    expect(await screen.findByText(/isian di tab Home grooming belum benar/)).toBeInTheDocument();
  });
});
