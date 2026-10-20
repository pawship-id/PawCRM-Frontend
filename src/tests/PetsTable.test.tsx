import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { petOptionFields, primePetOptions } from "./helpers/petOptions";
import { PetsTable } from "@/features/pets/components/PetsTable";
import { petOptionService } from "@/services/petOption.service";
import type { Pet, PetSort } from "@/types/api";

jest.mock("@/services/pet.service");
jest.mock("@/services/petOption.service");
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

const pet = (overrides: Partial<Pet> = {}): Pet => ({
  _id: "5a7f1f77bcf86cd799439033",
  tenantId: "507f1f77bcf86cd799439011",
  customerId: "5a7f1f77bcf86cd799439022",
  name: "Bella",
  sex: "female",
  ...petOptionFields({ species: "Anjing", breed: "Domestic" }),
  birthDate: null,
  weightKg: 12.4,
  color: null,
  microchipNo: null,
  description: null,
  internalNotes: null,
  preferences: { text: null, tags: [] },
  medical: {
    allergies: [],
    conditions: [],
    medications: [],
    vaccinations: [],
    vet: { clinicName: null, phone: null },
  },
  photo: null,
  isActive: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

async function renderTable(
  pets: Pet[],
  options: {
    sort?: PetSort;
    onSortChange?: (sort: PetSort) => void;
    permissions?: Parameters<typeof renderWithAuth>[1];
  } = {},
) {
  const view = renderWithAuth(
    <PetsTable
      pets={pets}
      loading={false}
      onChanged={jest.fn()}
      sort={options.sort ?? "newest"}
      onSortChange={options.onSortChange ?? jest.fn()}
    />,
    options.permissions,
  );
  // Let the tenant's pet-option list (usePetOptions) settle before asserting.
  await act(async () => {});
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  primePetOptions(petOptionService.list);
});

describe("PetsTable", () => {
  /**
   * HEADER SORTING (BO, 20 October 2026). Each sortable header asks for a
   * PET_SORTS name; the first click takes the column's natural direction — A
   * first for a name, the OLDEST animal first for Umur, the heaviest first.
   */
  describe("header sorting", () => {
    it.each([
      ["Nama", "nameAsc"],
      ["Umur", "ageDesc"],
      ["Berat", "weightDesc"],
    ] as const)("asks for %s by %s on the first click", async (header, sort) => {
      const onSortChange = jest.fn();
      await renderTable([pet()], { onSortChange });

      await userEvent.click(screen.getByRole("button", { name: header }));

      expect(onSortChange).toHaveBeenCalledWith(sort);
    });

    it.each([
      ["Umur", "ageDesc", "ageAsc"],
      ["Berat", "weightDesc", "weightAsc"],
      ["Nama", "nameAsc", "nameDesc"],
    ] as const)(
      "flips %s on the second click",
      async (header, current, next) => {
        const onSortChange = jest.fn();
        await renderTable([pet()], { sort: current, onSortChange });

        await userEvent.click(screen.getByRole("button", { name: header }));

        expect(onSortChange).toHaveBeenCalledWith(next);
      },
    );

    it("leaves Jenis, Ras, Status and Aksi plain", async () => {
      await renderTable([pet()]);

      for (const name of ["Jenis", "Ras", "Status", "Aksi"]) {
        expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      }
    });
  });

  it("says so when no pet matches", async () => {
    await renderTable([]);

    expect(
      screen.getByText("Belum ada hewan yang cocok dengan filter ini."),
    ).toBeInTheDocument();
  });

  it("shows a dash for an unknown age and weight", async () => {
    await renderTable([pet({ birthDate: null, weightKg: null })]);

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  describe("row menu", () => {
    it("puts a separator above a destructive Hapus", async () => {
      await renderTable([pet()]);

      await userEvent.click(
        screen.getByRole("button", { name: "Aksi untuk Bella" }),
      );
      const menu = screen.getByRole("menu");
      const items = within(menu).getAllByRole("menuitem");
      const hapus = within(menu).getByRole("menuitem", { name: /Hapus/ });

      expect(items.map((item) => item.textContent)).toEqual([
        "Detail",
        "Ubah",
        "Hapus",
      ]);
      expect(hapus).toHaveAttribute("data-variant", "destructive");
      // The rule sits directly before Hapus.
      expect(hapus.previousElementSibling).toHaveAttribute(
        "role",
        "separator",
      );
    });

    it("draws no separator for a role that cannot delete", async () => {
      await renderTable([pet()], {
        permissions: {
          isSuperAdmin: false,
          permissions: [{ feature: "pets", actions: ["read", "update"] }],
        },
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Aksi untuk Bella" }),
      );
      const menu = screen.getByRole("menu");

      expect(within(menu).queryByRole("menuitem", { name: /Hapus/ })).toBeNull();
      expect(within(menu).queryByRole("separator")).toBeNull();
    });
  });
});
