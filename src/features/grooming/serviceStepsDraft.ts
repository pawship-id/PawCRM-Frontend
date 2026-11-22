import {
  evenSessionWeights,
  sessionWeightsError,
  sessionWeightsPayload,
  WEIGHTS_MIN_SESSIONS,
} from "@/features/services";
import type { Service, UpdateServiceInput } from "@/types/api";

/**
 * The Tahapan & bobot komisi card's DRAFT — the tahapan of one service and each
 * one's share of its commission, changed in place on the detail page before
 * somebody presses Simpan (decided 14 September 2026).
 *
 * THE SAME RULES AS THE SERVICE FORM, borrowed rather than restated
 * (`sessionWeightsError` / `sessionWeightsPayload`): every weight box empty
 * splits evenly; otherwise every box is a whole 0–100 and they add up to 100.
 * Weights are KEYED BY THE TAHAPAN'S NAME, which is why a name may appear once —
 * so moving a row carries its weight with it.
 */

/** `MAX_SESSIONS` and `SESSION_MAX_LENGTH` in service.model.js. */
export const MAX_SESSIONS = 50;
export const SESSION_MAX_LENGTH = 120;

export interface StepsDraft {
  sessions: string[];
  /** Tahapan name → per cent as typed. All empty = split evenly. */
  weights: Record<string, string>;
  /**
   * HOTEL ONLY (21 November 2026): tahapan name → default clock time "HH:mm",
   * or "" for none. Keyed by name like the weights, so a moved row keeps it.
   */
  times: Record<string, string>;
}

/** "HH:mm", 00:00–23:59 — `SESSION_TIME_PATTERN` in service.model.js. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The draft a stored service starts as. Weights that do not line up are dropped. */
export function seedSteps(
  service: Pick<Service, "sessions"> &
    Partial<Pick<Service, "sessionWeights" | "sessionTimes">>,
): StepsDraft {
  const sessions = service.sessions ?? [];
  const stored = service.sessionWeights ?? [];
  const times = service.sessionTimes ?? [];

  return {
    sessions: [...sessions],
    times:
      times.length === sessions.length
        ? Object.fromEntries(
            sessions.map((session, index) => [session, times[index] ?? ""]),
          )
        : {},
    weights:
      stored.length > 0 && stored.length === sessions.length
        ? Object.fromEntries(
            sessions.map((session, index) => [session, String(stored[index])]),
          )
        : {},
  };
}

/** Whether the service already has this tahapan — "mandi" is "Mandi". */
export function hasStep(draft: StepsDraft, name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return draft.sessions.some((session) => session.toLowerCase() === wanted);
}

/**
 * A tahapan added at the end, with an empty weight. A blank name, a repeat, or
 * a list already at the cap comes back unchanged.
 *
 * `name` is stored as given (trimmed) — pass the LINE LIST'S spelling, which is
 * what the picker hands over (`step.name`), since the server stores that one.
 */
export function addStep(draft: StepsDraft, name: string): StepsDraft {
  const trimmed = name.trim().slice(0, SESSION_MAX_LENGTH);
  if (
    trimmed === "" ||
    hasStep(draft, trimmed) ||
    draft.sessions.length >= MAX_SESSIONS
  ) {
    return draft;
  }

  return { ...draft, sessions: [...draft.sessions, trimmed] };
}

/** A tahapan removed, and its weight with it; the others keep theirs. */
export function removeStep(draft: StepsDraft, index: number): StepsDraft {
  const name = draft.sessions[index];
  if (name === undefined) return draft;

  const weights = { ...draft.weights };
  delete weights[name];
  const times = { ...draft.times };
  delete times[name];

  return {
    sessions: draft.sessions.filter((_, position) => position !== index),
    weights,
    times,
  };
}

/** A tahapan moved from one position to another — a drag, or an arrow key. */
export function moveStep(
  draft: StepsDraft,
  from: number,
  to: number,
): StepsDraft {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= draft.sessions.length ||
    to >= draft.sessions.length
  ) {
    return draft;
  }

  const sessions = [...draft.sessions];
  const [moved] = sessions.splice(from, 1);
  sessions.splice(to, 0, moved);

  return { ...draft, sessions };
}

export function setWeight(
  draft: StepsDraft,
  name: string,
  text: string,
): StepsDraft {
  return { ...draft, weights: { ...draft.weights, [name]: text } };
}

/** A tahapan's default clock time — "" clears it. Hotel only. */
export function setTime(
  draft: StepsDraft,
  name: string,
  time: string,
): StepsDraft {
  return { ...draft, times: { ...draft.times, [name]: time } };
}

/** "Bagi rata": whole per cents that add up to exactly 100 — `[34, 33, 33]`. */
export function splitEvenly(draft: StepsDraft): StepsDraft {
  const even = evenSessionWeights(draft.sessions.length);

  return {
    ...draft,
    weights: Object.fromEntries(
      draft.sessions.map((session, index) => [session, String(even[index])]),
    ),
  };
}

/**
 * The card's badge figure. One tahapan takes it all, so 100. Null when there is
 * nothing to add up: no tahapan, or every box empty — split evenly.
 */
export function stepsTotal(draft: StepsDraft): number | null {
  if (draft.sessions.length === 0) return null;
  if (draft.sessions.length < WEIGHTS_MIN_SESSIONS) return 100;

  const typed = draft.sessions.map((session) =>
    (draft.weights[session] ?? "").trim(),
  );
  if (typed.every((value) => value === "")) return null;

  return typed.reduce(
    (sum, value) => sum + (/^\d+$/.test(value) ? Number(value) : 0),
    0,
  );
}

/** Why the draft cannot be saved yet, as a sentence — or null. */
export function stepsProblem(draft: StepsDraft): string | null {
  const bad = draft.sessions.find((session) => {
    const time = (draft.times[session] ?? "").trim();
    return time !== "" && !TIME_PATTERN.test(time);
  });
  if (bad)
    return `Jam ${bad} belum benar — tulis seperti 08:00, atau kosongkan.`;
  return sessionWeightsError(draft.sessions, draft.weights);
}

/** Times by position, or `[]` when no tahapan has one — what the API stores. */
export function sessionTimesPayload(draft: StepsDraft): (string | null)[] {
  const times = draft.sessions.map(
    (session) => (draft.times[session] ?? "").trim() || null,
  );
  return times.every((time) => time === null) ? [] : times;
}

/** The PATCH a valid draft becomes. Call it only when `stepsProblem` is null. */
export function stepsPatch(
  draft: StepsDraft,
  { withTimes = false } = {},
): UpdateServiceInput {
  return {
    sessions: draft.sessions,
    sessionWeights: sessionWeightsPayload(draft.sessions, draft.weights),
    ...(withTimes ? { sessionTimes: sessionTimesPayload(draft) } : {}),
  };
}

/** What the draft says — two drafts with one signature save the same thing. */
export function stepsSignature(draft: StepsDraft): string {
  return JSON.stringify([
    draft.sessions,
    draft.sessions.length < WEIGHTS_MIN_SESSIONS
      ? []
      : draft.sessions.map((session) => (draft.weights[session] ?? "").trim()),
    sessionTimesPayload(draft),
  ]);
}
