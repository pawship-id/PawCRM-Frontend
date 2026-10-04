import { redirect } from "next/navigation";

import BookingPetWorkRedirect from "@/app/(dashboard)/dashboard/booking/[id]/hewan/[petId]/page";

jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

/**
 * `/dashboard/booking/:id/hewan/:petId` WAS ONE ANIMAL'S WORK INSIDE A VISIT.
 *
 * A booking is one animal now, so that page and the booking's own are the same
 * page. The old address is kept alive for bookmarks and shared links, and lands
 * on the booking — never on a blank page.
 */
describe("the old per-animal booking address", () => {
  it("redirects to the booking's own page", async () => {
    await BookingPetWorkRedirect({
      params: Promise.resolve({ id: "bk-1", petId: "pet-1" }),
    });

    expect(redirect).toHaveBeenCalledWith("/dashboard/booking/bk-1");
  });
});
