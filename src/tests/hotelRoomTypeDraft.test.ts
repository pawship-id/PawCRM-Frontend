import { BLANK_ROOM_TYPE, parseUnitCodes, roomTypePayload, roomTypeProblem } from "@/features/hotel/roomTypeDraft";

describe("hotel room type draft", () => {
  it("adds unit codes one by one or as a padded run, skipping ones already listed", () => {
    expect(parseUnitCodes(" a-01, A-02 ", [])).toEqual(["A-01", "A-02"]);
    expect(parseUnitCodes("A-09 sampai A-12", ["A-10"])).toEqual(["A-09", "A-11", "A-12"]);
    expect(parseUnitCodes("B1 s/d B3", [])).toEqual(["B1", "B2", "B3"]);
  });

  it("says what is missing, in order", () => {
    expect(roomTypeProblem(BLANK_ROOM_TYPE)).toBe("nama tipe kamar belum diisi");
    const named = { ...BLANK_ROOM_TYPE, name: "Kandang", branchId: "b1", petTypeIds: ["s1"] };
    expect(roomTypeProblem(named)).toBe("belum ada nomor kamar");
    expect(roomTypeProblem({ ...named, mode: "zone", capacity: "0" })).toBe("batas hewan diisi 1–500");
    expect(roomTypeProblem({ ...named, mode: "zone", capacity: "8" })).toBeNull();
  });

  it("sends only the mode's own fields", () => {
    const zone = { ...BLANK_ROOM_TYPE, name: " Ruang Kucing ", branchId: "b1", petTypeIds: ["s1"], mode: "zone" as const, capacity: "8" };
    const payload = roomTypePayload(zone);
    expect(payload).toMatchObject({ name: "Ruang Kucing", mode: "zone", capacity: 8, closed: false });
    expect(payload.units).toBeUndefined();
  });
});
