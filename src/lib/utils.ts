import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names and resolve Tailwind conflicts.
 * The standard shadcn/ui helper: clsx builds the list, tailwind-merge de-dupes
 * conflicting utilities (e.g. two `px-*`), last one winning.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
