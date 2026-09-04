import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { BusinessLinesScreen } from "@/features/accounting";
import { businessLineService } from "@/services/businessLine.service";
import type { BusinessLine } from "@/services/businessLine.service";
import { ApiError } from "@/services/api-error";
import type { PageResult } from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// The mutations toast on success; mock the library so no real dialog is built.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

/**
 * Keuangan → Lini Bisnis.
 *
 * WHAT IS WORTH ASSERTING, and it is not the CRUD plumbing — a dialog that posts
 * a body is the same shape as five other screens'. What is pinned here is what
 * this screen exists for, and each is a real bug if it breaks:
 *
 *   - the colour goes out with every create, because the API requires one and an
 *     empty field would be a 400 the user never asked for;
 *   - the delete guard's refusal reaches the user verbatim, since the 409 names
 *     how many accounts or products are in the way and that count is the only
 *     thing that says what to do next;
 *   - an empty tenant is pointed at the next step rather than left with a blank
 *     table, because the line is useless until it is set on an account.
 */

const GROOMING: BusinessLine = {
  _id: "bl-grooming",
  name: "Grooming",
  color: "#1A2B4C",
};

function linePage(items: BusinessLine[]): PageResult<BusinessLine> {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

describe("BusinessLinesScreen", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lists each line with the colour its reports are drawn in", async () => {
    jest
      .spyOn(businessLineService, "list")
      .mockResolvedValue(linePage([GROOMING]));

    renderWithAuth(<BusinessLinesScreen />);

    expect(await screen.findByText("Grooming")).toBeInTheDocument();
    // The hex is text, not just a swatch: colour alone is never the whole answer
    // (§1.3), and it is the value somebody matches against a palette.
    expect(screen.getByText("#1A2B4C")).toBeInTheDocument();
  });

  it("points at the next step when the tenant has no lines yet", async () => {
    jest.spyOn(businessLineService, "list").mockResolvedValue(linePage([]));

    renderWithAuth(<BusinessLinesScreen />);

    expect(
      await screen.findByText("Belum ada lini bisnis."),
    ).toBeInTheDocument();
    // A line nobody has put on an account does nothing at all, so the empty
    // state names the screen that does the mapping.
    expect(
      screen.getByText(/lalu pasang ke akunnya di Daftar Akun/),
    ).toBeInTheDocument();
  });

  it("creates a line with a name and a colour", async () => {
    jest.spyOn(businessLineService, "list").mockResolvedValue(linePage([]));
    const create = jest
      .spyOn(businessLineService, "create")
      .mockResolvedValue(GROOMING);

    renderWithAuth(<BusinessLinesScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Lini bisnis baru/ }),
    );
    await userEvent.type(
      await screen.findByLabelText(/Nama lini bisnis/),
      "Grooming",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Buat lini bisnis" }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: "Grooming",
        color: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
      }),
    );
  });

  it("refuses to send a rename that changed nothing", async () => {
    jest
      .spyOn(businessLineService, "list")
      .mockResolvedValue(linePage([GROOMING]));
    const update = jest.spyOn(businessLineService, "update");

    renderWithAuth(<BusinessLinesScreen />);

    await userEvent.click(await screen.findByRole("button", { name: /Ubah/ }));
    await screen.findByLabelText(/Nama lini bisnis/);
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    // An empty PATCH body is a 400 (`.min(1)`), so the dialog closes instead of
    // asking the server to do nothing.
    expect(update).not.toHaveBeenCalled();
  });

  /**
   * The refusal is the NORMAL outcome for a line anybody uses, and the server's
   * message is the only thing carrying the count.
   */
  it("shows the delete guard's own message when something still uses the line", async () => {
    jest
      .spyOn(businessLineService, "list")
      .mockResolvedValue(linePage([GROOMING]));
    jest
      .spyOn(businessLineService, "remove")
      .mockRejectedValue(
        new ApiError(
          "Business line is set on 3 account(s); clear it on those accounts first",
          409,
        ),
      );

    renderWithAuth(<BusinessLinesScreen />);

    await userEvent.click(await screen.findByRole("button", { name: /Hapus/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Hapus" }));

    expect(await screen.findByText(/3 account/)).toBeInTheDocument();
  });
});
