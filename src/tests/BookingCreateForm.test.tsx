import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingCreateForm } from "@/features/booking";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { userService } from "@/services/user.service";
import type { Booking, Customer, Pet, Service, User } from "@/types/api";

import { swalToast } from "@/lib/swal";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/user.service");
/* The house pattern: the toast is chrome, and the real Swal drags a timer into
   every test that saves. */
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

/*
  THE FORM IS A PAGE NOW, so success navigates instead of closing a dialog. The
  router is mocked rather than rendered through a real one: what these tests are
  about is what gets SENT, and where it goes afterwards is one assertion.
*/
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
}));

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const customers = customerService as jest.Mocked<typeof customerService>;
const pets = petService as jest.Mocked<typeof petService>;
const services = serviceService as jest.Mocked<typeof serviceService>;
const users = userService as jest.Mocked<typeof userService>;

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

const customer = {
  _id: "cust-1",
  name: "Ibu Rina",
  phone: "0812-3456-7890",
} as Customer;

const pet = { _id: "pet-1", name: "Bruno" } as Pet;

const service = (overrides: Partial<Service> = {}) =>
  ({
    _id: "svc-1",
    name: "Grooming Full Service",
    price: "150000.0000",
    durationMin: 90,
    isActive: true,
    ...overrides,
  }) as Service;

const groomer = { _id: "user-1", fullName: "Mbak Sari" } as User;

const created = { _id: "bk-1", bookingNumber: "BK-260826-001" } as Booking;

beforeEach(() => {
  jest.clearAllMocks();
  push.mockClear();
  customers.list.mockResolvedValue(page([customer]));
  pets.list.mockResolvedValue(page([pet]));
  services.list.mockResolvedValue(page([service()]));
  users.list.mockResolvedValue(page([groomer]));
  bookings.create.mockResolvedValue(created);
});

/** Chooses Ibu Rina through the picker the dialog opens. */
async function pickCustomer() {
  await userEvent.click(screen.getByRole("button", { name: /pilih pelanggan/i }));
  await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
}

