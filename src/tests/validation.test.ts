import {
  validateEmail,
  validatePassword,
  validatePhone,
  validateResetToken,
  validateConfirmPassword,
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
