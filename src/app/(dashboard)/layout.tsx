import type { ReactNode } from "react";
import { DashboardShell } from "@/features/auth";

/**
 * Frame for every authenticated route. AuthProvider already lives at the root,
 * so the shell only needs to consume it — gating render on the /me verdict and
 * drawing the app chrome.
 */
export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
