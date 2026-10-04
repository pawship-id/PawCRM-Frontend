import { act, renderHook, waitFor } from "@testing-library/react";

import { usePosCart } from "@/features/pos/hooks/usePosCart";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type { PosTransaction, UpdateCartInput } from "@/types/api";

jest.mock("@/services/pos.service");

const mockedPos = posService as jest.Mocked<typeof posService>;

/**
 * WHICH 409 IS A REQUEST FOR APPROVAL, AND WHICH IS JUST A FAILURE.
 *
 * A discount above the cashier's limit is refused with 409 and answered by
 * opening an approver picker and retrying the identical patch. Every OTHER 409
 * is a failure and belongs in the error banner.
 *
 * THE BUG THIS EXISTS FOR reached a real till. The test used to be "409 AND the
 * patch touches cartDiscount or items" — and `items` is on nearly every cart
 * write. A duplicate-key error while raising a booking draft came back 409 on an
 * items patch, matched, and put "Duplicate value for 'tenantId, bookingNumber'"
 * inside a dialog headed "Diskon perlu persetujuan", on a basket carrying no
 * discount at all. Nothing covered this path, which is why it shipped.
 *
 * The server now NAMES `approvedBy` — the field a caller must fill in to get
 * past the refusal — and that is what is matched.
 */
const cart = { _id: "cart-1", items: [] } as unknown as PosTransaction;

const ADD_SERVICE: UpdateCartInput = {
  items: [{ kind: "service", refId: "svc-1", qty: "1" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedPos.createCart.mockResolvedValue(cart);
  mockedPos.updateCart.mockResolvedValue(cart);
});

/** Runs one cart write and returns the hook. */
async function write(input: UpdateCartInput = ADD_SERVICE) {
  const hook = renderHook(() => usePosCart());
  await act(async () => {
    await hook.result.current.patch(input);
  });
  return hook;
}

describe("a discount that needs approving", () => {
  beforeEach(() => {
    mockedPos.updateCart.mockRejectedValue(
      new ApiError("This discount needs approval", 409, {
        reason: "Above 10% somebody must approve it",
        details: [{ field: "approvedBy", message: "Above 10% needs an approver" }],
      }),
    );
  });

  it("holds the patch so the dialog can retry the identical one", async () => {
    const { result } = await write({
      cartDiscount: { mode: "percent", value: "50" },
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());
    expect(result.current.pendingApproval?.patch).toEqual({
      cartDiscount: { mode: "percent", value: "50" },
    });
  });

  /* The banner would say the same thing twice, in the wrong place. */
  it("does not also raise it as an error", async () => {
    const { result } = await write({
      cartDiscount: { mode: "percent", value: "50" },
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());
    expect(result.current.error).toBeNull();
  });
});

describe("a 409 that is NOT about a discount", () => {
  beforeEach(() => {
    // What the duplicate booking-number index actually produced.
    mockedPos.updateCart.mockRejectedValue(
      new ApiError("Duplicate value for 'tenantId, bookingNumber'", 409),
    );
  });

  it("opens no approval dialog on a patch carrying no discount", async () => {
    const { result } = await write();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.pendingApproval).toBeNull();
  });

  it("says what actually went wrong", async () => {
    const { result } = await write();

    await waitFor(() =>
      expect(result.current.error).toBe(
        "Duplicate value for 'tenantId, bookingNumber'",
      ),
    );
  });

  /*
    NOT EVEN WHEN THE PATCH CARRIES A DISCOUNT. A basket can be refused for a
    reason that has nothing to do with the discount on it, and matching on the
    patch's shape would misroute exactly that case.
  */
  it("opens no approval dialog even on a patch that does carry one", async () => {
    const { result } = await write({
      cartDiscount: { mode: "percent", value: "5" },
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.pendingApproval).toBeNull();
  });
});

describe("failures that are not 409 at all", () => {
  it("reports a 500 as an error, never as an approval request", async () => {
    mockedPos.updateCart.mockRejectedValue(
      new ApiError("Internal server error", 500),
    );

    const { result } = await write();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.pendingApproval).toBeNull();
  });
});

/**
 * ─── A CART WRITE SAYS WHETHER IT LANDED ────────────────────────────────────
 *
 * THE BUG THIS EXISTS FOR reached a real till too. `send` put every refusal in
 * `error` and resolved anyway, so the screen's
 * `void cart.addItem(tile).then(() => swalToast("… ditambahkan"))` announced a
 * success it had never checked: a cashier selling Bruno a membership saw
 * "Gratis Grooming Lengkap (VIP) untuk Bruno ditambahkan" over a basket holding
 * nothing but the refusal that stopped it.
 */
describe("what a cart write reports back", () => {
  it("answers true when the server took it", async () => {
    const hook = renderHook(() => usePosCart());
    let landed: boolean | undefined;

    await act(async () => {
      landed = await hook.result.current.patch(ADD_SERVICE);
    });

    expect(landed).toBe(true);
  });

  it("answers false when the server refused it, so no toast is owed", async () => {
    mockedPos.updateCart.mockRejectedValue(
      new ApiError("Service not found", 400, {
        details: [{ field: "refId", message: "This service is no longer available" }],
      }),
    );

    const hook = renderHook(() => usePosCart());
    let landed: boolean | undefined;

    await act(async () => {
      landed = await hook.result.current.patch(ADD_SERVICE);
    });

    expect(landed).toBe(false);
    await waitFor(() => expect(hook.result.current.error).not.toBeNull());
  });

  /* A held patch wrote nothing either — the dialog carries it, not a toast. */
  it("answers false when the patch is held for an approver", async () => {
    mockedPos.updateCart.mockRejectedValue(
      new ApiError("This discount needs approval", 409, {
        details: [{ field: "approvedBy", message: "Above 10% needs an approver" }],
      }),
    );

    const hook = renderHook(() => usePosCart());
    let landed: boolean | undefined;

    await act(async () => {
      landed = await hook.result.current.patch({
        cartDiscount: { mode: "percent", value: "50" },
      });
    });

    expect(landed).toBe(false);
  });
});

/**
 * ─── A MEMBERSHIP PACKAGE IS NOT A SERVICE ──────────────────────────────────
 *
 * The till asks whose animal a package is for with the SAME dialog a service
 * uses, and that is where this went wrong: every answer went to `addServices`,
 * which stamps `kind: "service"` on what it is handed. A package's id was then
 * looked up in the service catalogue and came back "Service not found" — with a
 * success toast over it.
 */
describe("selling a membership package", () => {
  it("sends it as a membership line, naming the animal it is for", async () => {
    const hook = renderHook(() => usePosCart());

    await act(async () => {
      await hook.result.current.addMembership("plan-1", "pet-1");
    });

    expect(mockedPos.updateCart).toHaveBeenCalledWith("cart-1", {
      items: [
        { kind: "membership", refId: "plan-1", petId: "pet-1", qty: "1" },
      ],
    });
  });
});
