import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Card as UICard,
  CardHeader,
  CardTitle,
  CardDescription,
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
  children: ReactNode;
}

export function Card({
  title,
  description,
  children,
  className,
  ...props
}: CardProps) {
  return (
    <UICard className={cn(className)} {...props}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </UICard>
  );
}