/** Picks an option out of one of the cards' selects. */
async function choose(name: RegExp, option: RegExp | string) {
  await userEvent.click(screen.getByRole("combobox", { name }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

/**
 * `/dashboard/booking/new`.
 *
 * Until this form existed the only way to make a booking was to sell it at the
 * till, which cannot answer the phone call that books Thursday. It was a DIALOG
 * on the list until a booking could hold several animals — three animals is
 * three cards of five controls each, and a dialog holding that is a form
 * scrolling inside a scrolling page.
 */
describe("BookingCreateForm", () => {
  it("sends who, which animals, what services and when", async () => {
    renderWithAuth(
      <BookingCreateForm />,
    );

    await pickCustomer();

    // One pet, so the first card is filled in — the click removed from every
    // booking a shop with single-dog customers ever takes.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /hewan/i })).toHaveTextContent(
        "Bruno",
      ),
    );

    await choose(/layanan/i, /grooming full service/i);

    fireEvent.change(screen.getByLabelText(/tanggal/i), {
      target: { value: "2026-09-03" },
    });
    fireEvent.change(screen.getByLabelText(/jam/i), {
      target: { value: "10:30" },
    });

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith({
        customerId: "cust-1",
        /*
          THE ANIMAL IS ON THE ROW since PCR-040, and no price crosses the wire:
          the server snapshots it from the catalogue. `durationMin` is undefined
          because nobody typed over the catalogue's ninety minutes.
        */
        items: [
          {
            petId: "pet-1",
            serviceId: "svc-1",
            groomerUserId: null,
            durationMin: undefined,
            notes: null,
          },
        ],
        // The two fields mean WALL-CLOCK TIME in the shop's own zone.
        scheduledAt: new Date("2026-09-03T10:30").toISOString(),
        status: "confirmed",
        notes: null,
      }),
    );
    // Back to the list, which re-asks the server rather than splicing a row in.
    // Back to the list, which re-asks the server rather than splicing a row in.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/booking"));
  });

  /*
    THE CASE PCR-041 EXISTS FOR. Bu Lisa arrives with Mochi and Coco: one form,
    one booking, one number. Before this the dialog made two — two rounds of the
    same six fields, and two rows on a day sheet that could not tell they were
    one arrival.
  */
  it("sends two animals on one booking", async () => {
    pets.list.mockResolvedValue(
      page([
        { _id: "pet-1", name: "Mochi" } as Pet,
        { _id: "pet-2", name: "Coco" } as Pet,
      ]),
    );
    services.list.mockResolvedValue(
      page([service(), service({ _id: "svc-2", name: "Bath & Blow", price: "95000.0000" })]),
    );

    renderWithAuth(
      <BookingCreateForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /hewan/i });

    await choose(/hewan/i, "Mochi");
    await choose(/layanan/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /^tambah hewan$/i }));

    const cards = screen.getAllByRole("combobox", { name: /hewan/i });
    await userEvent.click(cards[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Coco" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /layanan/i });
    await userEvent.click(serviceSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: /bath & blow/i }));

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());

    const sent = bookings.create.mock.calls[0][0];
    expect(sent.items).toHaveLength(2);
    expect(sent.items.map((item) => item.petId)).toEqual(["pet-1", "pet-2"]);
    expect(sent.items.map((item) => item.serviceId)).toEqual(["svc-1", "svc-2"]);
  });

  /*
    THE SAME ANIMAL TWICE FOR THE SAME SERVICE is two identical rows — nothing on
    the day sheet could tell them apart, and each would need its own groomer. The
    message NAMES the animal: with four cards on screen, "one of these is wrong"
    is a puzzle rather than a message (PRD 2.7).
  */
  it("refuses the same animal twice for the same service, and says which", async () => {
    renderWithAuth(
      <BookingCreateForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /^tambah hewan$/i }));

    const petSelects = screen.getAllByRole("combobox", { name: /hewan/i });
    await userEvent.click(petSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Bruno" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /layanan/i });
    await userEvent.click(serviceSelects[1]);
    await userEvent.click(
      await screen.findByRole("option", { name: /grooming full service/i }),
    );

    expect(
      await screen.findByText(/bruno sudah punya layanan yang sama/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
  });

  /*
    WHEN THE CUSTOMER GETS THEIR ANIMALS BACK — the longest groomer's workload,
    never the sum (PRD 2.9). Two groomers work at once, and a screen promising an
    earlier finish than the shop can manage sends somebody home late.
  */
  it("shows a finish time from the longest groomer, not the sum", async () => {
    pets.list.mockResolvedValue(
      page([
        { _id: "pet-1", name: "Mochi" } as Pet,
        { _id: "pet-2", name: "Coco" } as Pet,
      ]),
    );
    services.list.mockResolvedValue(
      page([
        service(),
        service({ _id: "svc-2", name: "Bath & Blow", durationMin: 60 }),
      ]),
    );
    users.list.mockResolvedValue(
      page([groomer, { _id: "user-2", fullName: "Pak Rio" } as User]),
    );

    renderWithAuth(
      <BookingCreateForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /hewan/i });

    fireEvent.change(screen.getByLabelText(/jam/i), { target: { value: "10:00" } });

    await choose(/hewan/i, "Mochi");
    await choose(/layanan/i, /grooming full service/i);
    await choose(/groomer/i, "Mbak Sari");

    await userEvent.click(screen.getByRole("button", { name: /^tambah hewan$/i }));

    const petSelects = screen.getAllByRole("combobox", { name: /hewan/i });
    await userEvent.click(petSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Coco" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /layanan/i });
    await userEvent.click(serviceSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: /bath & blow/i }));

    const groomerSelects = screen.getAllByRole("combobox", { name: /groomer/i });
    await userEvent.click(groomerSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Pak Rio" }));

    // 90 and 60 in parallel = 90, so 11.30 — not 12.30.
    expect(await screen.findByText(/selesai sekitar 11\.30/i)).toBeInTheDocument();
  });

  it("names the field that is still missing rather than leaving a dead button", async () => {
    renderWithAuth(
      <BookingCreateForm />,
    );

    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    expect(screen.getByText(/pelanggan belum dipilih/i)).toBeInTheDocument();

    await pickCustomer();

    expect(
      await screen.findByText(/setiap hewan harus punya layanan/i),
    ).toBeInTheDocument();
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it("sends the groomer somebody assigned", async () => {
    renderWithAuth(
      <BookingCreateForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);
    await choose(/groomer/i, "Mbak Sari");

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ groomerUserId: "user-1" })],
        }),
      ),
    );
  });

  /*
    Reading /api/users takes the `users read` permission, which a receptionist
    who books all day has no other reason to hold. Assignment is optional and the
    server names an unassigned slot, so a refusal costs the select, not the form.
  */
  it("still books when the staff list is refused", async () => {
    users.list.mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(
      <BookingCreateForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);

    expect(
      screen.queryByRole("combobox", { name: /groomer/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ groomerUserId: null })],
        }),
      ),
    );
  });

  /*
    THE CHECK THAT MATTERS MOST on the server is that the pet belongs to the
    customer — a booking under the wrong owner looks perfectly normal and bills
    the wrong person. Its answer has to reach the person who can fix it.
  */
  it("puts a refusal on the field it is about", async () => {
    bookings.create.mockRejectedValue(
      new ApiError("Validation failed", 400, {
        details: [
          {
            // AFTER FR-1 the animal is a row, so the field points at `items`.
            field: "body.items",
            message: "This pet belongs to a different customer",
          },
        ],
      }),
    );

    renderWithAuth(
      <BookingCreateForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    expect(
      await screen.findByText(/this pet belongs to a different customer/i),
    ).toBeInTheDocument();
  });

  /* A booking is booked to the session's branch, and a user who reaches every
     branch signs in pointed at none of them. */
  it("says to pick a branch before anything else", () => {
    renderWithAuth(
      <BookingCreateForm />,
      { session: { currentBranchId: null } },
    );

    expect(screen.getByText(/pilih cabang dulu/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
  });

  it("offers only the two states a booking can start in", async () => {
    renderWithAuth(
      <BookingCreateForm />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: /status/i }));

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Dikonfirmasi" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Draft" })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: /selesai|batal/i })).toBeNull();
  });

  /*
    THE BOOKING WAS ALREADY WRITTEN BY THE TIME THE TOAST RUNS, so a toast that
    fails must not be reported as a save that failed.

    THIS IS NOT HYPOTHETICAL. The toast used to sit inside the same `try` as the
    request; the real Swal threw under jsdom, the catch turned it into "Terjadi
    kesalahan. Coba lagi.", and a booking that had landed was reported as a
    failure — which sends somebody to make it a second time.
  */
  it("still counts as saved when the toast blows up", async () => {
    (swalToast as jest.Mock).mockImplementationOnce(() => {
      throw new Error("toast gagal");
    });

    renderWithAuth(<BookingCreateForm />);

    await pickCustomer();
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/booking"));
    expect(screen.queryByText(/terjadi kesalahan/i)).not.toBeInTheDocument();
  });
});
