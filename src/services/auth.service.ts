import { apiClient } from "./api-client";
import type {
  LoginPayload,
  MePayload,
  MessagePayload,
} from "@/types/api";

/**
 * Authentication domain calls against /api/auth.
 *
 * Same shape as health.service.ts: each method maps one typed domain call onto
 * an apiClient request and nothing else. The session lives in an httpOnly
 * cookie the browser sends automatically (apiClient uses credentials:"include"),
 * so no token is passed or stored here.
 */
export const authService = {
  /** POST /auth/login — sets the session cookie, returns the user + session. */
  login: (email: string, password: string) =>
    apiClient.post<LoginPayload>("/auth/login", { email, password }),

  /** GET /auth/me — the current user; rejects with a 401 ApiError if signed out. */
  me: () => apiClient.get<MePayload>("/auth/me"),

  /** POST /auth/logout — ends the current session and clears the cookie. */
  logout: () => apiClient.post<{ revoked: boolean }>("/auth/logout"),

  /**
   * POST /auth/forgot-password — always resolves with a generic message,
   * whether or not the address has an account (no enumeration).
   */
  forgotPassword: (email: string) =>
    apiClient.post<MessagePayload>("/auth/forgot-password", { email }),

  /** POST /auth/reset-password — exchanges a reset token for a new password. */
  resetPassword: (token: string, newPassword: string) =>
    apiClient.post<MessagePayload>("/auth/reset-password", {
      token,
      newPassword,
    }),
};
