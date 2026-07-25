import { redirect } from "next/navigation";

/**
 * The app has no marketing landing yet — send visitors straight to sign in.
 * An already-authenticated user hitting /login is bounced to the dashboard by
 * proxy.ts, so this single redirect covers both states.
 */
export default function Home() {
  redirect("/login");
}
