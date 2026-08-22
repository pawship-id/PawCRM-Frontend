import {
  normalizePhone,
  validateEmail,
  validatePassword,
  validatePhone,
  validateResetToken,
  validateConfirmPassword,
  validateSupplierCode,
  validateSupplierPhone,
  validateSupplierWebsite,
  validateSupplierWhatsapp,
} from "@/utils/validation";

describe("validation helpers", () => {
  describe("validateEmail", () => {
    it("accepts a well-formed address", () => {
      expect(validateEmail("groomer@clinic.com")).toBeUndefined();
    });
    it("rejects a malformed address", () => {
      expect(validateEmail("not-an-email")).toBeDefined();
    });
    it("rejects an empty value", () => {
      expect(validateEmail("  ")).toBeDefined();
    });
  });

  describe("validatePassword", () => {
    it("accepts 8+ characters", () => {
      expect(validatePassword("longenough")).toBeUndefined();
    });
    it("rejects short passwords", () => {
      expect(validatePassword("short")).toBeDefined();
    });
  });

  describe("validatePhone", () => {
    it("treats blank as valid (optional/clearable)", () => {
      expect(validatePhone("")).toBeUndefined();
    });
    it("accepts allowed characters", () => {
      expect(validatePhone("+1 (555) 123-4567")).toBeUndefined();
    });
    it("rejects letters", () => {
      expect(validatePhone("call me")).toBeDefined();
    });
  });

  describe("validateResetToken", () => {
    it("accepts exactly 64 hex chars", () => {
      expect(validateResetToken("a".repeat(64))).toBeUndefined();
    });
    it("rejects the wrong length", () => {
      expect(validateResetToken("abc")).toBeDefined();
    });
    it("rejects non-hex", () => {
      expect(validateResetToken("z".repeat(64))).toBeDefined();
    });
  });

  describe("validateConfirmPassword", () => {
    it("passes when they match", () => {
      expect(validateConfirmPassword("abc12345", "abc12345")).toBeUndefined();
    });
    it("fails when they differ", () => {
      expect(validateConfirmPassword("abc12345", "different")).toBeDefined();
    });
  });
});

/**
 * The supplier rules added with the expanded form. Their job is to catch, in
 * the browser, exactly what the server would refuse — so each case below mirrors
 * one in the backend's supplier.api.test.js. A client rule that is STRICTER than
 * the server is worse than none: it blocks a value the API would have taken.
 */
describe("supplier field validators", () => {
  /**
   * A MIRROR of src/utils/phone.js on the backend. It exists so the edit form
   * can tell a re-typed number from a changed one; if the two implementations
   * drifted, every save would PATCH a field nobody touched.
   */
  describe("normalizePhone", () => {
    it.each([
      "+6281234567890",
      "+62 812-3456-7890",
      "62812 3456 7890",
      "0812-3456-7890",
      "812 3456 7890",
    ])("folds %s onto the stored form", (input) => {
      expect(normalizePhone(input)).toBe("+6281234567890");
    });

    it("drops the trunk prefix rather than keeping it beside the country code", () => {
      expect(normalizePhone("081234567890")).not.toContain("+620");
    });

    it("keeps a country code the caller stated explicitly", () => {
      expect(normalizePhone("+65 6789 0000")).toBe("+6567890000");
    });

    it("is idempotent, so a round trip through the form changes nothing", () => {
      expect(normalizePhone("+6281234567890")).toBe("+6281234567890");
    });

    it.each([null, "", "   ", "hubungi sales", "0812"])(
      "returns null for %s",
      (input) => {
        expect(normalizePhone(input)).toBeNull();
      },
    );
  });

  describe("validateSupplierPhone", () => {
    it("accepts an empty value — the field is optional", () => {
      expect(validateSupplierPhone("")).toBeUndefined();
    });

    it.each(["0812-3456-7890", "+62 812 3456 7890", "(031) 887-7221"])(
      "accepts %s",
      (input) => {
        expect(validateSupplierPhone(input)).toBeUndefined();
      },
    );

    it("rejects characters that are not part of a phone number", () => {
      expect(validateSupplierPhone("hubungi sales")).toMatch(/Hanya angka/);
    });

    /**
     * The check the character rule alone would miss. "0812" passes the
     * permissive pattern and normalizes to nothing the server can store, so
     * without this it would go up and come back as a 400.
     */
    it("rejects a number too short to dial", () => {
      expect(validateSupplierPhone("0812")).toMatch(/tidak lengkap/);
    });
  });

  it("names the WhatsApp field in its own message", () => {
    // Four numbers share one rule; "Nomor telepon tidak lengkap" on the
    // WhatsApp row would send the user to the wrong input.
    expect(validateSupplierWhatsapp("0812")).toMatch(/Nomor WhatsApp/);
  });

  describe("validateSupplierWebsite", () => {
    it.each([
      "sumberpangan.co.id",
      "https://sumberpangan.co.id",
      "http://sumberpangan.co.id/katalog",
      "shop.sumberpangan.co.id:8443/x",
    ])("accepts %s", (input) => {
      // The scheme is OPTIONAL here, matching the API: the server prepends
      // https://, and refusing the bare form would flag what a vendor prints on
      // its card.
      expect(validateSupplierWebsite(input)).toBeUndefined();
    });

    it.each(["sumberpangan", "lihat di IG"])("rejects %s", (input) => {
      expect(validateSupplierWebsite(input)).toMatch(/tidak valid/);
    });

    it("accepts an empty value", () => {
      expect(validateSupplierWebsite("")).toBeUndefined();
    });
  });

  describe("validateSupplierCode", () => {
    it.each(["SUP-001", "PT-SMB.02/A", "V0031"])(
      "accepts the punctuation real vendor codes carry: %s",
      (input) => {
        expect(validateSupplierCode(input)).toBeUndefined();
      },
    );

    it.each(["SUP 001", "SUP'001"])("rejects %s", (input) => {
      expect(validateSupplierCode(input)).toMatch(/spasi atau tanda kutip/);
    });

    it("accepts an empty value — most suppliers have no code", () => {
      expect(validateSupplierCode("")).toBeUndefined();
    });

    it("rejects an over-long code", () => {
      expect(validateSupplierCode("X".repeat(33))).toMatch(/terlalu panjang/);
    });
  });
});
