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
}

/** The draft a stored service starts as. Weights that do not line up are dropped. */
export function seedSteps(service: Service): StepsDraft {
  const sessions = service.sessions ?? [];
  const stored = service.sessionWeights ?? [];

  return {
    sessions: [...sessions],
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

  return {
    sessions: draft.sessions.filter((_, position) => position !== index),
    weights,
  };
}

/** A tahapan moved from one position to another — a drag, or an arrow key. */
export function moveStep(draft: StepsDraft, from: number, to: number): StepsDraft {
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
  return sessionWeightsError(draft.sessions, draft.weights);
}

/** The PATCH a valid draft becomes. Call it only when `stepsProblem` is null. */
export function stepsPatch(draft: StepsDraft): UpdateServiceInput {
  return {
    sessions: draft.sessions,
    sessionWeights: sessionWeightsPayload(draft.sessions, draft.weights),
  };
}

/** What the draft says — two drafts with one signature save the same thing. */
export function stepsSignature(draft: StepsDraft): string {
  return JSON.stringify([
    draft.sessions,
    draft.sessions.length < WEIGHTS_MIN_SESSIONS
      ? []
      : draft.sessions.map((session) => (draft.weights[session] ?? "").trim()),
  ]);
}
