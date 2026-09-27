import type { Metadata } from "next";

import { CustomerProfileScreen } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Profil pelanggan · Pelanggan · Buloo",
};

/**
 * A customer's profile — the mockup's `profilPelanggan`, reached by clicking a row
 * in the Pelanggan list.
 *
 * IT USED TO BE THE EDIT FORM, gated on `customers:update`. It is gated on `read`
 * now, for the reason the pet profile moved the same way: most of what is on this
 * page is something to LOOK at — whose animals these are, which number to ring,
 * what they still owe — and a groomer who may not edit a customer still needs all
 * of it. Editing moved to `./edit`, behind its own gate. See CustomerProfileScreen.
 *
 * `params` is a Promise in this version of Next, so this is an async Server
 * Component that awaits it and hands the id to the client screen.
 */
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="customers" action="read">
      <CustomerProfileScreen id={id} />
    </RequirePermission>
  );
}
