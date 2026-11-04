"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";

import type { HelpFaq } from "../types";

interface HelpFaqListProps {
  faq: HelpFaq[];
  /**
   * Prefix for each answer's anchor. On a module page the answers are
   * `#tanya-1`…, which is what the search results link to; the all-FAQ page
   * prefixes the module so two "tanya-1" cannot collide.
   */
  idPrefix?: string;
  /** Shown above the questions, linking to where they come from. */
  source?: { label: string; href: string };
}

/**
 * Questions that open to their answers — native `<details>`, so the keyboard,
 * the screen reader and find-in-page all work without any of our code.
 *
 * The one thing `<details>` does not do is open itself when the address names
 * it: a search result pointing at `#tanya-3` would scroll to a closed question.
 * The effect below opens the targeted one, on load and on every hash change.
 */
export function HelpFaqList({ faq, idPrefix = "tanya", source }: HelpFaqListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function openTarget() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = listRef.current?.querySelector<HTMLDetailsElement>(
        `details[id="${CSS.escape(id)}"]`,
      );
      if (!target) return;
      target.open = true;
      target.scrollIntoView({ block: "center" });
    }
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, []);

  return (
    <div ref={listRef} className="flex flex-col gap-2">
      {source && (
        <Link
          href={source.href}
          className="w-fit rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {source.label}
        </Link>
      )}
      {faq.map((item, index) => (
        <details
          key={item.question}
          id={`${idPrefix}-${index + 1}`}
          className="group scroll-mt-20 rounded-xl border border-border bg-surface"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <ChevronDown
              className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div
            className="help-prose border-t border-border px-4 py-3"
            dangerouslySetInnerHTML={{ __html: item.answer }}
          />
        </details>
      ))}
    </div>
  );
}
