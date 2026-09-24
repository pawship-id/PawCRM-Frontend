import { render, screen } from "@testing-library/react";

import { PetAvatar } from "@/features/pets";
import type { Pet } from "@/types/api";
import type { MediaAsset } from "@/types/inventory";

/**
 * THE PET'S ONE PHOTO, wherever the animal is named — the list, the profile
 * header and the printed card.
 *
 * What is worth pinning here is the handful of decisions a future reader would
 * otherwise "tidy up": which derivative each size asks for, that the fallback
 * chain exists because both derivatives are nullable, and that the thing is
 * decorative unless a caller names it.
 */
const photo = (overrides: Partial<MediaAsset> = {}): MediaAsset =>
  ({
    mediaType: "image",
    url: "https://cdn.test/full.webp",
    storageKey: "tenant-1/pet/2026/09/abc.webp",
    driver: "local",
    mimeType: "image/webp",
    mediumUrl: "https://cdn.test/medium.webp",
    thumbUrl: "https://cdn.test/thumb.webp",
    ...overrides,
  }) as MediaAsset;

const pet = (overrides: Partial<Pet> = {}): Pet =>
  ({ _id: "pet-1", name: "Mochi", photo: null, ...overrides }) as Pet;

describe("PetAvatar", () => {
  /*
    THE PLACEHOLDER IS THE INITIAL, NOT A PAW PRINT — ui-rules §12 bans the paw
    as decoration, and in a list of twenty animals one repeated icon
    distinguishes nothing while B and M are told apart at a glance.
  */
  it("falls back to the pet's initial when there is no photo", () => {
    render(<PetAvatar pet={pet()} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  /*
    A NAME IS MORE THAN ONE CODE UNIT sometimes. Slicing `[0]` off an emoji or an
    accented letter renders a replacement glyph where a name was.
  */
  it("takes a whole grapheme, not a code unit", () => {
    render(<PetAvatar pet={pet({ name: "Émile" })} />);

    expect(screen.getByText("É")).toBeInTheDocument();
  });

  /*
    320px IS AMPLE AT THE TWO SCREEN SIZES and visibly soft on paper, so the
    print card's `lg` is the one that asks for the 800.
  */
  it("asks for the thumbnail when small and the 800 when large", () => {
    const { rerender } = render(
      <PetAvatar pet={pet({ photo: photo() })} alt="Foto Mochi" />,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.test/thumb.webp",
    );

    rerender(
      <PetAvatar pet={pet({ photo: photo() })} size="lg" alt="Foto Mochi" />,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.test/medium.webp",
    );
  });

  /*
    ⚠️ BOTH DERIVATIVES ARE NULLABLE — a video has neither, and so does anything
    stored before those fields existed. Hence the chain rather than a direct read.
  */
  it("falls back to the full-size url when the derivatives are missing", () => {
    render(
      <PetAvatar
        pet={pet({ photo: photo({ mediumUrl: null, thumbUrl: null }) })}
        size="lg"
        alt="Foto Mochi"
      />,
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.test/full.webp",
    );
  });

  /*
    DECORATIVE BESIDE A VISIBLE NAME. Naming it would make a screen reader read
    the pet's name twice — it sits directly next to it on every screen surface.
    The print card is the exception, because there the photo IS how a groomer
    matches the card to the animal.
  */
  it("is hidden from a screen reader unless the caller names it", () => {
    const { rerender } = render(<PetAvatar pet={pet({ photo: photo() })} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    rerender(<PetAvatar pet={pet({ photo: photo() })} alt="Foto Mochi" />);
    expect(screen.getByRole("img", { name: "Foto Mochi" })).toBeInTheDocument();
  });
});
