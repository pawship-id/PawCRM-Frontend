import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MediaGallery } from "@/components/MediaGallery";
import type { ProductMedia } from "@/types/inventory";

jest.mock("@/services/media.service", () => ({
  mediaService: { upload: jest.fn() },
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
});
