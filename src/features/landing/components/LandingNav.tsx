"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Logo } from "@/components";
import { Button } from "@/components/ui/button";
import { LANDING_SECTIONS } from "../content";

/**
 * The landing page's top bar.
 *
 * THE ONE CLIENT COMPONENT ON THIS PAGE, and it exists for a single line: the
 * hairline under the bar appears only once the page has scrolled. A border that
 * is always there draws a rule across the hero it is meant to float over, and
 * there is no CSS-only way to ask "has this scrolled" that works in every
 * browser the shop's laptop might be running.
 *
 * Everything else here is static markup, so the rest of the page stays a server
 * component and ships no JavaScript.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-surface/95 backdrop-blur-md transition ${
        scrolled ? "border-border" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center gap-8 px-5 sm:px-8">
        <Link
          href="/"
          className="shrink-0 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Logo size={36} />
        </Link>

        {/*
          Hidden below lg rather than collapsed into a hamburger. The five links
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
          <Button asChild variant="ghost" className="h-11 px-4 font-semibold">
            <Link href="/login">Masuk</Link>
          </Button>
          <Button asChild className="h-11 px-4">
            <a href="#coba">Coba gratis</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
