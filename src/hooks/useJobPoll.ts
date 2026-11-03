"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/services/api-error";

/** Often enough that a bar visibly moves, rarely enough to be no load at all. */
const POLL_MS = 1500;

/** The part of a background job every screen reads. */
export interface PolledJob {
  _id: string;
  status: "queued" | "running" | "done" | "failed";
}

/** Still to finish: the bar moves. */
export function jobActive(job: PolledJob | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

/**
 * ONE BACKGROUND JOB, WATCHED — any module's (opname, bulk update). Polls
 * `fetchJob` while it is queued or running and stops on its own once it is done
 * or failed; `onFinished` hears about that once, which is where a screen
 * reloads what the job just changed.
 *
 * Adopts a new `initial` whenever its id changes, so a screen that learns of a
 * job (just queued, or found on arrival) hands it over here.
 */
export function useJobPoll<Job extends PolledJob>(
  initial: Job | null,
  {
    fetchJob,
    resumeJob,
    onFinished,
  }: {
    fetchJob: (id: string) => Promise<Job>;
    resumeJob: (id: string) => Promise<Job>;
    onFinished?: (job: Job) => void;
  },
) {
  const [job, setJob] = useState<Job | null>(initial);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbacks = useRef({ fetchJob, resumeJob, onFinished });
  useEffect(() => {
    callbacks.current = { fetchJob, resumeJob, onFinished };
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
        const next = await callbacks.current.fetchJob(jobId);
        if (cancelled) return;
        setJob(next);
        if (!jobActive(next)) callbacks.current.onFinished?.(next);
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
      setJob(await callbacks.current.resumeJob(jobId));
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
