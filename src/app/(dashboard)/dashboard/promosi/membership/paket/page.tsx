import { redirect } from "next/navigation";

import { MEMBERSHIP_HREF } from "@/features/memberships/labels";

/** The Paket list is the Membership tab itself; this segment only holds ids. */
export default function MembershipPlansIndexPage() {
  redirect(MEMBERSHIP_HREF);
}
