/**
 * Single toggle for the bottom tab bar style.
 *
 * - "floating": detached pill with margins + shadow (modern).
 * - "docked": classic full-width bar attached to the bottom edge.
 *
 * Change this one value to switch styles, no other edits needed.
 */
export type TabBarVariant = "floating" | "docked";

export const TAB_BAR_VARIANT = "floating" as TabBarVariant;

/**
 * Bottom clearance (px) for scroll content inside tab screens.
 * The tab bar floats over content, so lists need extra padding
 * to keep the last items reachable. Docked is shorter than floating.
 */
export const TAB_BAR_CLEARANCE = TAB_BAR_VARIANT === "docked" ? 96 : 120;
