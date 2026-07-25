import type { HTMLAttributes, ReactNode } from "react";

/** A surface panel — the container for forms and profile sections. */
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
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
    <div
      {...props}
      className={[
        "rounded-2xl border border-border bg-surface p-6 shadow-sm",
        className ?? "",
      ].join(" ")}
    >
      {(title || description) && (
        <div className="mb-5">
          {title && (
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          )}
          {description && (
            <p className="mt-1 text-sm text-muted">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
