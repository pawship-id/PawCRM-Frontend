import { redirect } from "next/navigation";

/**
 * MOVED TO PENGATURAN — 20 September 2026. See the sibling `new/page.tsx` for
 * why the address stays alive.
 *
 * THE ID IS CARRIED OVER rather than dropped at the list: somebody following a
 * bookmark to one channel wants that channel's form, and landing on a list of
 * six with no idea which was meant is a redirect that technically worked.
 *
 * `params` is a Promise in this version of Next — see AGENTS.md.
 */
export default async function MovedEditPaymentChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/dashboard/pengaturan/channel-pembayaran/${id}`);
}
