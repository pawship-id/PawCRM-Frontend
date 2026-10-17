import { redirect } from "next/navigation";

import { MEMBERSHIP_HREF } from "@/features/memberships/labels";

/**
 * MOVED TO PROMOSI — 16 October 2026: Membership left Pelanggan for its own
 * rail module. Kept so old links and bookmarks land; delete once nothing links
 * here any more. `params` is a Promise in this version of Next — see AGENTS.md.
 */
export default function MovedMembershipPage() {
  redirect(MEMBERSHIP_HREF);
}
