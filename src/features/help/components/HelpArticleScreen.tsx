import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Breadcrumb } from "@/components";
import { cn } from "@/lib/utils";

import { HELP_BASE, articleHref, moduleHref, type HelpArticleContext } from "../content";
import type { HelpArticle, HelpModule } from "../types";
import { HelpArticleList } from "./HelpArticleList";
import { HelpProse } from "./HelpProse";
import { HelpVersion } from "./HelpVersion";

/**
 * One article, with the rest of its topic beside it.
 *
 * The same two columns as the topic page — reading on the left, "Daftar
 * panduan" on the right — so opening an article does not move the list. On a
 * phone the list folds into a "Panduan lain" disclosure above the article,
 * where a column beside the text has no room.
 */
export function HelpArticleScreen({ context }: { context: HelpArticleContext }) {
  const { module, article, previous, next } = context;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: "Panduan", href: HELP_BASE },
          { label: module.title, href: moduleHref(module.slug) },
          { label: article.title },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <article className="min-w-0">
          <details className="mb-4 overflow-hidden rounded-xl border border-border bg-surface lg:hidden">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50">
              Panduan lain di {module.title}
            </summary>
            <div className="border-t border-border p-2">
              <HelpArticleList module={module} current={article.slug} />
            </div>
          </details>

          <p className="text-xs text-muted">
            {module.title} · bagian <span className="tabular-nums">{article.number}</span>
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">{article.title}</h1>
          <HelpVersion updatedAt={module.updatedAt} className="mt-1 text-xs text-muted" />

          <HelpProse html={article.html} className="mt-4" />

          <nav
            aria-label="Panduan sebelum dan sesudahnya"
            className="mt-10 grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
          >
            {previous ? <Neighbour module={module} article={previous} direction="previous" /> : <span />}
            {next ? (
              <Neighbour module={module} article={next} direction="next" />
            ) : (
              <Link
                href={`${moduleHref(module.slug)}#tanya-jawab`}
                className="flex min-h-11 flex-col items-end justify-center rounded-xl border border-border bg-surface px-4 py-3 text-right transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:col-start-2"
              >
                <span className="text-xs text-muted">Selanjutnya</span>
                <span className="text-sm font-semibold text-foreground">Tanya jawab {module.title}</span>
              </Link>
            )}
          </nav>
        </article>

        {/* Sticky, and scrolls on its own when a topic's list is taller than
            the window — Pengaturan Umum has twenty articles. */}
        <aside className="hidden lg:block">
          <nav
            aria-labelledby="daftar-panduan"
            className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col gap-3"
          >
            <h2 id="daftar-panduan" className="text-lg font-bold text-foreground">
              Daftar panduan
            </h2>
            <div className="min-h-0 overflow-y-auto rounded-xl">
              <HelpArticleList module={module} current={article.slug} />
            </div>
          </nav>
        </aside>
      </div>
    </div>
  );
}

function Neighbour({
  module,
  article,
  direction,
}: {
  module: HelpModule;
  article: HelpArticle;
  direction: "previous" | "next";
}) {
  const isNext = direction === "next";
  return (
    <Link
      href={articleHref(module.slug, article.slug)}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isNext && "flex-row-reverse text-right sm:col-start-2",
      )}
    >
      {isNext ? (
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      ) : (
        <ChevronLeft className="size-4 shrink-0 text-muted" aria-hidden="true" />
      )}
      <span className="flex flex-1 flex-col">
        <span className="text-xs text-muted">{isNext ? "Selanjutnya" : "Sebelumnya"}</span>
        <span className="text-sm font-semibold text-foreground">{article.title}</span>
      </span>
    </Link>
  );
}
