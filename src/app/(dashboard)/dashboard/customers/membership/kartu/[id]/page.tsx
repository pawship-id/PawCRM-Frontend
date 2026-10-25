import { redirect } from "next/navigation";

import { cardHref } from "@/features/memberships/labels";

/**
 * MOVED TO PROMOSI — 16 October 2026: Membership left Pelanggan for its own
 * rail module. Kept so old links and bookmarks land; delete once nothing links
 * here any more. `params` is a Promise in this version of Next — see AGENTS.md.
 */
export default async function MovedMembershipCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(cardHref(id));
}
