"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Logo } from "@/components";
import { Button } from "@/components/ui/button";
import { LANDING_SECTIONS } from "../content";

/**
 * The landing page's top bar.
 *
 * ONE OF TWO CLIENT COMPONENTS ON THIS PAGE, and it exists for a single line:
 * the hairline under the bar appears only once the page has scrolled. A border
 * that is always there draws a rule across the hero it is meant to float over,
 * and there is no CSS-only way to ask "has this scrolled" that works in every
 * browser the shop's laptop might be running.
 *
 * Everything else here is static markup.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * The wordmark goes back to the hero, not through the router.
   *
   * THE HREF STAYS `/` so the browser's own affordances still work — middle
   * click, ⌘-click and "open in new tab" all want a real destination, and this
   * page IS `/`. What the plain click does not want is a route navigation to
   * the page it is already on, which repaints for nothing and lands at the top
   * with no movement to say it went anywhere.
   *
   * NO `behavior` PASSED. Left at its default the scroll takes `html`'s own
   * `scroll-behavior`, which `SmoothScroll` arms on this page and a reduced
   * motion preference switches back off — so the glide and the jump are decided
   * in one place, not two.
   *
   * AND THE `#kenapa` COMES OFF THE ADDRESS BAR. Suppressing the navigation
   * leaves whichever fragment the last section link put there, so somebody who
   * read a section and then clicked the wordmark is looking at the top of the
   * page with `/#kenapa` still in the URL — which is the address they would
   * copy, and it does not open where they are.
   *
   * `replaceState`, not `pushState`: the click does not go anywhere new, so it
   * should not put a stop on the back button. The query string is kept — a
   * visitor who arrived from an ad carries its tags in it, and a wordmark click
   * is no reason to drop them.
   */
  const backToHero = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;

    event.preventDefault();
    window.scrollTo({ top: 0 });

    if (window.location.hash) {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", `${pathname}${search}`);
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-surface/95 backdrop-blur-md transition ${
        scrolled ? "border-border" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center gap-8 px-5 sm:px-8">
        <Link
          href="/"
          onClick={backToHero}
          className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo size={36} />
          {/*
            THE PRODUCT'S NAME, not a tagline — "Buloo Jualan" is one name split
            across two typographic weights, which is why the divider is a border
            on the word rather than a separate glyph a screen reader would read
            out. Dropped below sm, where the wordmark alone already fills the row.
          */}
          <span className="border-l border-border pl-2.5 font-display text-sm font-bold text-muted max-sm:hidden">
            Jualan
          </span>
        </Link>

        {/*
          Hidden below lg rather than collapsed into a hamburger. The three links
          are anchors into this same page — a drawer to reach them costs two taps
          to do what scrolling already does with a thumb.
        */}
        <nav aria-label="Bagian halaman" className="hidden flex-1 lg:block">
          <ul className="flex gap-7">
            {LANDING_SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-block rounded-md border-b-2 border-transparent py-1.5 text-[15px] font-medium text-foreground transition hover:border-primary/25 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {/*
            THE ONLY WAY INTO THE APP FROM THIS PAGE. A shop that already has an
            account arrives here from a bookmark; without this they are looking
            at a sales pitch for software they are paying for.
          */}
          <Button asChild variant="ghost" className="h-11 px-4 font-semibold">
            <Link href="/login">Masuk</Link>
          </Button>
          {/*
            "Konsultasi gratis", not "Coba gratis". The button scrolls to the
            section that explains a person answers — and a label promising a
            self-serve trial would be contradicted by the first thing it reaches.
          */}
          <Button asChild className="h-11 px-4">
            <a href="#proses">Konsultasi gratis</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
