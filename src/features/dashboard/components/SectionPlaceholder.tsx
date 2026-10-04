import type { ComponentType, SVGProps } from "react";

/**
 * A "belum tersedia" scaffold for sections whose UI has not been built yet.
 * Keeps the sidebar links functional and the frame consistent, and states
 * plainly that the feature is not implemented rather than faking content.
 *
 * Copy is Bahasa per ui-rules §12 — it was English until the rail rebuild gave
 * it four more call sites, which made it worth the one-file fix.
 */
export function SectionPlaceholder({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>

      <SectionPlaceholderPanel
        title={title}
        icon={Icon}
        note="Bagian ini belum dibangun. Menunya sudah siap menampung."
      />
    </div>
  );
}

/**
 * The dashed panel on its own, for a screen that already has a heading.
 *
 * SPLIT OUT FOR THE MODULE TABS. Membership and Riwayat are tabs of the
 * Pelanggan module: the page above them already prints the title, the tab row
 * and the module's counts, so a placeholder that brought its own `h1` would put
 * a second title under the first. What is actually shared is this panel — the
 * one shape in the app that means "not built yet".
 */
export function SectionPlaceholderPanel({
  title,
  note,
  icon: Icon,
}: {
  title: string;
  /** What is missing and what the reader can do instead, in one sentence. */
  note: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon width={26} height={26} />
      </span>
      <div>
        <p className="text-base font-medium text-foreground">
          {title} belum tersedia
        </p>
        <p className="mt-1 max-w-prose text-sm text-muted">{note}</p>
      </div>
    </div>
  );
}
