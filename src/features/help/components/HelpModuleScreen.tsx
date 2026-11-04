import { Breadcrumb, Card } from "@/components";

import { HELP_BASE } from "../content";
import type { HelpModule } from "../types";
import { HelpArticleList } from "./HelpArticleList";
import { HelpFaqList } from "./HelpFaqList";
import { HelpProse } from "./HelpProse";
import { HelpSearch } from "./HelpSearch";
import { HelpVersion } from "./HelpVersion";

/**
 * One topic: the manual's "Sebelum Mulai", every article in it in the order
 * the work is done, then its questions and tips — the PDF's cover-to-back
 * order, minus the pages.
 */
export function HelpModuleScreen({ module }: { module: HelpModule }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div>
          <Breadcrumb items={[{ label: "Panduan", href: HELP_BASE }, { label: module.title }]} />
          <h1 className="mt-2 text-2xl font-extrabold text-foreground">{module.title}</h1>
          {module.subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{module.subtitle}</p>}
          <HelpVersion updatedAt={module.updatedAt} className="mt-2 text-xs text-muted" />
        </div>
        <div className="max-w-3xl">
          <HelpSearch />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="sebelum-mulai" className="min-w-0">
          <Card>
            <h2 id="sebelum-mulai" className="mb-3 text-lg font-bold text-foreground">
              Sebelum mulai
            </h2>
            <HelpProse html={module.introHtml} />
          </Card>
        </section>

        <section aria-labelledby="daftar-panduan" className="flex min-w-0 flex-col gap-3">
          <h2 id="daftar-panduan" className="text-lg font-bold text-foreground">
            Daftar panduan
          </h2>
          <HelpArticleList module={module} />
        </section>
      </div>

      {(module.faq.length > 0 || module.tips.length > 0) && (
        <section id="tanya-jawab" aria-labelledby="judul-tanya-jawab" className="flex scroll-mt-20 flex-col gap-3">
          <h2 id="judul-tanya-jawab" className="text-lg font-bold text-foreground">
            Tanya jawab
          </h2>
          {module.faq.length > 0 && <HelpFaqList faq={module.faq} />}
          {module.tips.length > 0 && (
            <Card>
              <h3 className="mb-2 text-base font-bold text-foreground">Tips</h3>
              <ul className="help-prose">
                {module.tips.map((tip) => (
                  <li key={tip} dangerouslySetInnerHTML={{ __html: tip }} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
