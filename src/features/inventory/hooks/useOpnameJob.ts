"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { OpnameJob } from "@/types/opnameImport";

/** Often enough that a bar visibly moves, rarely enough to be no load at all. */
const POLL_MS = 1500;

/** Still to finish: the bar moves, and the sheets it holds stay read-only. */
export function jobActive(job: OpnameJob | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

/**
 * ONE BACKGROUND JOB, WATCHED. Polls while it is queued or running and stops on
 * its own once it is done or failed — `onFinished` hears about that once, which
 * is where a screen reloads the sheet the job just let go of.
 *
 * Adopts a new `initial` whenever its id changes: a sheet that learns of a job
 * (an import just queued, Submit semua just pressed) hands it over here.
 */
export function useOpnameJob(
  initial: OpnameJob | null,
  { onFinished }: { onFinished?: (job: OpnameJob) => void } = {},
) {
  const [job, setJob] = useState<OpnameJob | null>(initial);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  });

  // Only a different job replaces the one being watched; a re-render handing
  // the same job back must not rewind the bar to where it was first seen.
  const initialId = initial?._id ?? null;
  const [watchedId, setWatchedId] = useState(initialId);
  if (initialId !== watchedId) {
    setWatchedId(initialId);
    setJob(initial);
  }

  const jobId = job?._id ?? null;
  const active = jobActive(job);

  useEffect(() => {
    if (!jobId || !active) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await stockOpnameService.job(jobId);
        if (cancelled) return;
        setJob(next);
        if (!jobActive(next)) finishedRef.current?.(next);
      } catch {
        // A blip in the connection: the next tick asks again.
        if (!cancelled) setJob((current) => (current ? { ...current } : current));
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, active, job]);

  /** Lanjutkan: puts a failed job back in the queue, from where it stopped. */
  const resume = useCallback(async () => {
    if (!jobId) return;
    setResuming(true);
    setError(null);
    try {
      setJob(await stockOpnameService.resumeJob(jobId));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.fullMessage : "Gagal melanjutkan proses. Coba lagi.",
      );
    } finally {
      setResuming(false);
    }
  }, [jobId]);

  return { job, setJob, resume, resuming, error };
}
