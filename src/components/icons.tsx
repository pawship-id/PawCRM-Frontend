import type { SVGProps } from "react";

/**
 * Line icons for navigation and section headers.
 *
 * All draw with `currentColor` and a 24-grid stroke, so they inherit text color
 * (active vs. muted nav state) and size from the surrounding element — no color
 * or fill is hard-coded, keeping them on-theme.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
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

/** Sidebar collapse/expand toggle (panel with a rail). */
export function PanelLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Base>
  );
}

