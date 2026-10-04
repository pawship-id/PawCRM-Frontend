import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { SignOutEverywhereForm } from "@/features/profile/components/SignOutEverywhereForm";
import { ApiError } from "@/services/api-error";
import type { User } from "@/types/api";

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: (...args: unknown[]) => replace(...args) }),
}));

const signedInUser = {
  fullName: "Jess",
  email: "jess@gmail.com",
} as User;

/**
 * The profile card that revokes every session.
 *
 * The tests are all about the CONFIRM STEP and what happens either side of it:
 * pressing the button must not revoke anything, confirming must revoke and
 * leave, and a failure must leave the user exactly where they were rather than
 * signing them out of a session that is still alive everywhere else.
 */
async function pressButton() {
  await userEvent.click(
    screen.getByRole("button", { name: /Keluar dari semua perangkat/ }),
  );
}

beforeEach(() => replace.mockClear());

describe("SignOutEverywhereForm", () => {
  it("does not revoke anything until the confirm is answered", async () => {
    const signOutEverywhere = jest.fn();
    renderWithAuth(<SignOutEverywhereForm />, {
      user: signedInUser,
      signOutEverywhere,
    });

    await pressButton();

    expect(
      screen.getByRole("dialog", { name: "Keluar dari semua perangkat" }),
    ).toBeInTheDocument();
    expect(signOutEverywhere).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("revokes and leaves for /login once confirmed", async () => {
    const signOutEverywhere = jest.fn().mockResolvedValue(3);
    renderWithAuth(<SignOutEverywhereForm />, {
      user: signedInUser,
      signOutEverywhere,
    });

    await pressButton();
    await userEvent.click(
      screen.getByRole("button", { name: "Ya, keluarkan semua" }),
    );

    await waitFor(() => expect(signOutEverywhere).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("keeps the dialog open and says why when the call fails", async () => {
    const signOutEverywhere = jest
      .fn()
      .mockRejectedValue(new ApiError("Sesi tidak bisa diputus.", 500));
    renderWithAuth(<SignOutEverywhereForm />, {
      user: signedInUser,
      signOutEverywhere,
    });

    await pressButton();
    await userEvent.click(
      screen.getByRole("button", { name: "Ya, keluarkan semua" }),
    );

    expect(
      await screen.findByText("Sesi tidak bisa diputus."),
    ).toBeInTheDocument();
    // Still signed in here — the other devices were not revoked either.
    expect(replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Ya, keluarkan semua" }),
    ).toBeEnabled();
  });

  it("cancelling closes the dialog and revokes nothing", async () => {
    const signOutEverywhere = jest.fn();
    renderWithAuth(<SignOutEverywhereForm />, {
      user: signedInUser,
      signOutEverywhere,
    });

    await pressButton();
    await userEvent.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });
});
