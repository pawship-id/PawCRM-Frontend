import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Card as UICard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "./ui/card";

/**
 * A surface panel, backed by the shadcn/ui Card. Keeps the project's
 * `title` / `description` prop API (rather than the shadcn header sub-components)
 * so existing call sites — `<Card title="Account">…</Card>` — are unchanged.
 */
export interface CardProps extends Omit<ComponentProps<"div">, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  /**
   * One control in the header, opposite the title — an edit link, a filter.
   *
   * THE VENDORED CARD ALREADY LAYS THIS OUT: its header switches to two columns
   * when it finds a `data-slot="card-action"` child, and that slot was
   * unreachable from here until now. The alternative call sites were reaching
   * for — a floated button inside the body — sits below the title rather than
   * beside it, and drifts differently in every card that does it.
   */
  action?: ReactNode;
  /**
   * A numbered step of a long form (23 November 2026, BO mockup): a navy
   * circle with this number before the title, a rule under the header, and the
   * description under the rule.
   * Counted by the form, so a card it does not render takes no number — a CSS
   * counter cannot do it: the header is a size container, which scopes it.
   */
  step?: number;
  children: ReactNode;
}

export function Card({
  title,
  description,
  action,
  step,
  children,
  className,
  ...props
}: CardProps) {
  if (step !== undefined) {
    return (
      <UICard className={cn("gap-0 py-0", className)} {...props}>
        <CardHeader className="gap-1 border-b border-border py-3 [.border-b]:pb-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums"
            >
              {step}
            </span>
            {title && <CardTitle className="text-lg">{title}</CardTitle>}
          </div>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
        <CardContent className="py-4">
          {/* Under the rule, opening the body — as the mockup draws it. */}
          {description && (
            <p className="mb-4 text-sm text-muted">{description}</p>
          )}
          {children}
        </CardContent>
      </UICard>
    );
  }

  return (
    <UICard className={cn(className)} {...props}>
      {(title || description || action) && (
        <CardHeader>
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </UICard>
  );
}
