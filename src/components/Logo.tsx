import type { CSSProperties } from "react";

/**
 * PawShip brand mark + wordmark.
 *
 * Drawn inline as SVG rather than an <img> so it inherits the centralized
 * theme: the paw pads use `fill-secondary` and the wordmark uses `text-primary`,
 * so rebranding through the tokens in globals.css restyles the logo too — no
 * separate asset to regenerate.
 */

export interface LogoProps {
  /** Height in pixels; width scales with it. Default 40. */
  size?: number;
  /** Hide the wordmark and render the paw mark alone. */
  markOnly?: boolean;
  className?: string;
}

export function Logo({ size = 40, markOnly = false, className }: LogoProps) {
  const style: CSSProperties = { height: size };

  return (
    <span
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
      aria-label="PawShip"
      role="img"
    >
      <svg
        viewBox="0 0 64 64"
        style={style}
        className="shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        {/* Three toe beans + one lead bean across the top */}
        <ellipse cx="20" cy="20" rx="6.5" ry="8.5" className="fill-secondary" />
        <ellipse cx="32" cy="13" rx="7" ry="9" className="fill-secondary" />
        <ellipse cx="44" cy="20" rx="6.5" ry="8.5" className="fill-secondary" />
        {/* Main pad */}
        <path
          d="M32 30c-9 0-16 6.5-16 15.5C16 53 22 56 27 53l5-3 5 3c5 3 11 0 11-7.5C48 36.5 41 30 32 30z"
          className="fill-secondary"
        />
      </svg>
      {!markOnly && (
        <span
          className="text-primary font-semibold tracking-tight"
          style={{ fontSize: size * 0.55 }}
        >
          PawShip
        </span>
      )}
    </span>
  );
}
