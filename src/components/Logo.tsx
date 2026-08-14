import type { CSSProperties } from "react";

/**
 * Buloo wordmark and icon.
 *
 * Drawn inline as SVG rather than an <img> so it inherits the centralized theme
 * — navy is `fill-primary` / `stroke-primary`, so a theme swap in globals.css
 * restyles the logo too, and the reversed-on-navy case needs no second asset.
 * The source artwork is in public/brand/ and this is a faithful transcription
 * of it; the construction values are fixed (see docs/brand/, §02 Logo).
 *
 * Orange lives on the last `o` only — never on another letter, never on the
 * ear. That single accent is the whole colour budget the logo is allowed.
 */

export interface LogoProps {
  /** Height in pixels; width scales with it. Default 40. */
  size?: number;
  /** Hide the wordmark and render the `b` mark alone. */
  markOnly?: boolean;
  /** Render in white for navy backgrounds. The accent `o` stays orange. */
  reversed?: boolean;
  className?: string;
}

export function Logo({
  size = 40,
  markOnly = false,
  reversed = false,
  className,
}: LogoProps) {
  const style: CSSProperties = { height: size };
  const navy = reversed ? "fill-white" : "fill-primary";
  const navyStroke = reversed ? "stroke-white" : "stroke-primary";

  /**
   * The three sparkles are dropped below 140px wide, per the brand rules — in
   * dense UI they collapse into noise. The wordmark is ~3x as wide as it is
   * tall, so that threshold lands at a height of about 47px.
   */
  const showSparkles = !markOnly && size * 3 >= 140;

  /* The ear: a teardrop, fat lobe hanging down-left, tapering up-right to the
     stem. Asymmetric on purpose — a symmetric ellipse here reads as a leaf. */
  const ear = (
    <path
      d="M0 0 C52 64 58 102 58 142 A58 58 0 1 1 -58 142 C-58 102 -52 64 0 0 Z"
      transform="translate(50 250) rotate(30)"
      className={navy}
    />
  );

  return (
    <span
      className={`inline-flex items-center ${className ?? ""}`}
      aria-label="Buloo"
      role="img"
    >
      {markOnly ? (
        <svg
          viewBox="0 0 547 540"
          style={style}
          className="shrink-0"
          aria-hidden="true"
          focusable="false"
        >
          <g transform="translate(99 0)">
            {ear}
            <g
              fill="none"
              strokeWidth="104"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={navyStroke}
            >
              <path d="M120 72 L120 468" />
              <circle cx="248" cy="340" r="128" />
            </g>
          </g>
        </svg>
      ) : (
        <svg
          viewBox="0 0 1803 600"
          style={style}
          className="shrink-0"
          aria-hidden="true"
          focusable="false"
        >
          <g transform="translate(99 30)">
            {ear}
            <g
              fill="none"
              strokeWidth="104"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={navyStroke}
            >
              <path d="M120 72 L120 468" />
              <circle cx="248" cy="340" r="128" />
              <path d="M528 252 L528 360 A108 108 0 0 0 744 360 L744 252" />
              <path d="M896 72 L896 468" />
              <circle cx="1156" cy="360" r="108" />
            </g>
            {/* The one place the brand stops behaving. */}
            <circle
              cx="1524"
              cy="360"
              r="108"
              fill="none"
              strokeWidth="104"
              className="stroke-secondary"
            />
            {showSparkles && (
              <g
                strokeWidth="26"
                strokeLinecap="round"
                fill="none"
                className="stroke-secondary"
              >
                <path d="M1431 75 L1454 143" />
                <path d="M1524 60 L1524 132" />
                <path d="M1617 75 L1594 143" />
              </g>
            )}
          </g>
        </svg>
      )}
    </span>
  );
}
