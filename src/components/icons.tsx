import type { SVGProps } from "react";

/**
 * Line icons for navigation and section headers.
 *
 * All draw with `currentColor` and a 24-grid stroke, so they inherit text color
 * (active vs. muted nav state) and size from the surrounding element — no color
 * or fill is hard-coded, keeping them on-theme.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Base({
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Base>
  );
}

export function BookingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path d="M9 14l2 2 4-4" />
    </Base>
  );
}

export function InventoryIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </Base>
  );
}

export function PosIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" />
    </Base>
  );
}

export function SalesIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 2.5h9l3 3V21l-2.2-1.3L13.6 21l-2.3-1.3L9 21l-2.2-1.3L4.5 21V4a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
    </Base>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Base>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 9l6 6 6-6" />
    </Base>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </Base>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Base>
  );
}

export function MasterDataIcon(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
      <path d="M5 11.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
    </Base>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.25 3.25 0 0 1 0 6.1M17.5 19a5.5 5.5 0 0 0-2.2-4.4" />
    </Base>
  );
}

export function BranchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20V7l6-3 6 3v13" />
      <path d="M16 10h4v10M4 20h16" />
      <path d="M8 9h.01M12 9h.01M8 13h.01M12 13h.01M8 17h4" />
    </Base>
  );
}

/**
 * Warehouse — a pitched storage shed with a shutter door. Deliberately unlike
 * BranchIcon (a multi-storey building): the two sit next to each other in Master
 * Data and mean different things, so they must not read as the same silhouette.
 */
export function WarehouseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 20V9.5L12 4l9 5.5V20" />
      <path d="M2 20h20" />
      <path d="M8.5 20v-6.5h7V20" />
      <path d="M8.5 16.5h7" />
    </Base>
  );
}

/** Customer — a single person with a contact tag, for the customer directory. */
export function CustomerIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 8.5h5M18 6v5" />
    </Base>
  );
}

export function RolesIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3l7 3v5c0 4.2-2.9 7.6-7 8.9-4.1-1.3-7-4.7-7-8.9V6z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </Base>
  );
}

/** Audit log — a document with a checkmark, for the security trail. */
export function AuditLogIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 14l2 2 3.5-3.5" />
    </Base>
  );
}

/** Keuangan (Finance) — a wallet with a coin. */
export function FinanceIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.5" />
    </Base>
  );
}

/** E-commerce Sync — a shopping bag with a sync arrow loop. */
export function EcommerceSyncIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M9.5 13.5a2.5 2.5 0 0 1 4.3-1.2M14.5 14.5a2.5 2.5 0 0 1-4.3 1.2" />
    </Base>
  );
}

/** Reports — a bar chart on a page. */
export function ReportsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 15v2M12 11v6M16 8v9" />
    </Base>
  );
}

/** Hotel — a building with a bell, for pet boarding. */
export function HotelIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 21V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15" />
      <path d="M16 10h2a2 2 0 0 1 2 2v9M3 21h18" />
      <path d="M8 8h.01M12 8h.01M8 12h.01M12 12h.01M9 21v-3.5h4V21" />
    </Base>
  );
}

/** Sidebar collapse/expand toggle (panel with a rail). */
export function PanelLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Base>
  );
}

/* --------------------------------------------------------------- Inventory */

/** Product & variants — a boxed item with a price tag. */
export function ProductIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 8.5 12 4l8.5 4.5v7L12 20l-8.5-4.5z" />
      <path d="M3.5 8.5 12 13l8.5-4.5" />
      <circle cx="12" cy="9.5" r="1" />
    </Base>
  );
}

/** Category — a folder tab, the label products are filed under. */
export function CategoryIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h3.8a1.5 1.5 0 0 1 1.2.6l1 1.4H19a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.5 11.5h17" />
    </Base>
  );
}

/** Stock card — a ledger with movement lines. */
export function StockCardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8.5h8M8 12h5M8 15.5h8" />
    </Base>
  );
}

/** Batch & expiry — stacked lots with a clock. */
export function BatchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 7 9 4.5 14.5 7 9 9.5z" />
      <path d="M3.5 12 9 14.5 14.5 12M3.5 16.5 9 19l5.5-2.5" />
      <circle cx="18" cy="16" r="4" />
      <path d="M18 14.5V16l1 1" />
    </Base>
  );
}

/** Stock opname — a clipboard with a check. */
export function OpnameIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 13l2 2 4-4" />
    </Base>
  );
}

/** Transfer — goods moving between two locations. */
export function TransferIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 9h13l-3-3M21 15H8l3 3" />
      <rect x="2.5" y="3.5" width="4" height="4" rx="1" />
      <rect x="17.5" y="16.5" width="4" height="4" rx="1" />
    </Base>
  );
}

/**
 * Adjustment — a plus and a minus over a box: a correction that can go either
 * way.
 *
 * Deliberately NOT a pencil or any other edit glyph. The ledger is append-only,
 * and an adjustment adds a row rather than changing one; an icon suggesting
 * otherwise would teach the wrong thing about the module before a user has read
 * a word of the screen.
 */
export function AdjustmentIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 7.5l6-3.5 6 3.5v7l-6 3.5-6-3.5z" />
      <path d="M9 4v14" />
      <path d="M15.5 17.5h5M18 15v5" />
    </Base>
  );
}

/* -------------------------------------------------------------- Purchasing */

/** Purchasing — a shopping bag with a downward arrow (goods coming in). */
export function PurchasingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 8h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 8V5.5a3 3 0 0 1 6 0V8" />
    </Base>
  );
}

/** Supplier — a storefront. */
export function SupplierIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 9.5 5 4.5h14l1.5 5" />
      <path d="M4.5 9.5v10h15v-10" />
      <path d="M3.5 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 2 0" />
      <path d="M9.5 19.5v-5h5v5" />
    </Base>
  );
}

/** Goods receipt — a box with an inbound arrow. */
export function ReceiptIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 10.5 12 6.5l8 4v7l-8 4-8-4z" />
      <path d="M12 2.5v5m0 0-2-2m2 2 2-2" />
    </Base>
  );
}

/** Payables — a banknote with a clock, for "owed and due". */
export function PayableIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.5" y="6" width="15" height="9" rx="1.5" />
      <circle cx="10" cy="10.5" r="2" />
      <circle cx="17.5" cy="16.5" r="4" />
      <path d="M17.5 15v1.5l1 1" />
    </Base>
  );
}

/** Purchase return — goods going back out. */
export function PurchaseReturnIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 10.5 12 6.5l8 4v7l-8 4-8-4z" />
      <path d="M12 7.5v-5m0 0-2 2m2-2 2 2" />
    </Base>
  );
}
