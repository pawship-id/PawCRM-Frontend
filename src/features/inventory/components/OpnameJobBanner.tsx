"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Alert, JobProgressBar, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { OpnameJob } from "@/types/opnameImport";

import { jobActive } from "../hooks/useOpnameJob";

const opnameHref = (id: string) => `/dashboard/inventory/opname/${id}`;

/** "Impor ke OPN-2026-0012" / "Submit semua" — what the job is, in a few words. */
function jobTitle(job: OpnameJob): string {
  if (job.type === "opname_submit_all") return "Submit semua lembar";
  return job.opnameNumber ? `Impor file ke ${job.opnameNumber}` : "Impor file opname";
}


/**
 * WHERE A BACKGROUND JOB IS, said once in the same words wherever it shows:
 * the import dialog, the sheet it holds, and the Koreksi Stok list.
 *
 * RUNNING says the page may be left — that is the whole reason it runs in the
 * background. FAILED says why and offers Lanjutkan, which carries on from where
 * it stopped and never doubles a sheet. DONE links every sheet it made.
 */
export function OpnameJobBanner({
  job,
  onResume,
  resuming = false,
  resumeError = null,
  showLink = false,
}: {
  job: OpnameJob;
  onResume?: () => void;
  resuming?: boolean;
  resumeError?: string | null;
  /** On the list: a way to the sheet the job is about. */
  showLink?: boolean;
}) {
  const { done, total } = job.progress;
  const unit = job.type === "opname_submit_all" ? "disubmit" : "dibuat";
  const link =
    showLink && job.subjectId ? (
      <Link
        href={opnameHref(job.subjectId)}
        className="font-medium text-primary-hover hover:underline"
      >
        Buka lembar
      </Link>
    ) : null;

  if (job.status === "queued" || job.status === "running") {
    return (
      <Alert variant="info">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <Spinner /> {jobTitle(job)} sedang berjalan di background
        </p>
        <JobProgressBar done={done} total={total} label={jobTitle(job)} />
        <p className="text-sm">
          {job.status === "queued"
            ? "Menunggu giliran…"
            : `${done} dari ${total} lembar sudah ${unit}.`}{" "}
          Halaman ini boleh ditinggal — prosesnya tetap jalan. {link}
        </p>
      </Alert>
    );
  }

  if (job.status === "failed") {
    return (
      <Alert variant="error">
        <p className="font-semibold">{jobTitle(job)} berhenti di tengah jalan</p>
        <p className="text-sm">
          {job.error ?? "Alasannya tidak tercatat."} {done} dari {total} lembar
          sudah {unit}; yang sudah selesai tidak akan diulang.
        </p>
        {resumeError && <p className="text-sm">{resumeError}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {onResume && (
            <Button type="button" size="sm" onClick={onResume} disabled={resuming}>
              {resuming ? <Spinner /> : null}
              Lanjutkan
            </Button>
          )}
          {link}
        </div>
      </Alert>
    );
  }

  const sheets = job.result?.sheets ?? [];

  return (
    <Alert variant="success">
      {job.type === "opname_submit_all" ? (
        <p>
          Semua {job.result?.submitted?.length ?? total} lembar sudah disubmit.
          Selisihnya tercatat di kartu stok dan jurnal.
        </p>
      ) : (
        <>
          <p>
            Impor selesai. File dipecah jadi {sheets.length} lembar — cek
            masing-masing, lalu selesaikan satu per satu atau pakai{" "}
            <b>Submit semua</b>.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sheets.map((sheet) => (
              <li key={sheet._id}>
                <Link
                  href={opnameHref(sheet._id)}
                  className="font-medium tabular-nums text-primary-hover hover:underline"
                >
                  {sheet.opnameNumber}
                </Link>{" "}
                <span className="text-muted">({sheet.itemCount} baris)</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Alert>
  );
}

/**
 * EVERY UNFINISHED JOB OF THE TENANT, on the Koreksi Stok list — where somebody
 * who closed the dialog comes back to see how far it got. Polls only while one
 * is still moving; `onSettled` refreshes the list when one finishes, since its
 * sheets and counts just changed.
 */
export function OpnameJobsPanel({ onSettled }: { onSettled?: () => void }) {
  const [jobs, setJobs] = useState<OpnameJob[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  const anyActive = jobs.some((job) => jobActive(job));
  const activeKey = jobs
    .filter((job) => jobActive(job))
    .map((job) => `${job._id}:${job.progress.done}`)
    .join(",");

  const load = useCallback(async () => {
    try {
      const next = (await stockOpnameService.jobs()) ?? [];
      setJobs((previous) => {
        const finished = previous.some(
          (job) =>
            jobActive(job) &&
            !next.some((other) => other._id === job._id && jobActive(other)),
        );
        if (finished) settledRef.current?.();
        return next;
      });
    } catch {
      // The list still works without the panel; the next poll asks again.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!anyActive) return;
    const timer = setTimeout(() => void load(), 2000);
    return () => clearTimeout(timer);
  }, [anyActive, activeKey, load]);

  const resume = async (jobId: string) => {
    setResumingId(jobId);
    setResumeError(null);
    try {
      await stockOpnameService.resumeJob(jobId);
      await load();
    } catch (err) {
      setResumeError(
        err instanceof ApiError ? err.fullMessage : "Gagal melanjutkan proses. Coba lagi.",
      );
    } finally {
      setResumingId(null);
    }
  };

  if (jobs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => (
        <OpnameJobBanner
          key={job._id}
          job={job}
          showLink
          onResume={() => void resume(job._id)}
          resuming={resumingId === job._id}
          resumeError={resumingId === null ? resumeError : null}
        />
      ))}
    </div>
  );
}
