import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PermissionTree } from "@/features/roles/components/PermissionTree";
import { RoleTemplatePicker } from "@/features/roles/components/RoleTemplatePicker";
import type { PermissionModule } from "@/types/api";
import type { PermissionSelection } from "@/features/roles/permissions";

const act = (key: string, label: string, sensitive = false) => ({ key, label, sensitive });

const MODULES: PermissionModule[] = [
  {
    key: "kasir",
    label: "Kasir (POS)",
    screens: [
      {
        key: "posTransactions",
        label: "Transaksi Kasir",
        description: null,
        features: [
          {
            feature: "posTransactions",
            actions: [act("create", "Buat transaksi"), act("read", "Lihat"), act("void", "Batalkan", true)],
          },
        ],
      },
      {
        key: "posShifts",
        label: "Shift Kasir",
        description: null,
        features: [
          {
            feature: "posShifts",
            actions: [act("open", "Buka shift"), act("read", "Lihat"), act("close", "Tutup shift")],
          },
        ],
      },
    ],
  },
];

function setup(selection: PermissionSelection = {}) {
  const onChange = jest.fn<void, [PermissionSelection]>();
  render(<PermissionTree modules={MODULES} selection={selection} onChange={onChange} />);
  return { onChange };
}

describe("PermissionTree", () => {
  it("grants every action of every screen when a module is ticked", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByLabelText("Semua akses Kasir (POS)"));
    const next = onChange.mock.calls[0][0];
    expect(next.posTransactions.sort()).toEqual(["create", "read", "void"]);
    expect(next.posShifts.sort()).toEqual(["close", "open", "read"]);
  });

  it("shows a partly granted module as indeterminate and opens it", () => {
    setup({ posShifts: ["read"] });
    expect(screen.getByLabelText("Semua akses Kasir (POS)")).toHaveAttribute(
      "data-state",
      "indeterminate",
    );
    expect(screen.getByText("Shift Kasir")).toBeInTheDocument();
  });

  it("pulls in Lihat when another action on the screen is ticked", async () => {
    const { onChange } = setup({ posShifts: ["read"] });
    await userEvent.click(screen.getByLabelText("Batalkan"));
    expect(onChange.mock.calls[0][0].posTransactions.sort()).toEqual(["read", "void"]);
  });

  it("clears only that screen when its own box is unticked", async () => {
    const { onChange } = setup({
      posTransactions: ["create", "read", "void"],
      posShifts: ["read"],
    });
    await userEvent.click(screen.getByLabelText("Semua akses Transaksi Kasir"));
    expect(onChange).toHaveBeenCalledWith({ posShifts: ["read"] });
  });
});

describe("RoleTemplatePicker", () => {
  it("hands the picked template up and says what it filled", async () => {
    const onPick = jest.fn();
    const kasir = {
      key: "kasir",
      label: "Kasir",
      description: "Jualan di kasir.",
      permissions: [{ feature: "posShifts", actions: ["open", "read"] }],
    };
    render(<RoleTemplatePicker templates={[kasir]} onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: "Kasir" }));

    expect(onPick).toHaveBeenCalledWith(kasir);
    expect(screen.getByText(/sudah diisi/)).toBeInTheDocument();
  });
});
