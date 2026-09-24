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
  /* About 2 km north of the branch — both ends pinned, so a ride can save. */
  location: { lat: -7.2395, lng: 112.7521 },
} as unknown as Customer;

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
  /* Sold everywhere — the Layanan picker is scoped to the chosen branch. */
  allBranches: true,
  branchIds: [],
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
    page([
      {
        _id: BRANCH_ID,
        name: "Cabang Barat",
        address: "Jl. Sudirman 10",
        /* A ride is priced between two pins, so the branch carries one. */
        location: { lat: -7.2575, lng: 112.7521 },
      },
    ]) as never,
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
 *  - Antar Jemput is TWO saves, the second into the visit the first made, and
 *    each direction carries its own pair of addresses;
 *  - "+ Antar-jemput" from a grooming SERVES that grooming — `linkedBookingIds`
 *    on the ride — and leaves its visit alone;
 *  - the animals are picked before any booking is offered to link.
 */
describe("AntarJemputBookingForm", () => {
  it("saves Antar Jemput as two rides in one visit, the other animals riding along", async () => {
    renderWithAuth(<AntarJemputBookingForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
    await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));
    await userEvent.click(screen.getByRole("button", { name: /coco/i }));

    /* The service comes first — Perjalanan is not on screen until it is picked. */
    expect(screen.queryByRole("radio", { name: /antar jemput/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
    await userEvent.click(await screen.findByRole("option", { name: "Antar-Jemput" }));

    await userEvent.click(await screen.findByRole("radio", { name: /antar jemput/i }));

    fireEvent.change(screen.getByLabelText(/tanggal jemput/i), { target: { value: "2026-09-22" } });
    fireEvent.change(screen.getByLabelText(/tanggal antar/i), { target: { value: "2026-09-22" } });
    await pickSlot("Jam jemput", "08.30");
    await pickSlot("Jam antar", "13.00");

    /*
      THE TWO DIRECTIONS ARE TWO JOURNEYS (23 September 2026): send the animal
      home to somewhere the pickup never went, and the delivery must carry it.
    */
    const sources = screen.getAllByRole("button", { name: /sumber alamat tujuan/i });
    expect(sources).toHaveLength(2);
    await userEvent.click(sources[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Ketik manual" }));

    const addresses = screen.getAllByLabelText(/^alamat$/i);
    await userEvent.type(addresses[addresses.length - 1], "Kantor Bu Rina");
    const lats = screen.getAllByLabelText(/latitude/i);
    const lngs = screen.getAllByLabelText(/longitude/i);
    fireEvent.change(lats[lats.length - 1], { target: { value: "-7.2700" } });
    fireEvent.change(lngs[lngs.length - 1], { target: { value: "112.7600" } });

    await userEvent.click(screen.getByRole("button", { name: /simpan 2 booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalledTimes(2));

    const [first, second] = bookings.create.mock.calls.map(([input]) => input);
    expect(first).toMatchObject({
      customerId: "cust-1",
      branchId: BRANCH_ID,
      scheduledAt: new Date("2026-09-22T08:30").toISOString(),
      /* A van is either written down or it is on — `requested` is not one of
         its four rungs (23 September 2026). */
      status: "draft",
      location: "in_home",
      /* A pickup starts at the customer's door and ends at the branch. */
      tripOrigin: { address: "Jl. Mawar No. 12", lat: -7.2395, lng: 112.7521 },
      tripDestination: { address: "Jl. Sudirman 10", lat: -7.2575, lng: 112.7521 },
      /* EVERY ANIMAL IN ONE LIST, and no `petId` at all (23 September 2026):
         a ride promotes none of the animals it carries. */
      bookings: [
        {
          serviceId: "svc-aj",
          tripLeg: "pickup",
          passengerPetIds: ["pet-1", "pet-2"],
        },
      ],
    });
    expect(first).not.toHaveProperty("groupId");
    /* The delivery leaves the branch for ITS OWN address, not the pickup's. */
    expect(second).toMatchObject({
      groupId: "grp-1",
      scheduledAt: new Date("2026-09-22T13:00").toISOString(),
      tripOrigin: { address: "Jl. Sudirman 10", lat: -7.2575, lng: 112.7521 },
      tripDestination: { address: "Kantor Bu Rina", lat: -7.27, lng: 112.76 },
      bookings: [
        { tripLeg: "delivery", passengerPetIds: ["pet-1", "pet-2"] },
      ],
    });

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/layanan/antar-jemput/bk-1"));
  });

  /*
    ─── UBAH IS THE SAME FORM, ALREADY FILLED IN (24 September 2026) ─────────

    The price and the discount were CREATE-ONLY, so an edit showed "Harga
    katalog" and no boxes: correcting a fare meant cancelling the booking and
    writing it again. `PATCH` takes both now, under `bookings:setPrice`.
  */
  describe("editing a ride", () => {
    const saved = (over: Record<string, unknown> = {}) =>
      ({
        _id: "bk-aj",
        groupId: "grp-1",
        customerId: "cust-1",
        branchId: BRANCH_ID,
        status: "draft",
        bookingNumber: "AJ-260923-001",
        petId: null,
        petName: null,
        scheduledAt: new Date("2026-09-23T09:00").toISOString(),
        tripLeg: "pickup",
        tripOrigin: { address: "Jl. Mawar No. 12", lat: -7.2395, lng: 112.7521 },
        tripDestination: { address: "Jl. Sudirman 10", lat: -7.2575, lng: 112.7521 },
        passengerPetIds: ["pet-1"],
        passengers: [{ _id: "pet-1", name: "Bruno", petSize: "small" }],
        linkedBookingIds: [],
        internalNotes: null,
        service: {
          serviceId: "svc-aj",
          name: "Antar-Jemput",
          price: "45000.0000",
          catalogPrice: "45000.0000",
          addons: [],
          sessions: [],
        },
        ...over,
      }) as unknown as Booking;

    async function openEdit(booking: Booking = saved()) {
      bookings.getById.mockResolvedValue(booking);
      renderWithAuth(<AntarJemputBookingForm bookingId={booking._id} />);
      await screen.findByLabelText("Harga dasar");
    }

    it("offers the price and the discount boxes, not a read-only figure", async () => {
      await openEdit();

      expect(screen.getByLabelText("Harga dasar")).toBeInTheDocument();
      expect(screen.getByLabelText("Diskon")).toBeInTheDocument();
      expect(screen.queryByText("Harga katalog")).not.toBeInTheDocument();
    });

    /*
      A PRICE EQUAL TO THE CATALOGUE'S IS NOT "TYPED". The box shows the quote
      but stays empty underneath, so the fare keeps following the zone — filling
      it would pin the fare the moment an address moved.
    */
    it("puts a price somebody typed back in the box, and leaves an untouched one following the catalogue", async () => {
      await openEdit(
        saved({
          service: {
            ...saved().service,
            price: "40000.0000",
            catalogPrice: "45000.0000",
            discount: { mode: "percent", value: "10.0000" },
          },
        }),
      );

      expect(screen.getByLabelText("Harga dasar")).toHaveValue("40.000");
      expect(screen.getByLabelText("Diskon")).toHaveValue("10");
    });

    it("sends the price and the discount it was given", async () => {
      await openEdit();

      /* `fireEvent.change` — select-all-and-type, which is how somebody
         replaces a box that redraws the quote the moment it is emptied. */
      fireEvent.change(screen.getByLabelText("Harga dasar"), {
        target: { value: "40000" },
      });

      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.update).toHaveBeenCalled());
      expect(bookings.update).toHaveBeenCalledWith(
        "bk-aj",
        expect.objectContaining({ price: "40000" }),
      );
    });

    /*
      ⚠️ AND SENDS NEITHER WHEN NEITHER MOVED. The server asks for
      `bookings:setPrice` whenever the payload carries a price, so an edit that
      only changed the notes must not carry one.
    */
    it("sends no price when only the note changed", async () => {
      await openEdit();

      await userEvent.type(
        screen.getByLabelText(/catatan internal/i),
        "Lewat gerbang belakang",
      );
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.update).toHaveBeenCalled());

      const patch = bookings.update.mock.calls[0][1];
      expect(patch).not.toHaveProperty("price");
      expect(patch).not.toHaveProperty("discount");
    });

    /*
      ─── AND "TAUTKAN KE BOOKING" IS ON IT TOO (24 September 2026) ──────────

      The section was create-only, so a ride linked to the wrong booking could
      not be corrected anywhere in the app: the link lives on the ride, and its
      own page only lists what it serves.
    */
    const grooming = {
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
    } as unknown as Booking;

    it("offers the bookings it serves, ticked, and lets one go", async () => {
      bookings.list.mockResolvedValue(page([grooming]) as never);
      await openEdit(saved({ linkedBookingIds: ["bk-bruno"] }));

      const row = await screen.findByRole("checkbox", { name: /BK-260922-001/ });
      expect(row).toBeChecked();

      await userEvent.click(row);
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.update).toHaveBeenCalled());
      expect(bookings.update).toHaveBeenCalledWith(
        "bk-aj",
        expect.objectContaining({ linkedBookingIds: [] }),
      );
    });

    it("sends no links when they did not move", async () => {
      bookings.list.mockResolvedValue(page([grooming]) as never);
      await openEdit(saved({ linkedBookingIds: ["bk-bruno"] }));
      await screen.findByRole("checkbox", { name: /BK-260922-001/ });

      await userEvent.type(
        screen.getByLabelText(/catatan internal/i),
        "Lewat gerbang belakang",
      );
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.update).toHaveBeenCalled());
      expect(bookings.update.mock.calls[0][1]).not.toHaveProperty("linkedBookingIds");
    });

    /*
      ⚠️ A LINK THE PICKER CANNOT OFFER BACK is still shown. The list holds the
      customer's last month for the animals in the van; the ride's links are not
      that set, and one it cannot draw would be saved on every edit with no row
      to untick.
    */
    it("shows a link from outside the list, and lets that one go too", async () => {
      await openEdit(
        saved({
          linkedBookingIds: ["bk-old"],
          linked: [
            {
              _id: "bk-old",
              bookingNumber: "BK-260801-009",
              petName: "Coco",
              serviceName: "Basic Grooming",
              status: "completed",
              scheduledAt: new Date("2026-08-01T10:00").toISOString(),
              tripLeg: null,
            },
          ],
        }),
      );

      const row = await screen.findByRole("checkbox", { name: /BK-260801-009/ });
      expect(row).toBeChecked();

      await userEvent.click(row);
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.update).toHaveBeenCalled());
      expect(bookings.update).toHaveBeenCalledWith(
        "bk-aj",
        expect.objectContaining({ linkedBookingIds: [] }),
      );
    });

    /* Without the grant the figure is read-only, edit or not. */
    it("shows a read-only figure to somebody without bookings:setPrice", async () => {
      bookings.getById.mockResolvedValue(saved());
      renderWithAuth(<AntarJemputBookingForm bookingId="bk-aj" />, {
        isSuperAdmin: false,
        permissions: [{ feature: "bookings", actions: ["read", "update"] }],
      });

      expect(await screen.findByText("Harga katalog")).toBeInTheDocument();
      expect(screen.queryByLabelText("Harga dasar")).not.toBeInTheDocument();
    });
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

    expect(await screen.findByRole("button", { name: /bruno/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
    await userEvent.click(await screen.findByRole("option", { name: "Antar-Jemput" }));

    /* Both ways by default: the van leaves before, and brings it home after. */
    expect(await screen.findByRole("radio", { name: /antar jemput/i })).toBeChecked();

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

  /*
    THE FARE IS MEASURED BETWEEN THE TWO ENDS (23 September 2026), so an end
    typed for this one trip is the one it is priced from — and an end with no
    pin cannot be saved at all.
  */
  it("takes a typed address with its own pin, and refuses one without", async () => {
    renderWithAuth(<AntarJemputBookingForm />);

    await pickCustomer();
    await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));
    await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
    await userEvent.click(await screen.findByRole("option", { name: "Antar-Jemput" }));

    /* A pickup starts at the customer's door — swap that end for a typed one. */
    await userEvent.click(screen.getByRole("button", { name: /sumber alamat asal/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Ketik manual" }));

    const save = screen.getByRole("button", { name: /simpan booking/i });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^alamat$/i), "Kos Melati 4");
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: "-7.2000" } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: "112.7000" } });

    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(bookings.create).toHaveBeenCalledTimes(1));
    expect(bookings.create.mock.calls[0][0]).toMatchObject({
      tripOrigin: { address: "Kos Melati 4", lat: -7.2, lng: 112.7 },
      tripDestination: { address: "Jl. Sudirman 10", lat: -7.2575, lng: 112.7521 },
    });
  });

  it("offers the time every half hour, not as free text (BO's note 8)", async () => {
    renderWithAuth(<AntarJemputBookingForm />);

    await userEvent.click(await screen.findByRole("button", { name: "Layanan" }));
    await userEvent.click(await screen.findByRole("option", { name: "Antar-Jemput" }));

    await userEvent.click(await screen.findByRole("button", { name: "Jam" }));

    expect(await screen.findByRole("option", { name: "09.30" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "09.15" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(48);
  });
});
