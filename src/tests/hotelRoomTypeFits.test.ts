import { roomTypeFits } from "@/features/services/components/HotelRoomTypesField";

const catOnly = { petTypeIds: ["cat"] };
const both = { petTypeIds: ["cat", "dog"] };
const dogOnly = { petTypeIds: ["dog"] };

describe("roomTypeFits — Lokasi & jangkauan (24 November 2026)", () => {
  it("unticking Kucing drops the cat-only room, keeps the shared one", () => {
    const left = ["dog"];
    expect(roomTypeFits(catOnly, left)).toBe(false);
    expect(roomTypeFits(both, left)).toBe(true);
    expect(roomTypeFits(dogOnly, left)).toBe(true);
  });

  it("nothing ticked: no room fits", () => {
    expect(roomTypeFits(both, [])).toBe(false);
  });
});
