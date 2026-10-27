import type { Metadata } from "next";

import { KasBankScreen } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Biaya Tetap · Kas & Bank · Buloo",
};

export const dynamic = "force-dynamic";

/**
 * The second sub-tab of Kas & Bank — the SAME screen, told which half to show.
 *
 * A ROUTE RATHER THAN `useState`, like every other tab row in this product: a
 * sub-tab somebody cannot link to is a sub-tab nobody can send a colleague. It
 * takes no `searchParams`, because the filters a deep link carries are the
 * transaction list's and that list is on the other tab.
 */
export default function KasBankRecurringPage() {
  return (
    <RequirePermission
      anyOf={[
        { feature: "chartOfAccounts" },
        { feature: "cashTransactions" },
      ]}
    >
      <KasBankScreen now={new Date().toISOString()} section="biaya-tetap" />
    </RequirePermission>
  );
}
