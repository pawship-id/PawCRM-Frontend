import type { Metadata } from "next";

import { GroomerScreen } from "@/features/groomer";

export const metadata: Metadata = { title: "Job Saya · Buloo" };

/**
 * Job Saya — the groomer's day.
 *
 * NO `RequirePermission`: the page asks the server what this person may see, and
 * the server answers by what they hold. A person without the grants gets a 403
 * from `/groomer/jobs`, shown as a message, rather than a screen that hides.
 */
export default function GroomerPage() {
  return <GroomerScreen />;
}
