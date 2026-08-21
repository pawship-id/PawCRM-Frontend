import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CategoryImageField } from "@/features/categories/components/CategoryImageField";
import { mediaService } from "@/services/media.service";
import { ApiError } from "@/services/api-error";
import type { MediaAsset } from "@/types/inventory";

jest.mock("@/services/media.service", () => ({
  mediaService: { upload: jest.fn() },
}));

/**
 * The cropper is replaced with a button that hands back a blob.
 *
 * `react-easy-crop` measures the DOM as it mounts and crops onto a canvas, and
 * jsdom has neither a layout nor a 2D context — a real one would render an
 * empty box and never produce bytes, so every assertion below would be about
 * the stub's absence rather than about this component. What is being tested
 * here is the wiring on either side of the crop: which file reaches it, and
 * what happens to the blob that comes back.
 */
jest.mock("@/components/ImageCropDialog", () => ({
  ImageCropDialog: ({
    onCropped,
    onCancel,
  }: {
    onCropped: (blob: Blob) => void;
    onCancel: () => void;
  }) => (
    <div role="dialog" aria-label="Potong gambar">
      <button type="button" onClick={() => onCropped(new Blob(["x"]))}>
        Potong
      </button>
      <button type="button" onClick={onCancel}>
        Batal potong
      </button>
    </div>
  ),
}));

/**
 * The category's one picture.
 *
 * WHAT IS ASSERTED IS THE ASSET HANDED UP, because that object is what the form
 * sends to the API — token and all. A picker that renders a preview and reports
 * the wrong asset is the failure this cannot be allowed to miss.
 */
describe("CategoryImageField", () => {
  const asset = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
    mediaType: "image",
    url: "http://localhost:5000/media/t1/category/2026/08/a.webp",
    storageKey: "t1/category/2026/08/a.webp",
    driver: "local",
    mimeType: "image/webp",
    thumbUrl: "http://localhost:5000/media/t1/category/2026/08/a_thumb.webp",
    token: "signed",
    ...overrides,
  });

  const file = () =>
    new File(["bytes"], "kucing.png", { type: "image/png" });

  beforeAll(() => {
    // jsdom implements neither, and the component makes an object URL for the
    // cropper's preview and revokes it on close.
    URL.createObjectURL = jest.fn(() => "blob:preview");
    URL.revokeObjectURL = jest.fn();
  });

  /** The hidden file input — the only way to hand jsdom a File. */
  const fileInput = (container: HTMLElement) =>
    container.querySelector('input[type="file"]') as HTMLInputElement;

  it("uploads the cropped bytes and reports the asset", async () => {
    const uploaded = asset();
    (mediaService.upload as jest.Mock).mockResolvedValue(uploaded);
    const onChange = jest.fn();

    const { container } = render(
      <CategoryImageField value={null} onChange={onChange} />,
    );

    await userEvent.upload(fileInput(container), file());
    await userEvent.click(await screen.findByRole("button", { name: "Potong" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(uploaded));
  });

  it("files the upload under the category purpose", async () => {
    (mediaService.upload as jest.Mock).mockResolvedValue(asset());

    const { container } = render(
      <CategoryImageField value={null} onChange={jest.fn()} />,
    );

    await userEvent.upload(fileInput(container), file());
    await userEvent.click(await screen.findByRole("button", { name: "Potong" }));

    // The purpose becomes a segment of the storage key, and the orphan sweeper
    // reads it. Sending `product` would file a category's picture where nothing
    // looks for it — and it would be swept after the grace period.
    await waitFor(() =>
      expect(mediaService.upload).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ purpose: "category" }),
      ),
    );
  });

  it("accepts only the image types the server can decode", () => {
    const { container } = render(
      <CategoryImageField value={null} onChange={jest.fn()} />,
    );

    // A video is refused by the API — there is no second item to fall back to
    // in a field that renders as one tile — so it is not offered here either.
    expect(fileInput(container).accept).toBe(
      "image/png,image/jpeg,image/webp",
    );
  });

  it("uploads nothing when the crop is cancelled", async () => {
    const { container } = render(
      <CategoryImageField value={null} onChange={jest.fn()} />,
    );

    await userEvent.upload(fileInput(container), file());
    await userEvent.click(
      await screen.findByRole("button", { name: "Batal potong" }),
    );

    expect(mediaService.upload).not.toHaveBeenCalled();
    // The preview URL pins the whole file in memory until it is revoked.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("shows a failed upload rather than silently keeping the old picture", async () => {
    (mediaService.upload as jest.Mock).mockRejectedValue(
      new ApiError("Gambar terlalu besar", 400),
    );
    const onChange = jest.fn();

    const { container } = render(
      <CategoryImageField value={null} onChange={onChange} />,
    );

    await userEvent.upload(fileInput(container), file());
    await userEvent.click(await screen.findByRole("button", { name: "Potong" }));

    expect(await screen.findByText("Gambar terlalu besar")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders the stored picture and offers to replace it", () => {
    render(<CategoryImageField value={asset()} onChange={jest.fn()} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "http://localhost:5000/media/t1/category/2026/08/a_thumb.webp",
    );
    expect(
      screen.getByRole("button", { name: /ganti gambar/i }),
    ).toBeInTheDocument();
  });

  it("falls back to the full-size url on an asset stored before thumbnails", () => {
    render(
      <CategoryImageField
        value={asset({ thumbUrl: null })}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "http://localhost:5000/media/t1/category/2026/08/a.webp",
    );
  });

  it("clears the field on remove without deleting anything yet", async () => {
    const onChange = jest.fn();

    render(<CategoryImageField value={asset()} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /hapus/i }));

    // `null` is what the API reads as "remove it". The bytes go when the
    // category is saved — doing it here would strand a live category's picture
    // if the user then cancelled the dialog.
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("offers no picker at all while the form is saving", () => {
    render(
      <CategoryImageField value={asset()} onChange={jest.fn()} disabled />,
    );

    expect(screen.getByRole("button", { name: /ganti gambar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /hapus/i })).toBeDisabled();
  });
});
