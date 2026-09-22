"use client";

import type { ComponentProps } from "react";
import Link from "next/link";

import { rememberServiceFormOrigin, type ServiceFormOrigin } from "../formOrigin";

/**
 * A link into the service form that leaves its origin behind — see
 * `formOrigin.ts`. The address stays plain (`/dashboard/master/layanan/new`,
 * `/dashboard/master/layanan/:id`); the module is remembered for the tab.
 */
export function ServiceFormLink({
  origin,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { origin: ServiceFormOrigin }) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        rememberServiceFormOrigin(origin);
        onClick?.(event);
      }}
    />
  );
}
