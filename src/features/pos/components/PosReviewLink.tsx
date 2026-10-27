"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
import { posOfflineService } from "@/services/posOffline.service";

/**
 * "Perlu dicek (n)" on the shift bar, for whoever works that list (POS offline
 * mode, 19 October 2026). Drawn only when something is waiting and the reader
 * may act on it; asked once when the till opens and again after a sync.
 */
export function PosReviewLink({
  branchId,
  refreshKey,
  offline,
}: {
  branchId: string;
  refreshKey: unknown;
  offline: boolean;
}) {
  const { can } = usePermissions();
  const mayReview = can("posTransactions", "reviewOffline");
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!mayReview || offline) return;
    let active = true;
    posOfflineService
      .countOpen(branchId)
      .then((result) => {
        if (active) setCount(result.count);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mayReview, offline, branchId, refreshKey]);

  if (!mayReview || count === 0) return null;

  return (
    <Button asChild type="button" variant="secondary" size="sm">
      <Link href="/dashboard/pos/needs-review">
        <ClipboardCheck className="size-4" />
        Perlu dicek ({count})
      </Link>
    </Button>
  );
}
