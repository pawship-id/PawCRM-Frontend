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
  children: ReactNode;
}

export function Card({
  title,
  description,
  action,
  children,
  className,
  ...props
}: CardProps) {
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
