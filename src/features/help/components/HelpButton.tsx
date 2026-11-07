"use client";

import { CircleHelp } from "lucide-react";
import { usePathname } from "next/navigation";

import routeMap from "@/content/help/route-map.json";
import { cn } from "@/lib/utils";

import { helpHrefFor } from "../route";
import type { HelpRoute } from "../types";

const ROUTES = routeMap as HelpRoute[];

/**
 * The ? in the top bar: the guide for the screen you are on.
 *
 * A NEW TAB, ON PURPOSE. The people who need it are in the middle of
 * something — a half-filled faktur, a customer waiting at the till — and the
 * same tab would throw that away. On the guide's own pages there is nothing to
 * lose, so it opens in place there.
 *
 * A plain `<a>`, not `next/link`: a link that leaves for another tab has no
 * client-side navigation to do, and prefetching the guide on every screen of
 * the app would cost each of them a request for nothing.
 */
export function HelpButton({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const href = helpHrefFor(pathname, ROUTES);
  const insideHelp = pathname.startsWith("/dashboard/help");

  return (
    <a
      href={href}
      target={insideHelp ? undefined : "_blank"}
      rel={insideHelp ? undefined : "noopener"}
      aria-label={insideHelp ? "Beranda panduan" : "Panduan untuk halaman ini (tab baru)"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-primary-foreground/85 transition-colors hover:bg-white/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60",
        className,
      )}
    >
      <CircleHelp className="size-5" aria-hidden="true" />
    </a>
  );
}
