import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingBookingCreateScreen } from "@/features/grooming";
import { DEFAULT_PET_OPTION_LABELS } from "@/hooks/usePetOptions";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";
import type {
  Booking,
  CreateBookingResult,
  Customer,
  Pet,
  Service,
  Zone,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  BUILT_IN_VARIANT_OPTIONS,
  makeVariantOption,
  primeVariantOptions,
} from "./helpers/variantOptions";

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
  primeVariantOptions(variantOptionService.list, zoneService.list);
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

  /* ─── PRICED BEYOND THE PET (17 September 2026) ─────────────────────────── */

  describe("a service priced by zone and a staff card", () => {
    const LOKASI = "vo-lokasi";

    const lokasi = makeVariantOption({
      _id: LOKASI,
      name: "Lokasi",
      source: "staff",
      axisKey: LOKASI,
      sortOrder: 3,
      values: [
        { code: "toko", label: "Di Toko", sortOrder: 0, isActive: true },
        { code: "rumah", label: "Di Rumah", sortOrder: 1, isActive: true },
      ],
    });

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
      createdAt: "2026-09-17T00:00:00.000Z",
      updatedAt: "2026-09-17T00:00:00.000Z",
    });

    const variantRow = (zoneId: string, code: string, price: string) => ({
      petType: null,
      sizeCategory: null,
      furType: null,
      zoneId,
      choices: [{ optionId: LOKASI, code }],
      price,
      durationMin: 90,
      isActive: true,
    });

    const homeGrooming = {
      ...grooming,
      _id: "svc-home",
      name: "Grooming Rumah",
      price: null,
      hasVariants: true,
      variantAxes: ["zone", LOKASI],
      variants: [
        variantRow("zone-a", "toko", "150000.0000"),
        variantRow("zone-a", "rumah", "180000.0000"),
        variantRow("zone-b", "toko", "160000.0000"),
        variantRow("zone-b", "rumah", "210000.0000"),
      ],
    } as unknown as Service;

    /* ~2,2 km north of the branch — Zona A. */
    const pinned = {
      ...customer,
      location: { lat: -6.18, lng: 106.8, source: "manual" },
    } as Customer;

    beforeEach(() => {
      primeVariantOptions(variantOptionService.list, zoneService.list, {
        cards: [...BUILT_IN_VARIANT_OPTIONS, lokasi],
        zones: [zone("zone-a", "Zona A", 0, 5), zone("zone-b", "Zona B", 5, 10)],
      });
      services.list.mockResolvedValue(page([homeGrooming]));
      branches.list.mockResolvedValue(
        page([
          {
            _id: BRANCH_ID,
            name: "Cibubur",
            location: { lat: -6.2, lng: 106.8, source: "manual" },
          },
        ]) as never,
      );
    });

    async function pickHomeGrooming() {
      await userEvent.click(
        screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
      );
      await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
      await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));
      await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
      await userEvent.click(await screen.findByRole("option", { name: /grooming rumah/i }));
    }

    it("asks for Lokasi, previews the variant for the zone and the choice, and sends the choice", async () => {
      customers.list.mockResolvedValue(page([pinned]));
      renderWithAuth(<GroomingBookingCreateScreen />, {
        isSuperAdmin: false,
        permissions: [{ feature: "bookings", actions: ["create", "read"] }],
      });

      await pickHomeGrooming();

      /* Nothing chosen yet: no price, and Simpan says what is missing. */
      const picker = await screen.findByRole("combobox", { name: /lokasi/i });
      expect(
        screen.getAllByText(/pilih lokasi untuk grooming rumah dulu/i).length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();

      await userEvent.click(picker);
      await userEvent.click(await screen.findByRole("option", { name: "Di Rumah" }));

      /* Zona A (≈2,2 km) × Di Rumah — not Zona B's, not Di Toko's. */
      expect((await screen.findAllByText(/180\.000/)).length).toBeGreaterThan(0);
      expect(screen.queryByText(/210\.000/)).not.toBeInTheDocument();
      expect(screen.getAllByText(/Zona A · 2,2\d* km/).length).toBeGreaterThan(0);

      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.create).toHaveBeenCalled());
      expect(bookings.create.mock.calls[0][0].bookings[0]).toMatchObject({
        serviceId: "svc-home",
        variantChoices: [{ optionId: LOKASI, code: "rumah" }],
      });
    });

    it("says why there is no price when the customer has no pin, and blocks the save", async () => {
      renderWithAuth(<GroomingBookingCreateScreen />);

      await pickHomeGrooming();

      await userEvent.click(await screen.findByRole("combobox", { name: /lokasi/i }));
      await userEvent.click(await screen.findByRole("option", { name: "Di Toko" }));

      const reason =
        /koordinat alamat pelanggan belum diisi — harga grooming rumah ditentukan dari zona/i;
      expect((await screen.findAllByText(reason)).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
      expect(screen.queryByText(/150\.000/)).not.toBeInTheDocument();
    });

    it("puts the server's refusal of a choice under that select", async () => {
      customers.list.mockResolvedValue(page([pinned]));
      bookings.create.mockRejectedValue(
        new ApiError("Validation failed", 400, {
          details: [
            {
              field: "bookings[0].variantChoices",
              message: "Pilih Lokasi untuk Grooming Rumah dulu",
              optionId: LOKASI,
            } as never,
          ],
        }),
      );
      renderWithAuth(<GroomingBookingCreateScreen />);

      await pickHomeGrooming();
      await userEvent.click(await screen.findByRole("combobox", { name: /lokasi/i }));
      await userEvent.click(await screen.findByRole("option", { name: "Di Rumah" }));
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      expect(
        await screen.findByText("Pilih Lokasi untuk Grooming Rumah dulu"),
      ).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /lokasi/i })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });
  });

  /*
    BO's NOTE 4 (21 September 2026): a service switched to "Bisa antar-jemput"
    offers the van on this form, and the ride is saved into the grooming's visit.
  */
  describe("antar-jemput for this visit", () => {
    const vanService = {
      ...grooming,
      _id: "svc-aj",
      name: "Antar-Jemput",
      price: "45000.0000",
      businessLineId: "line-aj",
      billingUnit: "per_visit",
      serviceLocations: ["in_home"],
    } as unknown as Service;

    beforeEach(() => {
      services.list.mockResolvedValue(
        page([{ ...grooming, pickupDeliveryAvailable: true } as Service, vanService]),
      );
      businessLines.list.mockResolvedValue(
        page([
          { _id: "line-groom", name: "Grooming" },
          { _id: "line-aj", name: "Antar-Jemput" },
        ]) as never,
      );
    });

    it("saves the pickup after the grooming, into its visit", async () => {
      bookings.create.mockResolvedValueOnce(created).mockResolvedValueOnce({
        groupId: "grp-1",
        bookings: [{ _id: "bk-aj", bookingNumber: "BK-260916-002" } as Booking],
      } as CreateBookingResult);
      renderWithAuth(<GroomingBookingCreateScreen />);

      await fillIn();
      await userEvent.click(await screen.findByRole("checkbox", { name: /^jemput/i }));
      await userEvent.click(screen.getByRole("button", { name: "Layanan antar-jemput" }));
      await userEvent.click(await screen.findByRole("option", { name: "Antar-Jemput" }));
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.create).toHaveBeenCalledTimes(2));
      expect(bookings.create.mock.calls[1][0]).toMatchObject({
        customerId: "cust-1",
        groupId: "grp-1",
        location: "in_home",
        /*
          ⚠️ STILL A DRAFT (24 September 2026). A van saved from the MODULE now
          opens on Confirmed, on request — this one does not: it rides on a
          grooming that is itself only `requested` at this point, and a
          confirmed van against an unconfirmed visit promises what the shop has
          not agreed yet.
        */
        status: "draft",
        /* Half an hour before the 10.30 grooming. */
        scheduledAt: new Date("2026-09-16T10:00").toISOString(),
        /* The grooming's animal rides in the van, not above it — a ride sends
           no `petId` since 23 September 2026. */
        bookings: [
          { serviceId: "svc-aj", tripLeg: "pickup", passengerPetIds: ["pet-1"] },
        ],
      });
    });

    it("is not offered for a service without the switch", async () => {
      services.list.mockResolvedValue(page([grooming, vanService]));
      renderWithAuth(<GroomingBookingCreateScreen />);

      await fillIn();

      expect(screen.queryByRole("checkbox", { name: /^jemput/i })).not.toBeInTheDocument();
    });
  });
});
