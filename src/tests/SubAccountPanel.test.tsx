import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Swal from "sweetalert2";

import { SubAccountPanel } from "@/features/accounting/components/SubAccountPanel";
import { tenantShape } from "@/features/accounting/allocationLabels";
import { ApiError } from "@/services/api-error";
import { subAccountService } from "@/services/subAccount.service";
import type { ChartOfAccount, RemapSummary, SubAccount } from "@/types/accounting";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

/**
 * The Sub Akun panel of one account — each act is its own request now, where the
 * Detil Akun panel it replaced held the whole list as a draft and sent one PATCH.
 *
 * WHAT IS WORTH ASSERTING: the kode is half typed (the parent's prefix is text,
 * never an input), branches are the ACCOUNT's, only what moved is patched, and a
 * delete that the server turned into a deactivation says so — a "Hapus" that
 * leaves the row on screen would otherwise read as a failure.
 */

const SHAPE = tenantShape(2, 2);
const LINES = [
  { _id: "bl-grooming", name: "Grooming" },
  { _id: "bl-retail", name: "Retail" },
];
const BRANCHES = [
  { _id: "br-pusat", name: "Pusat" },
  { _id: "br-barat", name: "Barat" },
  { _id: "br-timur", name: "Timur" },
];

function sub(over: Partial<SubAccount>): SubAccount {
  return {
    _id: "sub-1",
    accountId: "acc-gaji",
    code: "5101-01",
    name: "Gaji - Grooming",
    allocationType: "direct",
    businessLineId: "bl-grooming",
    branchId: null,
    isActive: true,
    ...over,
  };
}

function account(subAccounts: SubAccount[]): ChartOfAccount {
  return {
    _id: "acc-gaji",
    code: "5101",
    name: "Beban Gaji",
    accountType: "expense",
    accountCategory: "biaya",
    // Timur is NOT one of this account's branches.
    branchIds: ["br-pusat", "br-barat"],
    subAccounts,
    isDefault: false,
    isActive: true,
  };
}

function renderPanel(
  subAccounts: SubAccount[],
  props: { editable?: boolean; remap?: boolean } = {},
) {
  const onSaved = jest.fn();
  const onClose = jest.fn();

  renderWithAuth(
    <SubAccountPanel
      account={account(subAccounts)}
      shape={SHAPE}
      businessLines={LINES}
      branches={BRANCHES}
      editable={props.editable ?? true}
      onSaved={onSaved}
      onClose={onClose}
    />,
    // Super-admin by default (every check passes); `remap: false` is a user who
    // may edit the chart but does NOT hold chartOfAccounts:remapHistory.
    props.remap === false
      ? {
          isSuperAdmin: false,
          permissions: [
            { feature: "chartOfAccounts", actions: ["read", "update", "create", "delete"] },
          ],
        }
      : undefined,
  );

  return { onSaved, onClose };
}

afterEach(() => jest.restoreAllMocks());

