import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { petOptionFields, primePetOptions } from "./helpers/petOptions";
import { PetsScreen } from "@/features/pets/components/PetsScreen";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { petOptionService } from "@/services/petOption.service";
import type { PageResult, Pet, PetListQuery } from "@/types/api";

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/pets",
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/services/petOption.service");

/**
 * The Hewan list's ordering, against mocked services (BO header sorting,
 * 20 October 2026): set from the column headers and sent to the server as a
 * PET_SORTS name; the filter panel carries no Urutkan, and its Reset leaves
 * the header ordering alone.
 */
const PET = {
  _id: "p1",
  tenantId: "t1",
  customerId: "c1",
  name: "Bella",
  sex: "female",
  ...petOptionFields({ species: "Anjing" }),
  birthDate: null,
  weightKg: 4,
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
} as Pet;

function page(items: Pet[]): PageResult<Pet> {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  primePetOptions(petOptionService.list);
  jest.spyOn(petService, "list").mockResolvedValue(page([PET]));
  // The module header's customer tiles are not under test here.
  jest.spyOn(customerService, "stats").mockRejectedValue(new Error("skip"));
});

async function renderList() {
  const user = userEvent.setup();
  renderWithAuth(<PetsScreen />);
  await screen.findByText("Bella");
  return user;
}

/** The list's own requests — the module header counts pets with `limit: 1`. */
function listCalls(): PetListQuery[] {
  return (petService.list as jest.Mock).mock.calls
    .map(([query]) => query as PetListQuery)
    .filter((query) => query.limit !== 1);
}

const lastQuery = () => listCalls()[listCalls().length - 1];

describe("header sorting", () => {
  it("opens newest first", async () => {
    await renderList();

    expect(lastQuery().sort).toBe("newest");
  });

  it.each([
    ["Nama", "nameAsc"],
    ["Umur", "ageDesc"],
    ["Berat", "weightDesc"],
  ])("asks the server to sort by %s", async (header, sort) => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: header }));

    await waitFor(() => expect(lastQuery().sort).toBe(sort));
    expect(lastQuery().page).toBe(1);
  });

  it("offers no Urutkan in the filter panel", async () => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: "Filter" }));

    expect(screen.getByLabelText("Filter status perawatan")).toBeVisible();
    expect(screen.queryByLabelText("Urutkan")).not.toBeInTheDocument();
  });
});

it("keeps the header ordering through the panel's Reset", async () => {
  const user = await renderList();

  await user.click(screen.getByRole("button", { name: "Umur" }));
  await waitFor(() => expect(lastQuery().sort).toBe("ageDesc"));
  // The ordering is not a filter: the trigger still reads plain "Filter".
  expect(screen.getByText("Filter")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByLabelText("Filter status perawatan"));
  await user.click(await screen.findByRole("option", { name: "Nonaktif" }));
  await user.click(screen.getByRole("button", { name: "Terapkan" }));
  await waitFor(() =>
    expect(lastQuery()).toEqual(
      expect.objectContaining({ isActive: false, sort: "ageDesc" }),
    ),
  );

  expect(await screen.findByText("Filter (1)")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.click(screen.getByRole("button", { name: "Reset" }));

  await waitFor(() =>
    expect(lastQuery()).toEqual(
      expect.objectContaining({ isActive: undefined, sort: "ageDesc" }),
    ),
  );
});
