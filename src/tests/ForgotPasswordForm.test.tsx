import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ForgotPasswordForm } from "@/features/auth";
import { authService } from "@/services/auth.service";

describe("ForgotPasswordForm", () => {
  let forgot: jest.SpyInstance;

  beforeEach(() => {
    forgot = jest.spyOn(authService, "forgotPassword");
  });

  afterEach(() => jest.restoreAllMocks());

  it("shows the generic confirmation returned by the backend", async () => {
    forgot.mockResolvedValueOnce({
      message: "If an account exists, a link is on its way.",
    });
    render(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.click(
      screen.getByRole("button", { name: /send reset link/i }),
    );

    expect(forgot).toHaveBeenCalledWith("a@b.com");
    expect(
      await screen.findByText(/a link is on its way/i),
    ).toBeInTheDocument();
  });

  it("does not submit an invalid email", async () => {
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "bad");
    await userEvent.click(
      screen.getByRole("button", { name: /send reset link/i }),
    );

    expect(forgot).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });
});
