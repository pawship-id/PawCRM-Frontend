import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MediaGallery } from "@/components/MediaGallery";
import { mediaService } from "@/services/media.service";
import { captureVideoPoster } from "@/utils/media";
import type { ProductMedia } from "@/types/inventory";

jest.mock("@/services/media.service", () => ({
  mediaService: { upload: jest.fn() },
}));

/**
 * `@/utils/media` is mocked because jsdom has neither a canvas 2D context nor a
 * media element that decodes anything — a real `captureVideoPoster` would hit
 * its ten-second timeout and return null in every case, which is the one
 * outcome that proves nothing. Stubbing it makes "was a poster sent" an
 * assertion instead of a coin toss. The helper's own behaviour is covered in
 * media-utils.test.ts against stubbed canvas and video elements.
 */
jest.mock("@/utils/media", () => ({
  captureVideoPoster: jest.fn(),
  formatMegabytes: (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`,
}));

/**
 * The product gallery.
 *
 * WHAT IS ASSERTED IS THE ARRAY, because the array IS the data: its order is the
 * display order and index 0 is the primary image everywhere the product is
 * rendered. There is no sort field to check against, by design.
 *
 * DRAG IS NOT TESTED, and cannot be: jsdom implements no `DataTransfer`, so an
 * HTML5 drag cannot be simulated. That is not a gap in coverage — it is the
 * reason the ◀ ▶ buttons exist. They are the touch path, the keyboard path and
 * the testable path at once, which is what makes a drag-and-drop library
 * unnecessary here rather than merely avoidable.
 */
describe("MediaGallery", () => {
  const asset = (key: string, overrides: Partial<ProductMedia> = {}) =>
    ({
      mediaType: "image",
      url: `http://localhost:5000/media/${key}.webp`,
      thumbUrl: `http://localhost:5000/media/${key}_thumb.webp`,
      storageKey: key,
      driver: "local",
      mimeType: "image/webp",
      ...overrides,
    }) as ProductMedia;

  it("marks the first item as the primary image", async () => {
    render(
      <MediaGallery value={[asset("a"), asset("b")]} onChange={jest.fn()} />,
    );

    // One badge, on the first tile only — anything else would leave the user
    // guessing which photo the POS will show.
    expect(screen.getAllByText("Utama")).toHaveLength(1);
  });

  it("moves an item right and the badge follows", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <MediaGallery
        value={[asset("a"), asset("b"), asset("c")]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText("Geser kanan 1"));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ storageKey: "b" }),
      expect.objectContaining({ storageKey: "a" }),
      expect.objectContaining({ storageKey: "c" }),
    ]);
  });

  it("moves an item left", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <MediaGallery value={[asset("a"), asset("b")]} onChange={onChange} />,
    );

    await user.click(screen.getByLabelText("Geser kiri 2"));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ storageKey: "b" }),
      expect.objectContaining({ storageKey: "a" }),
    ]);
  });

  it("cannot move the ends past themselves", () => {
    render(
      <MediaGallery value={[asset("a"), asset("b")]} onChange={jest.fn()} />,
    );

    expect(screen.getByLabelText("Geser kiri 1")).toBeDisabled();
    expect(screen.getByLabelText("Geser kanan 2")).toBeDisabled();
  });

  it("removes an item without touching the others", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <MediaGallery
        value={[asset("a"), asset("b"), asset("c")]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText("Hapus 2"));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ storageKey: "a" }),
      expect.objectContaining({ storageKey: "c" }),
    ]);
  });

  it("hides the add tile once the cap is reached", () => {
    // The API refuses the tenth item, so the form must not offer it — a 400
    // after picking a file is a worse answer than a button that is not there.
    const nine = Array.from({ length: 9 }, (_, index) =>
      asset(`item-${index}`),
    );

    const { rerender } = render(
      <MediaGallery value={nine} onChange={jest.fn()} />,
    );
    expect(
      screen.queryByLabelText("Tambah gambar atau video"),
    ).not.toBeInTheDocument();

    rerender(<MediaGallery value={nine.slice(0, 8)} onChange={jest.fn()} />);
    expect(
      screen.getByLabelText("Tambah gambar atau video"),
    ).toBeInTheDocument();
  });

  it("shows a play overlay for a video rather than a broken image", () => {
    render(
      <MediaGallery
        value={[asset("clip", { mediaType: "video", mimeType: "video/mp4" })]}
        onChange={jest.fn()}
      />,
    );

    // No poster was captured, so there is no <img> — and the tile must still
    // read as a video rather than as a failed upload.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders a video's poster frame when one was captured", () => {
    render(
      <MediaGallery
        value={[
          asset("clip", {
            mediaType: "video",
            mimeType: "video/mp4",
            posterUrl: "http://localhost:5000/media/clip_poster.webp",
          }),
        ]}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByAltText("Video produk")).toHaveAttribute(
      "src",
      "http://localhost:5000/media/clip_poster.webp",
    );
  });

  /**
   * Uploading a video.
   *
   * The file input is hidden and driven by the add tile, so these upload through
   * `userEvent.upload` on the input itself — the same event React sees when a
   * user picks a file through the tile.
   */
  describe("a video upload", () => {
    /**
     * Renders and returns the hidden file input.
     *
     * Queried out of the container rather than by label, because it has none —
     * the visible add tile is its label, and the input is deliberately kept in
     * the accessibility tree (not `aria-hidden`) but unreachable by name.
     */
    function renderGallery(onChange = jest.fn()) {
      const { container } = render(
        <MediaGallery value={[]} onChange={onChange} />,
      );

      return container.querySelector(
        "input[type=file]",
      ) as HTMLInputElement;
    }

    const video = (bytes: number, name = "clip.mp4") => {
      const file = new File(["x"], name, { type: "video/mp4" });
      // `size` is a getter on File and jsdom builds it from the content, so a
      // 50 MB fixture would mean a 50 MB string. Redefining it is the only way
      // to exercise a size limit in jsdom.
      Object.defineProperty(file, "size", { value: bytes });
      return file;
    };

    const upload = mediaService.upload as jest.Mock;
    const capture = captureVideoPoster as jest.Mock;

    beforeEach(() => {
      upload.mockResolvedValue({
        mediaType: "video",
        url: "http://localhost:5000/media/clip.mp4",
        storageKey: "clip",
        driver: "local",
        mimeType: "video/mp4",
      });
      capture.mockResolvedValue(new Blob(["poster"], { type: "image/webp" }));
    });

    it("sends the captured poster frame alongside the file", async () => {
      const user = userEvent.setup();
      const input = renderGallery();

      await user.upload(input, video(5 * 1024 * 1024));

      // Without this the server has to extract a frame itself, and on a
      // deployment with transcoding off the tile stays a blank rectangle.
      await waitFor(() => expect(upload).toHaveBeenCalled());
      expect(upload.mock.calls[0][1]).toMatchObject({
        poster: expect.any(Blob),
      });
    });

    it("uploads anyway when no frame could be captured", async () => {
      // A poster is best-effort: the server extracts one when none arrives, so
      // a browser that cannot decode a frame must not block the upload.
      capture.mockResolvedValue(null);
      const user = userEvent.setup();
      const input = renderGallery();

      await user.upload(input, video(5 * 1024 * 1024));

      await waitFor(() => expect(upload).toHaveBeenCalled());
      expect(upload.mock.calls[0][1]).toMatchObject({ poster: null });
    });

    it("refuses an oversized video before uploading a byte of it", async () => {
      // The API would refuse it too — after the user waited out a 60 MB upload.
      const user = userEvent.setup();
      const input = renderGallery();

      await user.upload(input, video(60 * 1024 * 1024));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Video terlalu besar \(60\.0 MB\)\. Maksimal 50\.0 MB\./,
      );
      expect(upload).not.toHaveBeenCalled();
    });

    it("says it is processing once the bytes have landed", async () => {
      // The transfer finishing is not the upload finishing: the server still
      // has to transcode, which on a long clip is tens of seconds. A tile stuck
      // on "100%" reads as frozen, and a user who concludes that starts again.
      let settle: (asset: ProductMedia) => void = () => {};
      upload.mockImplementation((_file, options) => {
        options.onProgress(100);
        return new Promise<ProductMedia>((resolve) => {
          settle = resolve;
        });
      });

      const user = userEvent.setup();
      const input = renderGallery();

      await user.upload(input, video(5 * 1024 * 1024));

      expect(await screen.findByText("Memproses…")).toBeInTheDocument();
      expect(screen.queryByText("100%")).not.toBeInTheDocument();

      settle(asset("clip", { mediaType: "video" }));
      await waitFor(() =>
        expect(screen.queryByText("Memproses…")).not.toBeInTheDocument(),
      );
    });

    it("still shows a percentage while the bytes are going out", async () => {
      upload.mockImplementation((_file, options) => {
        options.onProgress(40);
        return new Promise(() => {});
      });

      const user = userEvent.setup();
      const input = renderGallery();

      await user.upload(input, video(5 * 1024 * 1024));

      expect(await screen.findByText("40%")).toBeInTheDocument();
    });
  });
});
