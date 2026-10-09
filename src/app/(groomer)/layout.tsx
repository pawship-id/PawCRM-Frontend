import type { ReactNode } from "react";

import { GroomerShell } from "@/features/groomer";

/**
 * Frame for the groomer's phone app. A route group of its own rather than a
 * corner of `(dashboard)`, because the dashboard's frame is a desktop rail and
 * header that a groomer holding a wet dog has no use for.
 */
export default function GroomerLayout({ children }: { children: ReactNode }) {
  return <GroomerShell>{children}</GroomerShell>;
}
