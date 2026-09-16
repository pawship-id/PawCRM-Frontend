import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingBookingCreateScreen } from "@/features/grooming";
import { DEFAULT_PET_OPTION_LABELS } from "@/hooks/usePetOptions";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import type {
  Booking,
  CreateBookingResult,
  Customer,
  Pet,
  Service,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  usePathname: () => "/dashboard/layanan/grooming/new",
}));

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const customers = customerService as jest.Mocked<typeof customerService>;
const pets = petService as jest.Mocked<typeof petService>;
const services = serviceService as jest.Mocked<typeof serviceService>;
const branches = branchService as jest.Mocked<typeof branchService>;
const businessLines = businessLineService as jest.Mocked<typeof businessLineService>;

const BRANCH_ID = "branch-1";

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

const customer = { _id: "cust-1", name: "Ibu Rina", phone: "0812-3456-7890" } as Customer;

const pet = {
  _id: "pet-1",
  name: "Bruno",
  size: "medium",
  breed: null,
  furType: null,
  weightKg: 6,
  preferences: { text: null, tags: [] },
  medical: {
    allergies: [],
    conditions: [],
    medications: [],
    vaccinations: [],
    vet: { clinicName: null, phone: null },
  },
} as unknown as Pet;

const grooming = {
  _id: "svc-1",
  name: "Basic Grooming",
  price: "150000.0000",
  durationMin: 90,
  isActive: true,
  hasVariants: false,
  variants: [],
  variantAxes: [],
  serviceType: "main",
  businessLineId: "line-groom",
  serviceLocations: [],
  addonServiceIds: [],
} as unknown as Service;

const created = {
  groupId: "grp-1",
  bookings: [{ _id: "bk-1", bookingNumber: "BK-260915-001" } as Booking],
} as CreateBookingResult;

beforeEach(() => {
  jest.clearAllMocks();
  customers.list.mockResolvedValue(page([customer]));
  pets.list.mockResolvedValue(page([pet]));
  services.list.mockResolvedValue(page([grooming]));
  bookings.create.mockResolvedValue(created);
  bookings.availability.mockResolvedValue([]);
  branches.list.mockResolvedValue(page([{ _id: BRANCH_ID, name: "Cibubur" }]) as never);
  businessLines.list.mockResolvedValue(
    page([{ _id: "line-groom", name: "Grooming" }]) as never,
  );
});

/** Ibu Rina, Bruno, Basic Grooming — the smallest booking there is. */
async function fillIn() {
  await userEvent.click(
    screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
  );
  await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));

  await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));

  await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
  await userEvent.click(await screen.findByRole("option", { name: /basic grooming/i }));

  fireEvent.change(screen.getByLabelText(/tanggal/i), { target: { value: "2026-09-16" } });
  fireEvent.change(screen.getByLabelText(/jam mulai/i), { target: { value: "10:30" } });
}

/**
 * Layanan › Grooming › Booking baru — `/dashboard/layanan/grooming/new`.
 *
 * WHAT IS PINNED HERE:
 *  - one `bookings[]` entry per picked animal, and no price or discount crosses
 *    the wire when nobody typed one;
 *  - somebody holding `bookings:setPrice` sends what they TYPED;
 *  - somebody without it sees the catalogue's price, and nothing to type into.
 */
describe("GroomingBookingCreateScreen", () => {
  it("sends one booking per animal, as requested, without prices nobody typed", async () => {
    renderWithAuth(<GroomingBookingCreateScreen />);

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith({
        customerId: "cust-1",
        branchId: BRANCH_ID,
        scheduledAt: new Date("2026-09-16T10:30").toISOString(),
        status: "requested",
        location: "in_store",
        forceClash: false,
        bookingDiscount: null,
        bookings: [
          {
            petId: "pet-1",
            serviceId: "svc-1",
            addonServiceIds: [],
            groomerUserId: null,
            internalNotes: null,
            price: null,
            discount: null,
          },
        ],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/booking/bk-1"));
  });

  it("sends the typed price and discount for somebody holding bookings:setPrice", async () => {
    renderWithAuth(<GroomingBookingCreateScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["create", "read", "setPrice"] }],
    });

    await fillIn();

    fireEvent.change(screen.getByLabelText("Harga dasar"), { target: { value: "120.000" } });
    fireEvent.change(screen.getByLabelText("Diskon"), { target: { value: "5.000" } });

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0]).toMatchObject({
      price: "120000",
      discount: { mode: "amount", value: "5000" },
    });
  });

  /*
    THE PAGE STAYS SCROLLABLE WHILE A LIST IS OPEN (15 September 2026). Radix
    Select locked it; the popover does not, and closes as soon as the page moves
    — but not while somebody scrolls the list itself.
  */
  it("closes the groomer list when the page scrolls, not when the list does", async () => {
    bookings.availability.mockResolvedValue([
      { _id: "user-1", fullName: "Sinta", groomerLevel: "senior", offReason: null },
    ]);
    renderWithAuth(<GroomingBookingCreateScreen />);

    await fillIn();

    /*
      jsdom measures every element as 0×0 at the top of the page, which reads to
      `useCloseBehindShellHeader` as a trigger already under the navbar — so ANY
      scroll would close the list. Put the trigger mid-screen, where it is in a
      browser, so this tests the page-scroll rule and nothing else.
    */
    const rect = jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        top: 400,
        bottom: 444,
        left: 0,
        right: 600,
        width: 600,
        height: 44,
        x: 0,
        y: 400,
        toJSON: () => ({}),
      } as DOMRect);

    try {
      await userEvent.click(await screen.findByRole("button", { name: "Groomer" }));
      const list = await screen.findByRole("listbox");

      /* The level rides beside the name, as the mockup writes it. */
      expect(screen.getByRole("option", { name: "Sinta · Senior" })).toBeInTheDocument();

      fireEvent.scroll(list);
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      fireEvent.scroll(document);
      await waitFor(() =>
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      );
    } finally {
      rect.mockRestore();
    }
  });

  /* Under "Bruno · Basic Grooming": the variant, coat before size, in smaller type. */
  it("names the variant in the summary — coat, then size", async () => {
    services.list.mockResolvedValue(
      page([
        {
          ...grooming,
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory", "furType"],
          variants: [
            {
              petType: null,
              sizeCategory: "medium",
              furType: "long",
              price: "180000.0000",
              durationMin: 90,
              isActive: true,
            },
          ],
        } as unknown as Service,
      ]),
    );
    pets.list.mockResolvedValue(page([{ ...pet, furType: "long" } as Pet]));

    renderWithAuth(<GroomingBookingCreateScreen />);

    await fillIn();

    const coat = DEFAULT_PET_OPTION_LABELS.furType.long ?? "long";
    const size = DEFAULT_PET_OPTION_LABELS.size.medium ?? "medium";

    expect(await screen.findByText(`${coat} · ${size}`)).toBeInTheDocument();
  });

  it("shows the catalogue's price read-only without bookings:setPrice", async () => {
    renderWithAuth(<GroomingBookingCreateScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["create", "read"] }],
    });

    await fillIn();

    expect(screen.queryByLabelText("Harga dasar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Diskon seluruh booking")).not.toBeInTheDocument();
    expect(screen.getByText("Harga katalog")).toBeInTheDocument();
  });
});
