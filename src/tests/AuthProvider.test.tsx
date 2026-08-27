import { useContext } from "react";
import { render, screen, waitFor } from "@testing-library/react";

import {
  AuthContext,
  AuthProvider,
} from "@/features/auth/context/AuthProvider";
import { authService } from "@/services/auth.service";

jest.mock("@/services/auth.service");

const pathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

const mockedAuth = authService as jest.Mocked<typeof authService>;

/** Prints whatever the provider is telling the app about the session. */
function Probe() {
  const auth = useContext(AuthContext);
  return <span>status: {auth?.status}</span>;
}

beforeEach(() => {
  mockedAuth.me.mockResolvedValue({
    user: null,
    session: null,
    permissions: [],
    isSuperAdmin: false,
  } as never);
});

/**
 * Who the provider asks about, and when.
 *
 * IT SITS IN THE ROOT LAYOUT, so it wraps every page in the app — the dashboard,
 * the login screen, and the receipt page a customer opens from a WhatsApp
 * message. The last of those has no account, and that is what these are about.
 */
describe("AuthProvider — hydrating the session", () => {
  it("asks /me on an ordinary page", async () => {
    pathname.mockReturnValue("/dashboard/pos");

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(mockedAuth.me).toHaveBeenCalled());
  });

  /*
    THE WHOLE POINT. Without this, every receipt link anybody ever opens fires a
    `GET /auth/me` that can only 401 — a wasted round trip on a customer's phone,
    and a 401 in the log for every receipt read.
  */
  it("asks nobody on a public receipt page", async () => {
    pathname.mockReturnValue("/struk/Gv7xQ2pLmN4kRt8wZa1bYQ");

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(/status: unauthenticated/),
    ).toBeInTheDocument();
    expect(mockedAuth.me).not.toHaveBeenCalled();
  });

  /*
    "unauthenticated", not "loading". A shell that waits forever for a call that
    is never made is worse than one that says plainly that nobody is signed in.
  */
  it("does not leave the shell waiting forever", async () => {
    pathname.mockReturnValue("/struk/anything");

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.queryByText(/status: loading/)).not.toBeInTheDocument();
  });

  /*
    A PREFIX, NOT A SUBSTRING. `/strukturku` is somebody else's route and must
    still hydrate — matching on `startsWith("/struk")` alone would silently sign
    out every page whose path happens to begin with those five letters.
  */
  it("does not mistake a route that merely starts the same way", async () => {
    pathname.mockReturnValue("/strukturku");

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(mockedAuth.me).toHaveBeenCalled());
  });
});
