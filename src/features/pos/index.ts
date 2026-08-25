/**
 * Public surface of the POS feature (Kasir).
 *
 * The route imports `PosScreen` and nothing else — the till is one screen, and
 * every dialog and panel inside it exists only to serve that screen. A component
 * here becoming useful to another feature is the signal to export it, not a
 * reason to export it now.
 */
export { PosScreen } from "./components/PosScreen";