describe("SubAccountPanel", () => {
  it("lists each sub akun with its code, line and branch", () => {
    renderPanel([
      sub({}),
      sub({
        _id: "sub-2",
        code: "5101-02",
        name: "Gaji - Admin",
        allocationType: "shared_overall",
        businessLineId: null,
      }),
    ]);

    expect(screen.getByText("5101-01")).toBeInTheDocument();
    expect(screen.getByText("Gaji - Grooming")).toBeInTheDocument();
    expect(screen.getByText("Grooming")).toBeInTheDocument();
    expect(screen.getByText("5101-02")).toBeInTheDocument();
    expect(screen.getByText("Semua lini")).toBeInTheDocument();
  });

  it("says so when an account has none yet", () => {
    renderPanel([]);

    expect(screen.getByText(/Belum ada sub akun/)).toBeInTheDocument();
  });

  it("goes read-only without the update grant", () => {
    renderPanel([sub({})], { editable: false });

    expect(
      screen.queryByRole("button", { name: /Tambah sub akun/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ubah sub akun/ }),
    ).not.toBeInTheDocument();
  });

  /** Foto aturan (6 Okt 2026): editing a rule only reaches what is recorded next. */
  it("says an edited rule applies to new transactions only, while a sub akun is being edited", async () => {
    renderPanel([sub({})]);

    const note = /Perubahan berlaku untuk transaksi yang dicatat setelah ini\. Transaksi lama tetap memakai aturan saat dicatat\./;
    expect(screen.queryByText(note)).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Ubah sub akun 5101-01" }),
    );

    expect(screen.getByText(note)).toBeInTheDocument();
  });

  /** THE KODE IS HALF TYPED: "01" becomes "5101-01", and the prefix is text. */
  it("creates a sub akun from the suffix alone, under the parent's prefix", async () => {
    const create = jest
      .spyOn(subAccountService, "create")
      .mockResolvedValue(sub({}));
    const { onSaved } = renderPanel([]);

    await userEvent.click(screen.getByRole("button", { name: /Tambah sub akun/ }));

    // The prefix is on screen and is not what the input holds.
    expect(screen.getByText("5101-")).toBeInTheDocument();
    const suffix = screen.getByLabelText("Kode sub akun setelah 5101-");
    expect(suffix).toHaveValue("");

    await userEvent.type(suffix, "03a");
    await userEvent.type(screen.getByLabelText("Nama sub akun"), "Gaji - Retail");
    await userEvent.click(screen.getByLabelText("Tipe alokasi"));
    await userEvent.click(screen.getByRole("option", { name: "Shared-Overall" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith("acc-gaji", {
        code: "5101-03A",
        name: "Gaji - Retail",
        allocationType: "shared_overall",
        // Forced null off `direct`.
        businessLineId: null,
        branchId: null,
        isActive: true,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("asks for the suffix and the name before anything is sent", async () => {
    const create = jest.spyOn(subAccountService, "create");
    renderPanel([]);

    await userEvent.click(screen.getByRole("button", { name: /Tambah sub akun/ }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText(/Kode wajib diisi/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Kode sub akun setelah 5101-"), "01");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(
      await screen.findByText("Nama sub akun wajib diisi."),
    ).toBeInTheDocument();

    expect(create).not.toHaveBeenCalled();
  });

  it("offers only the account's own branches for a Direct sub akun", async () => {
    renderPanel([]);

    await userEvent.click(screen.getByRole("button", { name: /Tambah sub akun/ }));
    await userEvent.click(screen.getByLabelText("Cabang"));

    expect(screen.getByRole("option", { name: "Pusat" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Barat" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Timur" }),
    ).not.toBeInTheDocument();
  });

  it("sends only what moved when one is edited", async () => {
    const update = jest
      .spyOn(subAccountService, "update")
      .mockResolvedValue(sub({}));
    renderPanel([sub({})]);

    await userEvent.click(
      screen.getByRole("button", { name: "Ubah sub akun 5101-01" }),
    );
    // The suffix of the saved code, not the whole of it.
    expect(screen.getByLabelText("Kode sub akun setelah 5101-")).toHaveValue("01");

    const name = screen.getByLabelText("Nama sub akun");
    await userEvent.clear(name);
    await userEvent.type(name, "Gaji - Grooming Pusat");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("acc-gaji", "sub-1", {
        name: "Gaji - Grooming Pusat",
      }),
    );
  });

  it("shows the server's refusal as a toast and keeps the row open", async () => {
    jest
      .spyOn(subAccountService, "create")
      .mockRejectedValue(new ApiError("Kode 5101-01 sudah dipakai", 409));
    renderPanel([]);

    await userEvent.click(screen.getByRole("button", { name: /Tambah sub akun/ }));
    await userEvent.type(screen.getByLabelText("Kode sub akun setelah 5101-"), "01");
    await userEvent.type(screen.getByLabelText("Nama sub akun"), "Gaji");
    await userEvent.click(screen.getByLabelText("Tipe alokasi"));
    await userEvent.click(screen.getByRole("option", { name: "Shared-Overall" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: "error",
          title: expect.stringContaining("sudah dipakai"),
        }),
      ),
    );
    expect(screen.getByLabelText("Nama sub akun")).toHaveValue("Gaji");
  });

  /** TWO ENDINGS FOR "HAPUS", and the toast must say which one happened. */
  describe("removing", () => {
    async function confirmRemoval() {
      await userEvent.click(
        screen.getByRole("button", { name: "Hapus sub akun 5101-01" }),
      );
      const dialog = within(await screen.findByRole("dialog"));
      await userEvent.click(dialog.getByRole("button", { name: "Hapus" }));
    }

    it("says deleted when nothing referred to it", async () => {
      jest
        .spyOn(subAccountService, "remove")
        .mockResolvedValue({ ...sub({}), outcome: "deleted" });
      const { onSaved } = renderPanel([sub({})]);

      await confirmRemoval();

      await waitFor(() =>
        expect(Swal.fire).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Sub akun 5101-01 dihapus." }),
        ),
      );
      expect(onSaved).toHaveBeenCalled();
    });

    it("says deactivated, not deleted, when entries already name it", async () => {
      jest.spyOn(subAccountService, "remove").mockResolvedValue({
        ...sub({ isActive: false }),
        outcome: "deactivated",
        references: { journalEntries: 3 },
      });
      const { onSaved } = renderPanel([sub({})]);

      await confirmRemoval();

      await waitFor(() =>
        expect(Swal.fire).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringContaining("dinonaktifkan"),
          }),
        ),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  /**
   * "TERAPKAN KE DATA LAMA" (Tahap 2b). Saving a moved rule offers the choice;
   * the default saves for new transactions only, the second needs the grant.
   */
  describe("terapkan ke data lama", () => {
    const SUMMARY: RemapSummary = {
      entries: 2,
      lines: 3,
      amount: "450000.0000",
      includesReversalPairs: 1,
      stamped: 0,
      changes: [
        {
          from: {
            allocationType: "direct",
            businessLineId: "bl-grooming",
            businessLineName: "Grooming",
            branchId: null,
            branchName: null,
          },
          to: {
            allocationType: "direct",
            businessLineId: "bl-retail",
            businessLineName: "Retail",
            branchId: null,
            branchName: null,
          },
          lines: 3,
          entries: 2,
          amount: "450000.0000",
        },
      ],
    };

    async function editLineToRetail() {
      await userEvent.click(
        screen.getByRole("button", { name: "Ubah sub akun 5101-01" }),
      );
      await userEvent.click(screen.getByLabelText("Lini usaha"));
      await userEvent.click(screen.getByRole("option", { name: "Retail" }));
      await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
      return within(await screen.findByRole("dialog"));
    }

    async function pickRange(dialog: ReturnType<typeof within>) {
      fireEvent.change(dialog.getByLabelText("Rentang tanggal dari"), {
        target: { value: "2026-08-01" },
      });
      fireEvent.change(dialog.getByLabelText("Rentang tanggal sampai"), {
        target: { value: "2026-08-31" },
      });
    }

    it("does not ask when only the name changed", async () => {
      jest.spyOn(subAccountService, "update").mockResolvedValue(sub({}));
      renderPanel([sub({})]);

      await userEvent.click(screen.getByRole("button", { name: "Ubah sub akun 5101-01" }));
      await userEvent.type(screen.getByLabelText("Nama sub akun"), " 2");
      await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(subAccountService.update).toHaveBeenCalled());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("saves for new transactions only by default, without touching the history endpoints", async () => {
      const update = jest.spyOn(subAccountService, "update").mockResolvedValue(sub({}));
      const preview = jest.spyOn(subAccountService, "remapPreview");
      const apply = jest.spyOn(subAccountService, "remapApply");
      const { onSaved } = renderPanel([sub({})]);

      const dialog = await editLineToRetail();
      expect(dialog.getByRole("radio", { name: /Hanya transaksi baru/ })).toBeChecked();
      // Nothing was sent before the choice.
      expect(update).not.toHaveBeenCalled();

      await userEvent.click(dialog.getByRole("button", { name: "Simpan" }));

      await waitFor(() =>
        expect(update).toHaveBeenCalledWith("acc-gaji", "sub-1", { businessLineId: "bl-retail" }),
      );
      expect(preview).not.toHaveBeenCalled();
      expect(apply).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });

    it("disables the second option, with the hint, without remapHistory", async () => {
      renderPanel([sub({})], { remap: false });

      const dialog = await editLineToRetail();

      expect(dialog.getByRole("radio", { name: /Terapkan juga ke data lama/ })).toBeDisabled();
      expect(dialog.getByText("Perlu izin khusus")).toBeInTheDocument();
      // And no row action either.
      expect(
        screen.queryByRole("button", { name: /Terapkan ke data lama 5101-01/ }),
      ).not.toBeInTheDocument();
    });

    it("previews, then PATCHes the rule and applies with the numbers it showed", async () => {
      const order: string[] = [];
      jest.spyOn(subAccountService, "update").mockImplementation(async () => {
        order.push("patch");
        return sub({});
      });
      const preview = jest.spyOn(subAccountService, "remapPreview").mockResolvedValue(SUMMARY);
      const apply = jest.spyOn(subAccountService, "remapApply").mockImplementation(async () => {
        order.push("apply");
        return { ...SUMMARY, modifiedEntries: 2, modifiedTransactions: 0, audited: true };
      });
      const { onSaved } = renderPanel([sub({})]);

      const dialog = await editLineToRetail();
      await userEvent.click(dialog.getByRole("radio", { name: /Terapkan juga ke data lama/ }));
      expect(dialog.getByRole("button", { name: "Terapkan" })).toBeDisabled();

      await pickRange(dialog);
      await userEvent.click(dialog.getByRole("button", { name: "Lihat pratinjau" }));

      await waitFor(() =>
        expect(preview).toHaveBeenCalledWith("acc-gaji", "sub-1", {
          dateFrom: "2026-08-01",
          dateTo: "2026-08-31",
          // The PROPOSED rule: nothing is saved yet.
          rule: { allocationType: "direct", businessLineId: "bl-retail", branchId: null },
        }),
      );
      expect(order).toEqual([]);
      expect(
        await dialog.findByText(/3 baris jurnal \(2 transaksi\), total Rp\s?450\.000 akan pindah/),
      ).toBeInTheDocument();
      expect(dialog.getByText("Laporan periode ini akan ikut berubah.")).toBeInTheDocument();
      expect(dialog.getByText(/Termasuk 1 transaksi pasangan pembalikan/)).toBeInTheDocument();
      expect(dialog.getByText("Grooming · Semua cabang")).toBeInTheDocument();
      expect(dialog.getByText("Retail · Semua cabang")).toBeInTheDocument();

      await userEvent.click(dialog.getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(apply).toHaveBeenCalledWith("acc-gaji", "sub-1", {
          dateFrom: "2026-08-01",
          dateTo: "2026-08-31",
          expected: { lines: 3, amount: "450000.0000" },
        }),
      );
      expect(order).toEqual(["patch", "apply"]);
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it("on a 409 shows the fresh numbers and applies again without a second PATCH", async () => {
      const update = jest.spyOn(subAccountService, "update").mockResolvedValue(sub({}));
      jest.spyOn(subAccountService, "remapPreview").mockResolvedValue(SUMMARY);
      const fresh = { ...SUMMARY, lines: 4, amount: "500000.0000", entries: 3 };
      const apply = jest
        .spyOn(subAccountService, "remapApply")
        .mockRejectedValueOnce(
          new ApiError("Data berubah sejak pratinjau", 409, { data: { current: fresh } }),
        )
        .mockResolvedValueOnce({ ...fresh, modifiedEntries: 3, modifiedTransactions: 0, audited: true });
      const { onSaved } = renderPanel([sub({})]);

      const dialog = await editLineToRetail();
      await userEvent.click(dialog.getByRole("radio", { name: /Terapkan juga ke data lama/ }));
      await pickRange(dialog);
      await userEvent.click(dialog.getByRole("button", { name: "Lihat pratinjau" }));
      await dialog.findByText(/3 baris jurnal/);
      await userEvent.click(dialog.getByRole("button", { name: "Terapkan" }));

      expect(await dialog.findByText(/Data berubah sejak pratinjau tadi/)).toBeInTheDocument();
      expect(dialog.getByText(/4 baris jurnal \(3 transaksi\)/)).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();

      await userEvent.click(dialog.getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(apply).toHaveBeenLastCalledWith(
          "acc-gaji",
          "sub-1",
          expect.objectContaining({ expected: { lines: 4, amount: "500000.0000" } }),
        ),
      );
      expect(update).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it("keeps the rule saved and says so when apply fails for another reason", async () => {
      jest.spyOn(subAccountService, "update").mockResolvedValue(sub({}));
      jest.spyOn(subAccountService, "remapPreview").mockResolvedValue(SUMMARY);
      jest
        .spyOn(subAccountService, "remapApply")
        .mockRejectedValue(new ApiError("Terjadi kesalahan", 500));
      const { onSaved } = renderPanel([sub({})]);

      const dialog = await editLineToRetail();
      await userEvent.click(dialog.getByRole("radio", { name: /Terapkan juga ke data lama/ }));
      await pickRange(dialog);
      await userEvent.click(dialog.getByRole("button", { name: "Lihat pratinjau" }));
      await dialog.findByText(/3 baris jurnal/);
      await userEvent.click(dialog.getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(Swal.fire).toHaveBeenCalledWith(
          expect.objectContaining({ icon: "error", title: "Terjadi kesalahan" }),
        ),
      );
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it("opens from the row action for the current rule, with no PATCH", async () => {
      const update = jest.spyOn(subAccountService, "update");
      const preview = jest.spyOn(subAccountService, "remapPreview").mockResolvedValue(SUMMARY);
      const apply = jest.spyOn(subAccountService, "remapApply").mockResolvedValue({
        ...SUMMARY,
        modifiedEntries: 2,
        modifiedTransactions: 0,
        audited: true,
      });
      renderPanel([sub({})]);

      await userEvent.click(
        screen.getByRole("button", { name: "Terapkan ke data lama 5101-01" }),
      );
      const dialog = within(await screen.findByRole("dialog"));
      expect(dialog.queryByRole("radio")).not.toBeInTheDocument();

      await pickRange(dialog);
      await userEvent.click(dialog.getByRole("button", { name: "Lihat pratinjau" }));
      await waitFor(() =>
        expect(preview).toHaveBeenCalledWith("acc-gaji", "sub-1", {
          dateFrom: "2026-08-01",
          dateTo: "2026-08-31",
        }),
      );
      await dialog.findByText(/3 baris jurnal/);
      await userEvent.click(dialog.getByRole("button", { name: "Terapkan" }));

      await waitFor(() => expect(apply).toHaveBeenCalled());
      expect(update).not.toHaveBeenCalled();
    });
  });
});
