"use client";

import { cn } from "@/lib/utils";
import type { Pet } from "@/types/api";

/**
 * The pet's one photo, wherever the animal is named.
 *
 * A COMPONENT RATHER THAN THREE `<img>` TAGS, because three callers needed the
 * same four decisions and none of them is obvious: which derivative to request,
 * what to draw when there is no photo, what the alt text says, and whether the
 * thing is announced to a screen reader at all. ui-rules §14 puts a component in
 * its feature until a second one needs it — the list, the profile header and the
 * print card were the second, third and fourth.
 *
 * THE PLACEHOLDER IS THE PET'S INITIAL, NOT A PAW PRINT. ui-rules §12 bans the
 * paw as decoration by name, and the letter is the better answer anyway: in a
 * list of twenty animals a generic icon repeated twenty times distinguishes
 * nothing, while B and M are told apart at a glance. It is also not an error
 * state — most pets have no photo and never will, since a shop registers thirty
 * at the counter and photographs the ones it grooms.
 *
 * DECORATIVE, AND THAT IS THE ACCESSIBLE CHOICE rather than the lazy one. This
 * sits directly beside the pet's name everywhere it is used, so naming it would
 * make a screen reader read that name twice — §1 wants `alt=""` when an image
 * repeats its own caption. The print card is the exception and passes `alt`,
 * because there the photo IS how a groomer identifies the animal.
 *
 * A PLAIN `<img>`, not `next/image`: the host depends on `MEDIA_DRIVER`, which
 * is a deployment choice, and `next.config` cannot be given a remote pattern for
 * a bucket it will not learn about until boot. The same reason MediaGallery and
 * ImageField give.
 */

/**
 * The size a caller draws it at, and the type that rides along.
 *
 * The letter is sized per box rather than with a fraction, because §5 sets a
 * 13 px floor and `text-[50%]` inside a `size-9` would sail under it.
 */
const SIZES = {
  sm: { box: "size-9", initial: "text-sm" },
  md: { box: "size-16", initial: "text-xl" },
  lg: { box: "size-24", initial: "text-3xl" },
} as const;

export function PetAvatar({
  pet,
  size = "sm",
  alt,
  className,
}: {
  /** Only the two fields it draws — so a caller need not hold a whole Pet. */
  pet: Pick<Pet, "name" | "photo">;
  size?: keyof typeof SIZES;
  /** Named rather than decorative. Omit it beside a visible pet name. */
  alt?: string;
  className?: string;
}) {
  /*
    `thumbUrl` IS 320px — ample for the first two sizes and visibly soft at the
    print card's, which renders at ~25mm on paper at whatever DPI the printer
    runs, so that one asks for the 800.

    ⚠️ BOTH DERIVATIVES ARE NULLABLE, hence the chain rather than a direct read:
    a video has neither (refused on this field, but the type allows it) and so
    does anything stored before those fields existed. See media.schema.js.
  */
  const source =
    size === "lg"
      ? (pet.photo?.mediumUrl ?? pet.photo?.thumbUrl ?? pet.photo?.url)
      : (pet.photo?.thumbUrl ?? pet.photo?.url);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-hover",
        SIZES[size].box,
        className,
      )}
    >
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt={alt ?? ""}
          aria-hidden={alt ? undefined : true}
          className="size-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn("font-semibold text-muted", SIZES[size].initial)}
        >
          {/*
            `Array.from` rather than `[0]`: an emoji or an accented letter is
            more than one code unit, and slicing one in half renders a replacement
            glyph where a name was. A pet with a blank name cannot be saved, but
            the fallback keeps the circle from collapsing if one ever is.
          */}
          {Array.from(pet.name.trim())[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </span>
  );
}
