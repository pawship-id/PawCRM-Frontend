import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Swal from "sweetalert2";

import { BranchCreateForm } from "@/features/branches";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// The success popup is a SweetAlert2 modal; mock the library so it resolves
// immediately and the redirect-after-success assertion does not wait on a real
// dialog.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

/** The options of the most recent toast. */
const fired = () =>
  (Swal.fire as jest.Mock).mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe("BranchCreateForm", () => {
  beforeEach(() => {
    push.mockClear();
    (Swal.fire as jest.Mock).mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(branchService, "create");
    render(<BranchCreateForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/nama cabang wajib diisi/i)).toBeInTheDocument();
  });

  it("creates the branch and redirects on success", async () => {
    const create = jest
      .spyOn(branchService, "create")
      .mockResolvedValue({} as never);
    render(<BranchCreateForm />);

    await userEvent.type(screen.getByLabelText(/branch name/i), "Bandung");
    await userEvent.type(screen.getByLabelText(/phone/i), "022-555-9000");
    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bandung",
        phone: "022-555-9000",
        address: null,
        isActive: true,
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/branches");
  });

  it("sends a pinned branch with its coordinates parsed to numbers", async () => {
    const create = jest
      .spyOn(branchService, "create")
      .mockResolvedValue({} as never);
    render(<BranchCreateForm />);

    await userEvent.type(screen.getByLabelText(/branch name/i), "Kemang");
    await userEvent.click(screen.getByLabelText(/latitude/i));
    await userEvent.paste("-6.260712, 106.813377");
    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Kemang",
        location: { lat: -6.260712, lng: 106.813377 },
      }),
    );
  });

  it("sends location: null when no pin was entered", async () => {
    const create = jest
      .spyOn(branchService, "create")
      .mockResolvedValue({} as never);
    render(<BranchCreateForm />);

    await userEvent.type(screen.getByLabelText(/branch name/i), "Bandung");
    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ location: null }),
    );
  });

  it("blocks the request when only one coordinate is filled in", async () => {
    // Half a pair points at the Greenwich meridian. The backend refuses it too;
    // catching it here saves the round trip.
    const create = jest.spyOn(branchService, "create");
    render(<BranchCreateForm />);

    await userEvent.type(screen.getByLabelText(/branch name/i), "Bandung");
    await userEvent.type(screen.getByLabelText(/latitude/i), "-6.260712");
    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(
      screen.getByText(/latitude and longitude must be filled in together/i),
    ).toBeInTheDocument();
  });

  it("surfaces a duplicate-name conflict as an alert", async () => {
    jest
      .spyOn(branchService, "create")
      .mockRejectedValue(new ApiError("Branch name already in use", 409));
    render(<BranchCreateForm />);

    await userEvent.type(screen.getByLabelText(/branch name/i), "Bandung");
    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    /*
      A TOAST, NOT AN INLINE ALERT — a deliberate departure from ui-rules §9,
      asked for directly. This form scrolls: a 409 fires while the cursor is in a
      field halfway down the page, and an Alert pinned to the top of the form is
      a message the person who caused it never sees.
    */
    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    expect(fired()).toMatchObject({
      icon: "error",
      title: "Branch name already in use",
      position: "top-end",
      // 8s rather than the 3s default: a server refusal carries an instruction,
      // and three seconds is not long enough to read one and act on it.
      timer: 8000,
    });
    expect(push).not.toHaveBeenCalled();
  });

  /**
   * The branch CODE — the segment that goes inside every invoice number this
   * branch issues, `INV/CBS/2608/0001`.
   *
   * It is optional here and refused later, deliberately: a branch registered
   * before anybody has decided on codes must still be savable, and the INVOICE
   * is what refuses to be issued against a branch with none — a refusal that
   * names the branch and the screen to fix it, rather than a validation error on
   * a form nobody has open.
   */
  describe("kode cabang", () => {
    it("sends the code with the branch", async () => {
      const create = jest
        .spyOn(branchService, "create")
        .mockResolvedValue({} as never);
      render(<BranchCreateForm />);

      await userEvent.type(screen.getByLabelText(/branch name/i), "Selatan");
      await userEvent.type(screen.getByLabelText(/kode cabang/i), "CBS");
      await userEvent.click(
        screen.getByRole("button", { name: /create branch/i }),
      );

      expect(create.mock.calls[0][0]).toMatchObject({ code: "CBS" });
    });

    /*
      UPPERCASED AS IT IS TYPED, not silently on save. The server uppercases too,
      so both spellings would be stored identically either way — but a field that
      changes its own value after the user has looked away reads as a bug, and
      the person checking their invoice numbers should see the exact string that
      will be printed.
    */
    it("uppercases while typing", async () => {
      jest.spyOn(branchService, "create").mockResolvedValue({} as never);
      render(<BranchCreateForm />);

      const field = screen.getByLabelText(/kode cabang/i);
      await userEvent.type(field, "cbs");

      expect(field).toHaveValue("CBS");
    });

    it("sends null rather than an empty string when left blank", async () => {
      // `""` and `null` both clear it server-side, but null is what the API
      // documents as the clearing value, and sending "" would make a create with
      // no code look like a create that cleared one.
      const create = jest
        .spyOn(branchService, "create")
        .mockResolvedValue({} as never);
      render(<BranchCreateForm />);

      await userEvent.type(screen.getByLabelText(/branch name/i), "Selatan");
      await userEvent.click(
        screen.getByRole("button", { name: /create branch/i }),
      );

      expect(create.mock.calls[0][0]).toMatchObject({ code: null });
    });

    it("refuses a code with a character that cannot go in a number", async () => {
      const create = jest.spyOn(branchService, "create");
      render(<BranchCreateForm />);

      await userEvent.type(screen.getByLabelText(/branch name/i), "Selatan");
      // The slash is what separates the segments of an invoice number, so a code
      // containing one would produce `INV/CB/S/2608/0001` — five segments for a
      // format that has four.
      await userEvent.type(screen.getByLabelText(/kode cabang/i), "CB/S");
      await userEvent.click(
        screen.getByRole("button", { name: /create branch/i }),
      );

      expect(create).not.toHaveBeenCalled();
      expect(screen.getByText(/hanya boleh huruf A-Z/i)).toBeInTheDocument();
    });

    it("refuses a one-character code", async () => {
      const create = jest.spyOn(branchService, "create");
      render(<BranchCreateForm />);

      await userEvent.type(screen.getByLabelText(/branch name/i), "Selatan");
      await userEvent.type(screen.getByLabelText(/kode cabang/i), "C");
      await userEvent.click(
        screen.getByRole("button", { name: /create branch/i }),
      );

      expect(create).not.toHaveBeenCalled();
      expect(screen.getByText(/minimal 2 karakter/i)).toBeInTheDocument();
    });
  });
});
