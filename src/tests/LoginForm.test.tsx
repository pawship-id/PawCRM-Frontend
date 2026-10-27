import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LoginForm } from "@/features/auth";
import {
  AuthContext,
  type AuthContextValue,
} from "@/features/auth/context/AuthProvider";
import { ApiError } from "@/services/api-error";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const signIn = jest.fn();

// Inject the auth context directly so we control signIn without standing up the
// real provider (which would call /auth/me on mount).
function withAuth(ui: ReactNode) {
  const value = {
    status: "unauthenticated",
    user: null,
    session: null,
    signIn,
    signOut: jest.fn(),
    refresh: jest.fn(),
    setUser: jest.fn(),
  } as unknown as AuthContextValue;
  return <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>;
}

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockClear();
    signIn.mockReset();
  });

  it("validates before calling signIn", async () => {
    render(withAuth(<LoginForm />));
    await userEvent.click(screen.getByRole("button", { name: /^masuk$/i }));

    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByText(/email wajib diisi/i)).toBeInTheDocument();
  });

  it("signs in and redirects on success", async () => {
    signIn.mockResolvedValueOnce(undefined);
    render(withAuth(<LoginForm redirectTo="/dashboard/profile" />));

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /^masuk$/i }));

    expect(signIn).toHaveBeenCalledWith("a@b.com", "secret1");
    expect(replace).toHaveBeenCalledWith("/dashboard/profile");
  });

  it("shows the generic error message on a 401", async () => {
    signIn.mockRejectedValueOnce(
      new ApiError("Email atau password-nya belum cocok. Coba cek lagi.", 401),
    );
    render(withAuth(<LoginForm />));

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /^masuk$/i }));

    expect(
      await screen.findByText(/email atau password-nya belum cocok/i),
    ).toBeInTheDocument();
  });

  it("toggles password visibility with the eye button", async () => {
    render(withAuth(<LoginForm />));
    const input = screen.getByLabelText(/password/i);
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(
      screen.getByRole("button", { name: /tampilkan kata sandi/i }),
    );
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(
      screen.getByRole("button", { name: /sembunyikan kata sandi/i }),
    );
    expect(input).toHaveAttribute("type", "password");
  });
});
