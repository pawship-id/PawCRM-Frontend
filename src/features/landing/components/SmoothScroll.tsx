"use client";

import { useEffect } from "react";

/**
 * Turns the document's in-page anchors smooth while the landing page is open.
 *
 * RENDERS NOTHING. `scroll-behavior` has to sit on the scrolling box — `html` —
 * and a wrapper `<div>` with `scroll-smooth` on it does nothing at all, which is
 * the trap this component exists to avoid. Setting it from here rather than in
 * `globals.css` keeps it off every other route: the App Router scrolls to the
 * top on navigation, and a document-wide smooth behaviour would turn each of
 * those into a visible glide up the dashboard.
 *
 * The attribute only ARMS the rule; whether it applies is the media query's
 * call, in `globals.css` — somebody who asked for reduced motion still gets the
 * jump, and nothing here has to ask them.
 *
 * REMOVED ON UNMOUNT, so clicking Masuk leaves the app exactly as it found it.
 */
export function SmoothScroll() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.smoothScroll = "";

    return () => {
      delete root.dataset.smoothScroll;
    };
  }, []);

  return null;
}
