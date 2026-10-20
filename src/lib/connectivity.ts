/**
 * IS THE SERVER REACHABLE RIGHT NOW? (POS offline mode, 19 October 2026)
 *
 * `navigator.onLine` alone cannot answer it: a laptop on shop Wi-Fi whose
 * uplink is down reports "online" all day. So the answer is built from three
 * signals:
 *
 *   - the browser's own online/offline events (an "offline" is believed at once)
 *   - every real request the app makes (api-client reports each outcome)
 *   - a light ping while the till is open — every 15 s, 3 s timeout
 *
 * WITH HYSTERESIS, because a connection that is merely bad flickers: two
 * failures in a row switch the till to offline, two successes switch it back.
 * A till that changed mode on every dropped packet would be worse than either.
 *
 * `forced` is the cashier's own switch ("Pakai mode offline"): on a connection
 * so slow every request times out after a long wait, choosing offline outright
 * is faster than waiting for the detector to agree.
 */
import { env } from "@/utils/env";

export type ConnectivityStatus = "online" | "offline";

interface State {
  status: ConnectivityStatus;
  forced: boolean;
  lastChange: number;
}

const FAILURES_TO_GO_OFFLINE = 2;
const SUCCESSES_TO_GO_ONLINE = 2;
const PING_INTERVAL_MS = 15_000;
const PING_TIMEOUT_MS = 3_000;
const FORCED_KEY = "buloo.pos.forceOffline";

let state: State = {
  status:
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "offline"
      : "online",
  forced: readForced(),
  lastChange: Date.now(),
};
let failures = 0;
let successes = 0;
const listeners = new Set<() => void>();

function readForced(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(FORCED_KEY) === "1";
  } catch {
    return false;
  }
}

function emit(next: Partial<State>) {
  const changed =
    (next.status !== undefined && next.status !== state.status) ||
    (next.forced !== undefined && next.forced !== state.forced);
  if (!changed) return;
  state = { ...state, ...next, lastChange: Date.now() };
  listeners.forEach((listener) => listener());
}

/** A request reached the server and got an answer — any answer. */
export function reportReachable(): void {
  failures = 0;
  successes += 1;
  if (state.status === "offline" && successes >= SUCCESSES_TO_GO_ONLINE) {
    emit({ status: "online" });
  }
}

/** A request never got an answer: no network, or it timed out. */
export function reportUnreachable(): void {
  successes = 0;
  failures += 1;
  if (state.status === "online" && failures >= FAILURES_TO_GO_OFFLINE) {
    emit({ status: "offline" });
  }
}

export function setForcedOffline(forced: boolean): void {
  try {
    if (forced) localStorage.setItem(FORCED_KEY, "1");
    else localStorage.removeItem(FORCED_KEY);
  } catch {
    // A preference that cannot be remembered still applies for this session.
  }
  emit({ forced });
}

/** What the till should behave as: offline when detected OR chosen. */
export function isOfflineMode(): boolean {
  return state.forced || state.status === "offline";
}

export function connectivitySnapshot(): State {
  return state;
}

export type ConnectivityState = State;

/**
 * For `useConnectivity` (hooks/useConnectivity.ts). The hook lives there, not
 * here: api-client imports this file, and Server Components import api-client.
 */
export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One ping. Exported for the "Cek koneksi" button and for tests. */
export async function ping(): Promise<boolean> {
  // No Fetch API (an old runtime, a test environment): nothing to measure with.
  if (typeof fetch !== "function") return state.status === "online";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.apiBaseUrl}/health`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    // Any HTTP answer means the server is there; a 503 from a sick database
    // still means requests arrive.
    void response.body?.cancel();
    reportReachable();
    return true;
  } catch {
    reportUnreachable();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let started = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const onOnline = () => {
  // The browser says the link is back; let two pings confirm the server is.
  void ping().then(() => ping());
};
const onOffline = () => {
  failures = FAILURES_TO_GO_OFFLINE;
  emit({ status: "offline" });
};

/**
 * Starts watching while a till is on screen; returns the stop. Counted, so two
 * mounted consumers do not run two ping loops.
 */
export function startConnectivityWatch(): () => void {
  started += 1;
  if (started === 1 && typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    timer = setInterval(() => {
      // Hidden tabs do not ping — a till in the background has nobody waiting.
      if (typeof document !== "undefined" && document.hidden) return;
      void ping();
    }, PING_INTERVAL_MS);
    void ping();
  }

  return () => {
    started -= 1;
    if (started === 0 && typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

/** Tests only. */
export function __resetConnectivity(status: ConnectivityStatus = "online"): void {
  state = { status, forced: false, lastChange: Date.now() };
  failures = 0;
  successes = 0;
  try {
    localStorage.removeItem(FORCED_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}
