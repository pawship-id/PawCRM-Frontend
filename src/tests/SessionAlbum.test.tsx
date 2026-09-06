import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionAlbum } from "@/features/booking/components/SessionAlbum";
import { bookingService } from "@/services/booking.service";
import { mediaService } from "@/services/media.service";
import type { BookingPet, SessionMedia } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/media.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const media = mediaService as jest.Mocked<typeof mediaService>;

beforeEach(() => {
  jest.clearAllMocks();
  bookings.setPetMedia.mockResolvedValue({} as never);
});

const photo = (over: Partial<SessionMedia> = {}): SessionMedia =>
  ({
    _id: `m-${over.storageKey ?? "1"}`,
    mediaType: "image",
    url: "https://cdn.test/full.jpg",
    mediumUrl: "https://cdn.test/medium.jpg",
    thumbUrl: "https://cdn.test/thumb.jpg",
    storageKey: "t/a.jpg",
    driver: "local",
    mimeType: "image/jpeg",
    alt: null,
    kind: "other",
    uploadedByName: "Rio",
    ...over,
  }) as SessionMedia;

/**
 * ⚠️ THE ALBUM IS `pet.media`, AND A TURN'S EVIDENCE IS SOMEWHERE ELSE.
 *
 * `turnPhotos` seeds `services[].sessions[].media[]` — the OTHER array — so
 * every case can prove this card reads one and not the other.
 */
