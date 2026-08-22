import {
  emptyFormValues,
  toFormValues,
  toSupplierPatch,
  toSupplierPayload,
} from "@/features/purchasing/components/supplierPayload";
import { formatSupplierAddress } from "@/features/purchasing/supplierAddress";
import type { Supplier } from "@/types/api";

/**
 * The FE ↔ BE mapping, tested directly rather than only through the two forms.
 *
 * WHY BOTH. A form test proves the button ends up calling the service; it does
 * not distinguish "sent the right thing" from "sent something the mock happened
 * to accept". These assert the payload SHAPE — which field is trimmed, which is
 * nulled, which is a number, which composite is sent whole — and that is where
 * a supplier's thirty fields actually go wrong.
 */

const SUPPLIER_ID = "5a7f1f77bcf86cd799439033";
const CATEGORY_ID = "6a7f1f77bcf86cd799439044";
const BRANCH_ID = "7a7f1f77bcf86cd799439055";
const ACCOUNT_ID = "8a7f1f77bcf86cd799439066";

/** A stored supplier with every field populated. */
function stored(overrides: Partial<Supplier> = {}): Supplier {
  return {
    _id: SUPPLIER_ID,
    tenantId: "t1",
    name: "PT Sumber Pangan",
    code: "SUP-001",
    categoryId: CATEGORY_ID,
    category: { _id: CATEGORY_ID, name: "Distributor" },
    entityType: "perusahaan",
    payableAccountId: ACCOUNT_ID,
    advanceAccountId: null,
    allBranches: false,
    branchIds: [BRANCH_ID],
    bankAccounts: [
      {
        _id: "bank-1",
        accountNumber: "123-456-7890",
        accountHolder: "PT Sumber Pangan",
        bankName: "BCA",
      },
    ],
    pic: {
      name: "Bu Rina",
      email: "rina@sumberpangan.co.id",
      address: "Jl. Rungkut Industri 21",
      phone: "+6281234567891",
    },
    phone: "+62318877221",
    whatsapp: "+6281234567890",
    fax: "+62318877222",
    website: "https://sumberpangan.co.id",
    email: "purchasing@sumberpangan.co.id",
    address: {
      street: "Jl. Rungkut Industri 21",
      city: "Surabaya",
      postalCode: "60293",
      province: "Jawa Timur",
      country: "Indonesia",
    },
    npwp: "01.234.567.8-901.000",
    notes: null,
    type: "beli_putus",
    paymentTermDays: 30,
    isActive: true,
    createdBy: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Supplier;
}

describe("toFormValues", () => {
  it("round-trips a fully populated supplier", () => {
    const values = toFormValues(stored());

    expect(values.code).toBe("SUP-001");
    expect(values.address.city).toBe("Surabaya");
    expect(values.pic.name).toBe("Bu Rina");
    expect(values.branchIds).toEqual([BRANCH_ID]);
    expect(values.payableAccountId).toBe(ACCOUNT_ID);
    // Numbers become strings; an input's value is a string, and converting at
    // the submit boundary means one place to get it wrong.
    expect(values.paymentTermDays).toBe("30");
  });

  /**
   * THE LEGACY SHAPE. A supplier stored before these fields existed carries no
   * such keys at all — `.lean()` reads return what is stored, and a Mongoose
   * default applies on WRITE, not on read. Reaching for `supplier.address.city`
   * on one of those would throw and white-page the edit screen.
   */
  it("survives a supplier missing every field added after launch", () => {
    const legacy = {
      _id: SUPPLIER_ID,
      tenantId: "t1",
      name: "PT Lama",
      phone: "031-8877-221",
      email: null,
      npwp: null,
      notes: null,
      type: "beli_putus",
      paymentTermDays: 30,
    } as unknown as Supplier;

    const values = toFormValues(legacy);

    expect(values.code).toBe("");
    expect(values.address).toEqual({
      street: "",
      city: "",
      postalCode: "",
      province: "",
      country: "",
    });
    expect(values.pic).toEqual({
      name: "",
      email: "",
      address: "",
      phone: "",
    });
    expect(values.bankAccounts).toEqual([]);
    // Absent means "everywhere" — the only reading that does not make an
    // existing vendor vanish from every purchasing screen.
    expect(values.allBranches).toBe(true);
    expect(values.branchIds).toEqual([]);
  });

  it("keys each bank row by the server's id, so a save does not steal focus", () => {
    // React reuses a component when the key matches. Keying by array index
    // instead would move row 3's text into row 2 the moment row 2 is deleted.
    expect(toFormValues(stored()).bankAccounts[0].key).toBe("bank-1");
  });
});

describe("toSupplierPayload", () => {
  it("sends the two required fields as a plain string and a number", () => {
    const values = {
      ...emptyFormValues(),
      name: "  PT Sumber  ",
      code: "  SUP-001  ",
      paymentTermDays: " 45 ",
    };

    const payload = toSupplierPayload(values);

    expect(payload.name).toBe("PT Sumber");
    expect(payload.code).toBe("SUP-001");
    expect(payload.paymentTermDays).toBe(45);
  });

  it("nulls every empty optional field rather than sending an empty string", () => {
    const payload = toSupplierPayload({
      ...emptyFormValues(),
      name: "PT Sumber",
      code: "SUP-001",
    });

    // "" would be stored as neither absent nor present.
    expect(payload.categoryId).toBeNull();
    expect(payload.entityType).toBeNull();
    expect(payload.payableAccountId).toBeNull();
    expect(payload.phone).toBeNull();
    expect(payload.pic).toEqual({
      name: null,
      email: null,
      address: null,
      phone: null,
    });
  });

  /**
   * THE FRONTEND NEVER PRE-FORMATS A PHONE NUMBER. The server normalizes to
   * E.164, and a second implementation here would be free to disagree with the
   * authority for every number a tenant enters.
   */
  it("sends phone numbers exactly as typed", () => {
    const payload = toSupplierPayload({
      ...emptyFormValues(),
      name: "PT Sumber",
      code: "SUP-001",
      phone: "031-8877-221",
      pic: { name: "", email: "", address: "", phone: "0812-3456-7890" },
    });

    expect(payload.phone).toBe("031-8877-221");
    expect(payload.pic?.phone).toBe("0812-3456-7890");
  });

  it("strips whitespace from the NPWP, matching what the server stores", () => {
    const payload = toSupplierPayload({
      ...emptyFormValues(),
      name: "PT Sumber",
      code: "SUP-001",
      npwp: "01.234.567.8 - 901.000",
    });

    // Otherwise the duplicate check would compare two spellings of one number.
    expect(payload.npwp).toBe("01.234.567.8-901.000");
  });

  it("empties the branch list when the supplier is available everywhere", () => {
    const payload = toSupplierPayload({
      ...emptyFormValues(),
      name: "PT Sumber",
      code: "SUP-001",
      allBranches: true,
      // Left over from unticking and re-ticking the box. A leftover list is a
      // trap the day the flag is turned off again.
      branchIds: [BRANCH_ID],
    });

    expect(payload.branchIds).toEqual([]);
  });

  it("drops the client-side row key from every bank account", () => {
    const payload = toSupplierPayload({
      ...emptyFormValues(),
      name: "PT Sumber",
      code: "SUP-001",
      bankAccounts: [
        {
          key: "row-1",
          accountNumber: " 123-456 ",
          accountHolder: " PT Sumber ",
          bankName: " BCA ",
        },
      ],
    });

    expect(payload.bankAccounts).toEqual([
      {
        accountNumber: "123-456",
        accountHolder: "PT Sumber",
        bankName: "BCA",
      },
    ]);
  });
});

describe("toSupplierPatch", () => {
  it("sends nothing when nothing changed", () => {
    const supplier = stored();
    const patch = toSupplierPatch(toFormValues(supplier), supplier);

    expect(
      Object.values(patch).every((value) => value === undefined),
    ).toBe(true);
  });

  it("sends only the field that differs", () => {
    const supplier = stored();
    const values = { ...toFormValues(supplier), notes: "Kirim tiap Selasa" };

    const patch = toSupplierPatch(values, supplier);

    expect(patch.notes).toBe("Kirim tiap Selasa");
    expect(patch.name).toBeUndefined();
    expect(patch.bankAccounts).toBeUndefined();
    expect(patch.pic).toBeUndefined();
  });

  /**
   * THE NORMALIZATION ROUND TRIP. The server stores "+6281234567890" and the
   * form shows it; a user who retypes the same number in the national form has
   * changed NOTHING, and a literal compare would send a PATCH that makes the
   * server re-check a value nobody touched.
   */
  it("does not treat a re-typed phone number as a change", () => {
    const supplier = stored();
    const values = { ...toFormValues(supplier), whatsapp: "0812-3456-7890" };

    expect(toSupplierPatch(values, supplier).whatsapp).toBeUndefined();
  });

  it("sends a genuinely different number as typed", () => {
    const supplier = stored();
    const values = { ...toFormValues(supplier), whatsapp: "0813-0000-1111" };

    expect(toSupplierPatch(values, supplier).whatsapp).toBe("0813-0000-1111");
  });

  it("sends the whole PIC object when one part changes", () => {
    const supplier = stored();
    const base = toFormValues(supplier);
    const values = { ...base, pic: { ...base.pic, name: "Pak Hendra" } };

    // The server flattens it to dot paths, so sending the whole object still
    // MERGES — diffing part by part would save nothing and add five more
    // comparisons to get wrong.
    expect(toSupplierPatch(values, supplier).pic).toEqual({
      name: "Pak Hendra",
      email: "rina@sumberpangan.co.id",
      address: "Jl. Rungkut Industri 21",
      phone: "+6281234567891",
    });
  });

  it("sends the whole address when one part changes", () => {
    const supplier = stored();
    const base = toFormValues(supplier);
    const values = {
      ...base,
      address: { ...base.address, postalCode: "60294" },
    };

    expect(toSupplierPatch(values, supplier).address).toMatchObject({
      postalCode: "60294",
      city: "Surabaya",
    });
  });

  it("sends both halves of the branch scope when either changes", () => {
    const supplier = stored();
    const values = { ...toFormValues(supplier), allBranches: true };

    // Sending the flag alone would make the server validate against the STORED
    // list rather than the one the user just picked.
    expect(toSupplierPatch(values, supplier)).toMatchObject({
      allBranches: true,
      branchIds: [],
    });
  });

  it("sends the whole bank list when a row is removed", () => {
    const supplier = stored();
    const values = { ...toFormValues(supplier), bankAccounts: [] };

    // Replace-the-array is the API's contract; there is no partial form.
    expect(toSupplierPatch(values, supplier).bankAccounts).toEqual([]);
  });

  it("never sends a null code, which the API refuses", () => {
    const supplier = stored();
    const values = { ...toFormValues(supplier), code: "SUP-002" };

    expect(toSupplierPatch(values, supplier).code).toBe("SUP-002");
  });

  it("clears an account override to null rather than an empty string", () => {
    const supplier = stored();
    const values = { ...toFormValues(supplier), payableAccountId: "" };

    // null is what the API reads as "fall back to the seeded account".
    expect(toSupplierPatch(values, supplier).payableAccountId).toBeNull();
  });
});

describe("formatSupplierAddress", () => {
  it("joins the parts into one readable line", () => {
    expect(formatSupplierAddress(stored().address)).toBe(
      "Jl. Rungkut Industri 21, Surabaya, Jawa Timur 60293, Indonesia",
    );
  });

  /**
   * BUILT FROM WHATEVER IS PRESENT, never with placeholders for the rest. An
   * address is completed over time, so a half-filled one is the ordinary case
   * rather than an error state — ", Surabaya, , ," is the failure this avoids.
   */
  it("skips the missing parts instead of leaving empty separators", () => {
    expect(
      formatSupplierAddress({
        street: null,
        city: "Surabaya",
        postalCode: null,
        province: null,
        country: null,
      }),
    ).toBe("Surabaya");
  });

  it("joins the postcode to the province with a space, as a postal address is written", () => {
    expect(
      formatSupplierAddress({
        street: null,
        city: null,
        postalCode: "60293",
        province: "Jawa Timur",
        country: null,
      }),
    ).toBe("Jawa Timur 60293");
  });

  it.each([
    ["an absent address", undefined],
    ["a null address", null],
  ])("returns null for %s", (_label, address) => {
    // Callers choose their own em dash rather than being handed a string that
    // looks like content.
    expect(formatSupplierAddress(address)).toBeNull();
  });

  it("returns null when every part is empty", () => {
    expect(
      formatSupplierAddress({
        street: null,
        city: null,
        postalCode: null,
        province: null,
        country: null,
      }),
    ).toBeNull();
  });
});
