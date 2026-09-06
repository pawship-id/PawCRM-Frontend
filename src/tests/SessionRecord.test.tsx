import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionRecord } from "@/features/booking/components/SessionRecord";
import { bookingService } from "@/services/booking.service";
import { mediaService } from "@/services/media.service";
import type { BookingSession, SessionMedia } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/media.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const media = mediaService as jest.Mocked<typeof mediaService>;

const FULL = [{ feature: "bookings", actions: ["read", "update"] }];

const photo = (over: Partial<SessionMedia> = {}): SessionMedia =>
  ({
    _id: "m1",
    mediaType: "image",
    url: "https://cdn.test/full.jpg",
    thumbUrl: "https://cdn.test/thumb.jpg",
    storageKey: "t/booking/full.jpg",
    driver: "local",
    mimeType: "image/jpeg",
    alt: null,
    kind: "other",
    uploadedByName: "Mbak Sari",
    ...over,
  }) as SessionMedia;

const session = (over: Partial<BookingSession> = {}): BookingSession =>
  ({
    sessionId: "se-1",
    sessionName: "Mandi",
    groomers: [],
    status: "done",
    startedAt: null,
    finishedAt: null,
    notesSession: null,
    notesInternalSession: null,
    media: [],
    ...over,
  }) as BookingSession;

const show = (one = session(), permissions = FULL) =>
  renderWithAuth(
    <SessionRecord bookingId="bk-1" session={one} onChanged={jest.fn()} />,
    { isSuperAdmin: false, permissions: permissions as never },
  );

beforeEach(() => {
  jest.clearAllMocks();
  bookings.setSessionRecord.mockResolvedValue({} as never);
});

/**
 * ─── THE FOUR THINGS A GROOMING GALLERY IS READ FOR ─────────────────────────
 *
 * The picture, its note, WHO took it, and WHEN in the work it was taken. The
 * last two are the ones a naive implementation loses: `uploadedBy` is an id, and
 * `kind` is absent on anything stored before the field existed.
 */
