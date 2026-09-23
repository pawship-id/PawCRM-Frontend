import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AntarJemputBookingForm } from "@/features/antar-jemput";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";
import type { Booking, CreateBookingResult, Customer, Pet, Service } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { primeVariantOptions } from "./helpers/variantOptions";

jest.mock("@/services/booking.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/variantOption.service");
jest.mock("@/services/zone.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  usePathname: () => "/dashboard/layanan/antar-jemput/new",
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

const customer = {
  _id: "cust-1",
  name: "Ibu Rina",
  phone: "0812-3456-7890",
  address: "Jl. Mawar No. 12",
} as Customer;

const animal = (id: string, name: string) =>
  ({
    _id: id,
    name,
    size: "medium",
    breed: null,
    furType: null,
    weightKg: 6,
  }) as unknown as Pet;

const ride = {
  _id: "svc-aj",
  name: "Antar-Jemput",
  price: "45000.0000",
  durationMin: 30,
  isActive: true,
  hasVariants: false,
  variants: [],
  variantAxes: [],
  serviceType: "main",
  billingUnit: "per_visit",
  businessLineId: "line-aj",
  serviceLocations: ["in_home"],
  addonServiceIds: [],
} as unknown as Service;

const result = (id: string, groupId: string, leg: "pickup" | "delivery") =>
  ({
    groupId,
    bookings: [{ _id: id, bookingNumber: `BK-${id}`, tripLeg: leg } as Booking],
  }) as CreateBookingResult;

beforeEach(() => {
  jest.clearAllMocks();
  customers.list.mockResolvedValue(page([customer]));
  customers.getById.mockResolvedValue(customer);
  pets.list.mockResolvedValue(page([animal("pet-1", "Bruno"), animal("pet-2", "Coco")]));
  services.list.mockResolvedValue(page([ride]));
  bookings.availability.mockResolvedValue([]);
  bookings.list.mockResolvedValue(page([]) as never);
  bookings.create
    .mockResolvedValueOnce(result("bk-1", "grp-1", "pickup"))
    .mockResolvedValueOnce(result("bk-2", "grp-1", "delivery"));
  branches.list.mockResolvedValue(
    page([{ _id: BRANCH_ID, name: "Cabang Barat", address: "Jl. Sudirman 10" }]) as never,
  );
  businessLines.list.mockResolvedValue(page([{ _id: "line-aj", name: "Antar-Jemput" }]) as never);
  primeVariantOptions(variantOptionService.list, zoneService.list);
});

async function pickSlot(label: string, slot: string) {
  await userEvent.click(screen.getByRole("button", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: slot }));
}

async function pickCustomer() {
  await userEvent.click(
    screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
  );
  await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
}

/**
 * Layanan › Antar-Jemput › Booking baru — BO's notes of 21 September 2026,
 * reopened 23 September.
 *
 * WHAT IS PINNED HERE:
 *  - one ride is one booking: the first animal is its own, the rest passengers;
 *  - Pulang-pergi is TWO saves, the second into the visit the first made;
 *  - "+ Antar-jemput" from a grooming SERVES that grooming — `linkedBookingIds`
 *    on the ride — and leaves its visit alone;
 *  - the animals are picked before any booking is offered to link.
 */