const pet = ({
  album = [],
  turnPhotos = [],
}: { album?: SessionMedia[]; turnPhotos?: SessionMedia[] } = {}): BookingPet =>
  ({
    petItemId: "pi-1",
    petId: "p1",
    petName: "Cici",
    status: "in_progress",
    media: album,
    services: [
      {
        itemId: "row-0",
        serviceId: "svc-0",
        name: "Basic Grooming",
        price: "150000.0000",
        sessions: [
          {
            sessionId: "se-0",
            sessionName: "Mandi",
            groomers: [],
            status: "done",
            startedAt: null,
            finishedAt: null,
            notesSession: null,
            notesInternalSession: null,
            media: turnPhotos,
          },
        ],
        addons: [],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const show = (subject: BookingPet, actions = ["read", "update"]) =>
  renderWithAuth(
    <SessionAlbum bookingId="bk-1" pet={subject} onChanged={jest.fn()} />,
    {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions }] as never,
    },
  );

const section = (title: RegExp) =>
  screen.getByRole("heading", { name: title }).closest("section")!;

/**
 * ─── THE VISIT'S PHOTOGRAPHS, READ THE OTHER WAY ROUND ──────────────────────
 *
 * The Sesi Grooming card is organised by WORK and keeps each photo inside the
 * turn it belongs to. This card is the VISIT's album: what the dog came in like,
 * what it left like, everything else.
 *
 * ⚠️ TWO ARRAYS, NOT TWO VIEWS OF ONE. `pet.media` is written from this card;
 * `sessions[].media` from a turn's own. The card that used to read across every
 * turn and filter by a `kind` prefix was working round having no home of its
 * own, and it would have lost its photos the day somebody deleted that turn.
 */
describe("SessionAlbum", () => {
  it("reads the animal's album", () => {
    show(
      pet({
        album: [
          photo({ storageKey: "a", kind: "before" }),
          photo({ storageKey: "b", kind: "after" }),
          photo({ storageKey: "c", kind: "other" }),
        ],
      }),
    );

    expect(screen.getByText("3 foto")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("leaves a turn's own evidence where it is", () => {
    /*
      ⚠️ THE DECOY IS THE POINT. A photo on `sessions[].media` belongs to the
      card above; if this one ever reaches across again, it shows up here.
    */
    show(
      pet({
        album: [photo({ storageKey: "a", kind: "before", alt: "kusut" })],
        turnPhotos: [
          photo({
            storageKey: "b",
            kind: "session_Mandi",
            alt: "busa di kuping",
          }),
        ],
      }),
    );

    expect(screen.getByText("kusut")).toBeInTheDocument();
    expect(screen.queryByText("busa di kuping")).not.toBeInTheDocument();

    /* And the count agrees — a header saying "2 foto" over one tile is the same
       bug wearing a different face. */
    expect(screen.getByText("1 foto")).toBeInTheDocument();
  });

  it("files each photo under its own kind", () => {
    show(
      pet({
        album: [
          photo({ storageKey: "a", kind: "before", alt: "kusut" }),
          photo({ storageKey: "b", kind: "after", alt: "rapi" }),
          photo({ storageKey: "c", kind: "other", alt: "kuping" }),
        ],
      }),
    );

    expect(within(section(/foto before/i)).getByText("kusut")).toBeInTheDocument();
    expect(within(section(/foto after/i)).getByText("rapi")).toBeInTheDocument();
    expect(
      within(section(/foto lainnya/i)).getByText("kuping"),
    ).toBeInTheDocument();
  });

  it("draws every section even when one is empty", () => {
    /*
      ⚠️ AN ALBUM THAT HID ITS "after" HEADING until somebody had taken one would
      answer "has anybody photographed the finished cut?" by saying nothing — and
      a missing heading reads as a page that failed to load, not as an answer.
    */
    show(pet({ album: [photo({ storageKey: "a", kind: "before" })] }));

    expect(screen.getByText(/belum ada foto after/i)).toBeInTheDocument();
    expect(screen.getByText(/belum ada foto lainnya/i)).toBeInTheDocument();
  });

  it("names the uploader, and says so plainly when nobody was recorded", () => {
    show(
      pet({
        album: [
          photo({ storageKey: "a", kind: "before", uploadedByName: "Rio" }),
          photo({ storageKey: "b", kind: "after", uploadedByName: null }),
        ],
      }),
    );

    expect(screen.getByText("Rio")).toBeInTheDocument();
    expect(screen.getByText(/tidak tercatat/i)).toBeInTheDocument();
  });

  it("says 'Tanpa catatan' rather than leaving the caption blank", () => {
    show(pet({ album: [photo({ storageKey: "a", alt: null })] }));

    expect(screen.getByText(/tanpa catatan/i)).toBeInTheDocument();
  });

  it("draws the 800px derivative, not the full-size original", () => {
    /* A gallery of nine full-size photos is nine full-size downloads. */
    show(pet({ album: [photo()] }));

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.test/medium.jpg",
    );
  });

  it("stands up on an animal with no photos at all", () => {
    show(pet());

    expect(screen.getByText("0 foto")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});

/**
 * ─── THE DIALOG COMMITS ON `Simpan` ─────────────────────────────────────────
 *
 * It used to upload the moment somebody chose a file, which made the picker the
 * save button in disguise — the kind and the note were already typed, so the act
 * finished under a control that read as the start of one.
 */
describe("SessionAlbum — adding a photo", () => {
  const asset = {
    mediaType: "image",
    url: "https://cdn.test/new.jpg",
    storageKey: "t/booking/new.jpg",
    driver: "local",
    mimeType: "image/jpeg",
    token: "tok",
  };

  const pick = async () => {
    await userEvent.click(screen.getByRole("button", { name: /tambah foto/i }));
    await userEvent.upload(
      screen.getByLabelText(/gambar/i),
      new File(["x"], "before.jpg", { type: "image/jpeg" }),
    );
  };

  it("writes the animal's album, never a turn", async () => {
    media.upload.mockResolvedValue(asset as never);

    show(pet({ album: [photo({ storageKey: "old", kind: "after" })] }));

    await userEvent.click(screen.getByRole("button", { name: /tambah foto/i }));
    await userEvent.click(screen.getByRole("combobox", { name: /jenis foto/i }));
    await userEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: "Before",
      }),
    );
    await userEvent.upload(
      screen.getByLabelText(/gambar/i),
      new File(["x"], "before.jpg", { type: "image/jpeg" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /catatan foto/i }),
      "kusut di leher",
    );
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() =>
      expect(media.upload).toHaveBeenCalledWith(expect.any(File), {
        purpose: "booking",
      }),
    );

    await waitFor(() =>
      expect(bookings.setPetMedia).toHaveBeenCalledWith("bk-1", "p1", [
        /* ⚠️ THE ALBUM'S OWN PHOTOS TRAVEL TOO. The API takes the list, not a
           delta, so sending only the new one deletes what was there. */
        expect.objectContaining({ storageKey: "old" }),
        expect.objectContaining({
          storageKey: "t/booking/new.jpg",
          kind: "before",
          alt: "kusut di leher",
        }),
      ]),
    );

    /* ⚠️ AND NOT THROUGH THE SESSION ROUTE. That was the anchor hack. */
    expect(bookings.setSessionRecord).not.toHaveBeenCalled();
  });

  it("never sends the read-side name back to the API", async () => {
    /* `uploadedByName` is resolved on read and is not a stored field. */
    media.upload.mockResolvedValue(asset as never);

    show(pet({ album: [photo({ storageKey: "old" })] }));
    await pick();
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(bookings.setPetMedia).toHaveBeenCalled());

    const [, , sent] = bookings.setPetMedia.mock.calls[0];
    expect(JSON.stringify(sent)).toContain("old");
    expect(JSON.stringify(sent)).not.toContain("uploadedByName");
  });

  it("writes nothing until Simpan is pressed", async () => {
    show(pet());
    await pick();

    /* ⚠️ NOT EVEN THE UPLOAD. Choosing a file answers one question; there is
       still a kind and a note to give. */
    expect(media.upload).not.toHaveBeenCalled();
    expect(bookings.setPetMedia).not.toHaveBeenCalled();
  });

  it("cannot be saved before a file is chosen", async () => {
    show(pet());
    await userEvent.click(screen.getByRole("button", { name: /tambah foto/i }));

    expect(screen.getByRole("button", { name: /^simpan$/i })).toBeDisabled();
  });

  it("stores the bytes BEFORE the row that points at them", async () => {
    /*
      ⚠️ THE ORDER IS LOAD-BEARING. Writing the row first would store a url for
      bytes that may never arrive; failing the other way round leaves an
      unreferenced object in the bucket, which `sweepOrphanMedia` collects.
    */
    const order: string[] = [];

    media.upload.mockImplementation(async () => {
      order.push("storage");
      return asset as never;
    });
    bookings.setPetMedia.mockImplementation(async () => {
      order.push("database");
      return {} as never;
    });

    show(pet());
    await pick();
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => expect(order).toEqual(["storage", "database"]));
  });

  it("forgets the file when the dialog is dismissed", async () => {
    show(pet());
    await pick();
    await userEvent.click(screen.getByRole("button", { name: /batal/i }));

    await userEvent.click(screen.getByRole("button", { name: /tambah foto/i }));

    expect(screen.getByRole("button", { name: /^simpan$/i })).toBeDisabled();
  });

  it("offers nothing to a role that may only read", () => {
    show(pet({ album: [photo()] }), ["read"]);

    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /tambah foto/i }),
    ).not.toBeInTheDocument();
  });
});