describe("SessionRecord — the gallery", () => {
  it("shows all four: the picture, its note, who took it, and its kind", () => {
    show(
      session({
        media: [
          photo({
            alt: "kusut di leher",
            kind: "before",
            uploadedByName: "Rio",
          }),
        ],
      }),
    );

    expect(
      screen.getByRole("img", { name: /kusut di leher/i }),
    ).toHaveAttribute("src", "https://cdn.test/thumb.jpg");
    expect(screen.getByDisplayValue("kusut di leher")).toBeInTheDocument();
    expect(screen.getByText("Rio")).toBeInTheDocument();
    expect(screen.getByText("Sebelum")).toBeInTheDocument();
  });

  it("says the uploader is unrecorded rather than leaving a blank", () => {
    /* An empty slot reads as a field that failed to load. */
    show(session({ media: [photo({ uploadedByName: null })] }));

    expect(screen.getByText(/tidak tercatat/i)).toBeInTheDocument();
  });

  it("falls back down the derivative chain when there is no thumbnail", () => {
    /* `thumbUrl` is null on a video and on media stored before it existed. */
    show(session({ media: [photo({ thumbUrl: null, mediumUrl: null })] }));

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.test/full.jpg",
    );
  });

  it("labels the photo without asking anybody to classify it", async () => {
    /*
      ⚠️ THIS CASE USED TO DRIVE A PICKER. The shop asked for it to go: a photo
      taken on a turn is filed as `other` and stays there, because the moment
      somebody is holding a wet dog is exactly when the wrong option gets
      chosen.

      THE LABEL STAYED. `before` / `after` still occur — on data written before
      the decision, and if another screen ever sets them — and a tile that says
      nothing about what the photo is would be worse than the picker was.
    */
    show(
      session({
        media: [
          photo({ _id: "m1", storageKey: "t/a.jpg", kind: "before" }),
          photo({ _id: "m2", storageKey: "t/b.jpg", kind: "other" }),
        ],
      }),
    );

    expect(screen.getByText("Sebelum")).toBeInTheDocument();
    expect(screen.getByText("Lainnya")).toBeInTheDocument();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("never sends the read-side name back to the API", async () => {
    /*
      ⚠️ `uploadedByName` IS RESOLVED ON READ and is not a stored field. Echoing
      it back is how a read-only convenience becomes something the API has to
      start accepting, and then storing.
    */
    /*
      ⚠️ TWO PHOTOS, AND THE FIRST IS REMOVED. With one, the payload is an empty
      array and there is nothing left to leak — the case passes for a build that
      echoes the field straight back.
    */
    show(
      session({
        media: [
          photo({ _id: "m1", storageKey: "t/a.jpg" }),
          photo({ _id: "m2", storageKey: "t/b.jpg" }),
        ],
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /hapus foto 1/i }),
    );

    await waitFor(() => expect(bookings.setSessionRecord).toHaveBeenCalled());

    const [, , patch] = bookings.setSessionRecord.mock.calls[0];

    /* The surviving photo is in there — so this is not passing on an empty list. */
    expect(JSON.stringify(patch)).toContain("t/b.jpg");
    expect(JSON.stringify(patch)).not.toContain("uploadedByName");
  });
});

describe("SessionRecord — adding a photo", () => {
  it("files it under `booking` and labels it `other`", async () => {
    /*
      ⚠️ TWO SEPARATE TRAPS IN ONE ACT.

      `purpose: "booking"` becomes a STORAGE-KEY SEGMENT that
      `sweepOrphanMedia` reads — a session photo filed under `product` is
      checked against the product collection, found nowhere, and deleted.

      `kind: "other"` because a shot taken mid-groom is neither a before nor an
      after, and guessing produces a gallery whose labels are wrong.
    */
    media.upload.mockResolvedValue({
      mediaType: "image",
      url: "https://cdn.test/new.jpg",
      storageKey: "t/booking/new.jpg",
      driver: "local",
      mimeType: "image/jpeg",
      token: "tok",
    } as never);

    show(session({ media: [photo({ storageKey: "t/a.jpg" })] }));

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    await userEvent.upload(
      input,
      new File(["x"], "after.jpg", { type: "image/jpeg" }),
    );

    await waitFor(() =>
      expect(media.upload).toHaveBeenCalledWith(expect.any(File), {
        purpose: "booking",
      }),
    );

    await waitFor(() =>
      expect(bookings.setSessionRecord).toHaveBeenCalledWith("bk-1", "se-1", {
        media: [
          expect.objectContaining({ storageKey: "t/a.jpg" }),
          expect.objectContaining({
            storageKey: "t/booking/new.jpg",
            kind: "other",
            token: "tok",
          }),
        ],
      }),
    );
  });

  it("offers no way to add a tenth", async () => {
    /* Mirrors MAX_SESSION_MEDIA; the API refuses it either way. */
    show(
      session({
        media: Array.from({ length: 9 }, (_, i) =>
          photo({ _id: `m${i}`, storageKey: `t/${i}.jpg` }),
        ),
      }),
    );

    expect(
      screen.queryByRole("button", { name: /tambah foto/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SessionRecord — the two notes", () => {
  it("keeps them apart, and says which is which", () => {
    /*
      The model splits them so "galak" cannot be read as a standing fact when it
      happened once. One box would undo exactly that.
    */
    show(
      session({
        notesSession: "kukunya rapuh",
        notesInternalSession: "galak kalau kena air muka",
      }),
    );

    expect(screen.getByDisplayValue("kukunya rapuh")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("galak kalau kena air muka"),
    ).toBeInTheDocument();
    expect(screen.getByText(/boleh dibaca pemilik/i)).toBeInTheDocument();
  });

  it("saves on blur, not on every keystroke", async () => {
    show();

    const box = screen.getByRole("textbox", { name: /catatan sesi/i });

    await userEvent.type(box, "rapi");
    expect(bookings.setSessionRecord).not.toHaveBeenCalled();

    await userEvent.tab();

    await waitFor(() =>
      expect(bookings.setSessionRecord).toHaveBeenCalledWith("bk-1", "se-1", {
        notesSession: "rapi",
      }),
    );
  });

  it("says nothing when the box was not changed", async () => {
    /* Tabbing through a form must not write. */
    show(session({ notesSession: "rapi" }));

    await userEvent.click(
      screen.getByRole("textbox", { name: /catatan sesi/i }),
    );
    await userEvent.tab();

    expect(bookings.setSessionRecord).not.toHaveBeenCalled();
  });
});

describe("SessionRecord — a role that may only read", () => {
  it("shows the work but offers no way to change it", () => {
    show(session({ notesSession: "kukunya rapuh", media: [photo()] }), [
      { feature: "bookings", actions: ["read"] },
    ]);

    expect(screen.getByText("kukunya rapuh")).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByText(/Mbak Sari/)).toBeInTheDocument();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /tambah foto/i }),
    ).not.toBeInTheDocument();
  });
});