describe("AntarJemputBookingForm", () => {
  it("saves Pulang-pergi as two rides in one visit, the other animals riding along", async () => {
    renderWithAuth(<AntarJemputBookingForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
    await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));
    await userEvent.click(screen.getByRole("button", { name: /coco/i }));

    await userEvent.click(screen.getByRole("radio", { name: /pulang-pergi/i }));

    await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
    await userEvent.click(await screen.findByRole("option", { name: "Antar-Jemput" }));

    fireEvent.change(screen.getByLabelText(/tanggal jemput/i), { target: { value: "2026-09-22" } });
    fireEvent.change(screen.getByLabelText(/tanggal antar/i), { target: { value: "2026-09-22" } });
    await pickSlot("Jam jemput", "08.30");
    await pickSlot("Jam antar", "13.00");

    await userEvent.click(screen.getByRole("button", { name: /simpan 2 booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalledTimes(2));

    const [first, second] = bookings.create.mock.calls.map(([input]) => input);
    expect(first).toMatchObject({
      customerId: "cust-1",
      branchId: BRANCH_ID,
      scheduledAt: new Date("2026-09-22T08:30").toISOString(),
      status: "requested",
      location: "in_home",
      /* Left as the customer's own address — sent as "the one on file". */
      tripAddress: null,
      bookings: [
        { petId: "pet-1", serviceId: "svc-aj", tripLeg: "pickup", passengerPetIds: ["pet-2"] },
      ],
    });
    expect(first).not.toHaveProperty("groupId");
    expect(second).toMatchObject({
      groupId: "grp-1",
      scheduledAt: new Date("2026-09-22T13:00").toISOString(),
      bookings: [{ petId: "pet-1", tripLeg: "delivery", passengerPetIds: ["pet-2"] }],
    });

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/booking/bk-1"));
  });

  it("starts from a grooming's page — its customer, animal and day — and serves it", async () => {
    const groomingBooking = {
      _id: "bk-groom",
      groupId: "grp-groom",
      customerId: "cust-1",
      petId: "pet-1",
      branchId: BRANCH_ID,
      status: "confirmed",
      bookingNumber: "BK-260922-001",
      petName: "Bruno",
      scheduledAt: new Date("2026-09-22T10:00").toISOString(),
      totalDurationMin: 90,
      tripLeg: null,
      service: { serviceId: "svc-groom", name: "Basic Grooming", addons: [] },
    } as unknown as Booking;
    bookings.getById.mockResolvedValue(groomingBooking);
    bookings.list.mockResolvedValue(page([groomingBooking]) as never);

    renderWithAuth(<AntarJemputBookingForm fromBookingId="bk-groom" />);

    /* Both ways by default: the van leaves before, and brings it home after. */
    expect(await screen.findByRole("radio", { name: /pulang-pergi/i })).toBeChecked();
    expect(await screen.findByRole("button", { name: /bruno/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
    await userEvent.click(await screen.findByRole("option", { name: "Antar-Jemput" }));
    await userEvent.click(screen.getByRole("button", { name: /simpan 2 booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalledTimes(2));

    /*
      IT SERVES THE GROOMING, IT DOES NOT JOIN ITS VISIT (23 September 2026).
      The ride names the booking; the grooming's own `groupId` is left alone.
      Only the delivery joins a group — the pickup's, so pulang-pergi is one
      visit.
    */
    expect(bookings.create.mock.calls[0][0]).not.toHaveProperty("groupId");
    expect(bookings.create.mock.calls[0][0]).toMatchObject({
      /* Half an hour before the grooming, and once its 90 minutes are done. */
      scheduledAt: new Date("2026-09-22T09:30").toISOString(),
      bookings: [{ linkedBookingIds: ["bk-groom"] }],
    });
    expect(bookings.create.mock.calls[1][0]).toMatchObject({
      groupId: "grp-1",
      scheduledAt: new Date("2026-09-22T11:30").toISOString(),
      bookings: [{ linkedBookingIds: ["bk-groom"] }],
    });
  });

  /*
    NOTE 2 REOPENED (23 September 2026): the animals are picked first, and the
    list offers only their bookings — never the other dog's, never a ride.
  */
  it("offers no booking to link until an animal is picked, then only that animal's", async () => {
    bookings.list.mockResolvedValue(
      page([
        {
          _id: "bk-bruno",
          groupId: "grp-a",
          customerId: "cust-1",
          petId: "pet-1",
          petName: "Bruno",
          status: "confirmed",
          bookingNumber: "BK-260922-001",
          scheduledAt: new Date("2026-09-22T10:00").toISOString(),
          tripLeg: null,
          service: { serviceId: "svc-groom", name: "Basic Grooming", addons: [] },
        },
        {
          _id: "bk-momo",
          groupId: "grp-b",
          customerId: "cust-1",
          petId: "pet-2",
          petName: "Coco",
          status: "confirmed",
          bookingNumber: "BK-260922-002",
          scheduledAt: new Date("2026-09-22T10:00").toISOString(),
          tripLeg: null,
          service: { serviceId: "svc-groom", name: "Basic Grooming", addons: [] },
        },
        {
          _id: "bk-ride",
          groupId: "grp-c",
          customerId: "cust-1",
          petId: "pet-1",
          petName: "Bruno",
          status: "confirmed",
          bookingNumber: "BK-260922-003",
          scheduledAt: new Date("2026-09-22T08:00").toISOString(),
          tripLeg: "pickup",
          service: { serviceId: "svc-ride", name: "Antar-Jemput", addons: [] },
        },
      ]) as never,
    );

    renderWithAuth(<AntarJemputBookingForm />);

    await pickCustomer();

    expect(
      await screen.findByText(/pilih hewannya dulu/i),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));

    expect(
      await screen.findByRole("checkbox", { name: /BK-260922-001/ }),
    ).toBeInTheDocument();
    /* Coco is not in the van; a ride cannot serve a ride. */
    expect(screen.queryByRole("checkbox", { name: /BK-260922-002/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /BK-260922-003/ })).toBeNull();
  });

  it("offers the time every half hour, not as free text (BO's note 8)", async () => {
    renderWithAuth(<AntarJemputBookingForm />);

    await userEvent.click(await screen.findByRole("button", { name: "Jam" }));

    expect(await screen.findByRole("option", { name: "09.30" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "09.15" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(48);
  });
});
