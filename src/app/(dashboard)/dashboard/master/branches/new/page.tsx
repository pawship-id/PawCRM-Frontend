import { redirect } from "next/navigation";

/**
 * GONE, NOT MOVED (22 September 2026). A tenant no longer creates its own
 * branches: each one is its own subscription and is switched on by the Buloo
 * team, as the mockup (`buloo-navigation-v3`) draws it. The list says who to
 * ask; old links land there.
 */
export default function NewBranchPage() {
  redirect("/dashboard/pengaturan/cabang");
}
