"use client";

import { useContext } from "react";
import { AuthContext } from "../context/AuthProvider";
import type { AuthContextValue } from "../context/AuthProvider";

/** Access the auth context. Throws if used outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
