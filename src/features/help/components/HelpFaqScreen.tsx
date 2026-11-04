import { Breadcrumb } from "@/components";

import { HELP_BASE, helpModules, moduleHref } from "../content";
import { HelpFaqList } from "./HelpFaqList";
import { HelpSearch } from "./HelpSearch";
import { HelpVersion } from "./HelpVersion";

/**
 * Every question from every topic on one page, grouped by topic — for
 * somebody who would rather scan than search. The answers are the same ones
 * each topic page shows; nothing here is written separately.
 */
export function HelpFaqScreen() {
  const modules = helpModules().filter((m) => m.faq.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div>
          <Breadcrumb items={[{ label: "Panduan", href: HELP_BASE }, { label: "Tanya jawab" }]} />
          <h1 className="mt-2 text-2xl font-extrabold text-foreground">Tanya jawab</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Pertanyaan yang sering muncul saat memakai Buloo. Klik pertanyaan untuk melihat jawabannya.
          </p>
          <HelpVersion className="mt-2 text-xs text-muted" />
        </div>
        <div className="max-w-3xl">
          <HelpSearch />
        </div>
      </div>

      {modules.map((module) => (
        <section
          key={module.slug}
          aria-labelledby={`faq-${module.slug}`}
          className="flex max-w-3xl flex-col gap-3"
        >
          <h2 id={`faq-${module.slug}`} className="text-lg font-bold text-foreground">
            {module.title}
          </h2>
          <HelpFaqList
            faq={module.faq}
            idPrefix={`${module.slug}-tanya`}
            source={{ label: `Buka panduan ${module.title}`, href: moduleHref(module.slug) }}
          />
        </section>
      ))}
    </div>
  );
}
