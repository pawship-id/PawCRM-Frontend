import { toWhatsAppDigits, whatsAppLink } from "@/utils/phone";

/**
 * The WhatsApp link on a customer's row, and the rule behind it.
 *
 * THE CASES ARE THE BACKEND'S OWN (PawCRM-Backend/src/utils/phone.js and its
 * test). That is the point of this suite: `customer.phone` is stored exactly as
 * the shop typed it, so this module has to fold the same four forms onto the same
 * digits the server folds them onto — otherwise a number that opens a chat from an
 * invoice opens nothing, or somebody else's chat, from the customer list.
 *
 * If these two ever disagree, delete this module and read a derived field off the
 * API instead. A second opinion about a phone number is not worth having.
 */
describe("toWhatsAppDigits", () => {
  it("folds the four ways one Indonesian mobile is written onto the same digits", () => {
    expect(toWhatsAppDigits("+62 812-3456-7890")).toBe("6281234567890");
    expect(toWhatsAppDigits("62812 3456 7890")).toBe("6281234567890");
    expect(toWhatsAppDigits("0812-3456-7890")).toBe("6281234567890");
    expect(toWhatsAppDigits("812 3456 7890")).toBe("6281234567890");
  });

  it("replaces the trunk zero rather than keeping it beside the country code", () => {
    // "+6208123…" is a number that does not exist, and it is the easy mistake.
    expect(toWhatsAppDigits("081234567890")).toBe("6281234567890");
    expect(toWhatsAppDigits("081234567890")).not.toContain("620");
  });

  it("keeps a country code the shop stated", () => {
    // An Indonesian shop with a Singaporean customer is ordinary.
    expect(toWhatsAppDigits("+65 8123 4567")).toBe("6581234567");
  });

  it("reads a leading 62 as a subscriber number when a trunk zero preceded it", () => {
    // "062…" is national, so the 62 after the zero is part of the number — this is
    // the narrow case the backend's comment warns about.
    expect(toWhatsAppDigits("0621234567")).toBe("62621234567");
  });

  it("strips the punctuation people actually type", () => {
    expect(toWhatsAppDigits("(021) 887-7221")).toBe("62218877221");
  });

  it("returns null for nothing, for blanks and for values that are not numbers", () => {
    // Null rather than a best guess: a half-right number sends the message to a
    // stranger, which is worse than a missing button.
    expect(toWhatsAppDigits(null)).toBeNull();
    expect(toWhatsAppDigits(undefined)).toBeNull();
    expect(toWhatsAppDigits("")).toBeNull();
    expect(toWhatsAppDigits("   ")).toBeNull();
    expect(toWhatsAppDigits("hubungi lewat IG")).toBeNull();
    expect(toWhatsAppDigits("0812+3456")).toBeNull();
  });

  it("refuses a number too short or too long to dial", () => {
    // E.164's own bounds — 8 to 15 digits. Without the floor a typo'd extension
    // would normalise to a "valid" number that rings nowhere.
    expect(toWhatsAppDigits("+62123")).toBeNull();
    expect(toWhatsAppDigits("+621234567890123456")).toBeNull();
  });
});

describe("whatsAppLink", () => {
  it("builds a wa.me link with no prefilled message", () => {
    // No canned "Halo": opening a chat from a row has no message to put in
    // anybody's mouth, and one there is a line staff have to delete.
    expect(whatsAppLink("0812-3456-7890")).toBe("https://wa.me/6281234567890");
  });

  it("is null when there is no chat to open", () => {
    expect(whatsAppLink(null)).toBeNull();
    expect(whatsAppLink("belum ada nomor")).toBeNull();
  });
});
