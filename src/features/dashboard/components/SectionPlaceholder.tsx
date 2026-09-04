import type { ComponentType, SVGProps } from "react";

/**
 * A "coming soon" scaffold for sections whose UI has not been built yet.
 * Keeps the sidebar links functional and the frame consistent, and states
 * plainly that the feature is not implemented rather than faking content.
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

      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon width={26} height={26} />
        </span>
        <div>
          <p className="text-base font-medium text-foreground">
            {title} is coming soon
          </p>
          <p className="mt-1 text-sm text-muted">
            This section is not built yet. The navigation and layout are ready
            for it.
          </p>
        </div>
      </div>
    </div>
  );
}
