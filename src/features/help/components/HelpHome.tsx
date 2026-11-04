import Link from "next/link";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";

import { Card } from "@/components";

import { HELP_BASE, helpGroups, helpModules, moduleHref } from "../content";
import type { HelpModule } from "../types";
import { HelpSearch } from "./HelpSearch";
import { HelpVersion } from "./HelpVersion";

/**
 * The guide's front page, on the pattern help centres converge on (Jubelio
 * Education among them): one big search box, then the topics as cards, grouped
 * the way the manual's own "Daftar Buku Panduan" orders them — start here, set
 * up once, then the daily work.
 */
export function HelpHome() {
  const groups = helpGroups();
  const faqCount = helpModules().reduce((sum, m) => sum + m.faq.length, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Panduan Buloo</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Cara memakai setiap menu, langkah demi langkah, beserta jawaban untuk pertanyaan yang
            sering muncul.
          </p>
          <HelpVersion className="mt-2 text-xs text-muted" />
        </div>
        <div className="max-w-3xl">
          <HelpSearch autoFocus />
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`grup-${group.key}`} className="flex flex-col gap-3">
          <h2 id={`grup-${group.key}`} className="text-lg font-bold text-foreground">
            {group.label}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.modules.map((module) => (
              <li key={module.slug}>
                <ModuleCard module={module} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="grup-tanya-jawab" className="flex flex-col gap-3">
        <h2 id="grup-tanya-jawab" className="text-lg font-bold text-foreground">
          Tanya jawab
        </h2>
        <Link
          href={`${HELP_BASE}/faq`}
          className="group block max-w-xl rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Card className="transition-colors group-hover:bg-surface-hover">
            <div className="flex items-center gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-primary">
                <MessageCircleQuestion className="size-5" aria-hidden="true" />
              </span>
              <div className="flex-1">
                <h3 className="text-base font-bold text-foreground">Semua tanya jawab</h3>
                <p className="text-sm text-muted">
                  <span className="tabular-nums">{faqCount}</span> pertanyaan dari semua topik
                </p>
              </div>
              <ArrowRight className="size-4 text-muted" aria-hidden="true" />
            </div>
          </Card>
        </Link>
      </section>
    </div>
  );
}

function ModuleCard({ module }: { module: HelpModule }) {
  return (
    <Link
      href={moduleHref(module.slug)}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors group-hover:bg-surface-hover">
        <div className="flex h-full flex-col gap-2">
          <h3 className="text-base font-bold text-foreground">{module.title}</h3>
          <p className="flex-1 text-sm text-muted">{module.subtitle}</p>
          <p className="text-xs text-muted">
            <span className="tabular-nums">{module.articles.length}</span> panduan
            {module.faq.length > 0 && (
              <>
                {" · "}
                <span className="tabular-nums">{module.faq.length}</span> tanya jawab
              </>
            )}
          </p>
        </div>
      </Card>
    </Link>
  );
}
