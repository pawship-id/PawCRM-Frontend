import type { Metadata } from "next";

import { HelpHome } from "@/features/help";

export const metadata: Metadata = { title: "Panduan · Buloo" };

/**
 * The in-app guide's front page.
 *
 * NO `RequirePermission`: the guide is for everybody who can sign in — a
 * cashier reading how to close a shift is the point — and nothing on these
 * pages reads tenant data. Every page under /dashboard/help is static, built
 * from `src/content/help/`.
 */
export default function HelpPage() {
  return <HelpHome />;
}
