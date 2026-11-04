"use client";

import { jobActive as isActive, useJobPoll } from "@/hooks/useJobPoll";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { OpnameJob } from "@/types/opnameImport";

/** Still to finish: the bar moves, and the sheets it holds stay read-only. */
export function jobActive(job: OpnameJob | null | undefined): boolean {
  return isActive(job);
}

/** An opname job — a big import or Submit semua — watched. See `useJobPoll`. */
export function useOpnameJob(
  initial: OpnameJob | null,
  { onFinished }: { onFinished?: (job: OpnameJob) => void } = {},
) {
  return useJobPoll(initial, {
    fetchJob: stockOpnameService.job,
    resumeJob: stockOpnameService.resumeJob,
    onFinished,
  });
}
