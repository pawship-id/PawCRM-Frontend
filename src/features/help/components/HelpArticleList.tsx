import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { articleHref, moduleHref } from "../content";
import type { HelpModule } from "../types";

/**
 * A topic's articles as one bordered list — the right-hand column of both the
 * topic page and an article, so moving from one to the other keeps the list
 * where it was. On an article, `current` marks the one being read and the
 * list ends with the topic's questions, which the topic page shows in full
 * below it instead.
 */
export function HelpArticleList({ module, current }: { module: HelpModule; current?: string }) {
  const rowClass =
    "flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50";
  const withFaq = current !== undefined && (module.faq.length > 0 || module.tips.length > 0);

  return (
    <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {module.articles.map((article) => {
        const active = article.slug === current;
        return (
          <li key={article.slug}>
            <Link
              href={articleHref(module.slug, article.slug)}
              aria-current={active ? "page" : undefined}
              className={cn(rowClass, active && "bg-navy-100 hover:bg-navy-100")}
            >
              <span className="w-6 shrink-0 text-right text-sm text-muted tabular-nums">
                {article.number}
              </span>
              <span className={cn("flex-1 text-sm text-foreground", active ? "font-semibold" : "font-medium")}>
                {article.title}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
      {withFaq && (
        <li>
          <Link href={`${moduleHref(module.slug)}#tanya-jawab`} className={rowClass}>
            <span className="w-6 shrink-0" />
            <span className="flex-1 text-sm font-medium text-foreground">Tanya jawab</span>
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
          </Link>
        </li>
      )}
    </ol>
  );
}
