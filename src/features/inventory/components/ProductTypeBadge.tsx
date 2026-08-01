import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProductType } from "@/types/inventory";

/**
 * What kind of catalogue row this is.
 *
 * A parent shows its variant COUNT rather than the word "parent", because the
 * count is the useful fact — "6 varian" tells a reader both what the row is and
 * how far it expands, where the type name alone tells them only the first.
 */
const TONES: Record<ProductType, string> = {
  standalone: "bg-accent text-muted",
  parent: "bg-primary/12 text-primary-hover",
  variant: "bg-accent text-muted",
  bundle: "bg-foreground text-background",
};

export function ProductTypeBadge({
  type,
  variantCount,
}: {
  type: ProductType;
  variantCount?: number;
}) {
  const label =
    type === "parent" && variantCount !== undefined
      ? `${variantCount} varian`
      : type === "standalone"
        ? "standalone"
        : type === "variant"
          ? "varian"
          : "bundle";

  return (
    <Badge variant="outline" className={cn("border-transparent", TONES[type])}>
      {label}
    </Badge>
  );
}
