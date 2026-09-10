import { FileText, MessageCircle, Search, Users } from "lucide-react";

import { PROCESS_STEPS, type StepIcon } from "../content";

/** lucide only, per ui-rules §11 — the keys in content.ts resolve here. */
const ICONS: Record<StepIcon, typeof MessageCircle> = {
  chat: MessageCircle,
  search: Search,
  quote: FileText,
  team: Users,
};

/**
 * How a shop actually starts, in the order it happens.
 *
 * THE RAIL ONLY EXISTS ON THE FOUR-ACROSS LAYOUT. Stacked or two-up, a line
 * running off the right edge of a step points at the step below-left of it,
 * which is the opposite of what a connector is for.
 *
 * ONE ORANGE TILE, on step three. It is the step the whole section is walking
 * towards — the offer — and ui-rules §4 allows exactly one thing per viewport to
 * claim that much attention.
 */
export function ProcessSteps() {
  return (
    <ol className="grid gap-y-9 md:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
      {PROCESS_STEPS.map((step, index) => {
        const Icon = ICONS[step.icon];
        const isLast = index === PROCESS_STEPS.length - 1;

        return (
          <li key={step.title} className="lg:pr-6">
            <div className="mb-4 flex items-center">
              <span
                className={`flex size-13 shrink-0 items-center justify-center rounded-xl ${
                  step.highlight
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-tint-brand text-primary"
                }`}
              >
                <Icon aria-hidden className="size-6" />
              </span>
              {!isLast && (
                <span
                  aria-hidden
                  className="ml-1.5 hidden h-0.5 flex-1 bg-border lg:block"
                />
              )}
            </div>

            <p
              className={`mb-1.5 text-xs font-bold tracking-wide uppercase ${
                step.highlight ? "text-warning" : "text-muted"
              }`}
            >
              {step.when}
            </p>
            <h3 className="mb-1.5 text-[17px] leading-tight font-bold">
              {step.title}
            </h3>
            <p className="max-w-[38ch] text-[15px] text-muted">{step.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
