// Progress → colour scale.
// Interpolates a project's progress bar from CORAL (low) through amber to TEAL (100%).
// Priority skews the curve: CRITICAL/HIGH projects stay red longer at low progress,
// LOW-priority projects warm up to amber/green sooner. At 100% everything is green.

const PRIORITY_EXPONENT: Record<string, number> = {
  CRITICAL: 1.7,  // stays deep red at low progress
  HIGH:     1.35,
  MEDIUM:   1.0,
  LOW:      0.8,  // eases toward amber/green a little sooner
};

/**
 * Returns an HSL colour string for a progress bar.
 * @param pct      completion percentage 0–100
 * @param priority CRITICAL | HIGH | MEDIUM | LOW (defaults MEDIUM)
 *
 *  0%   → red (hue 0)         100% → green (hue 120)
 *  CRITICAL @ <10% → deep red; LOW @ <10% → red-orange.
 */
export function progressColor(pct: number, priority: string = 'MEDIUM'): string {
  const p = Math.max(0, Math.min(100, pct ?? 0)) / 100;
  const exp = PRIORITY_EXPONENT[priority] ?? 1;
  const eased = Math.pow(p, exp);
  // Was `hsl(hue 78% 45%)` sweeping hue 0→120: pure red to pure green at near-maximum
  // saturation. Two problems. It was the loudest thing on any page it appeared on, louder
  // than the numbers it was describing. And a scale whose entire meaning is carried by red
  // versus green is unreadable for the ~8% of men with a deficiency in exactly that pair.
  //
  // Now it runs coral → amber → teal, which separates by LIGHTNESS as well as hue, so it
  // still reads as a scale in greyscale. Saturation and lightness travel with the hue so
  // both ends belong to the same family as the rest of the palette.
  const hue = Math.round(6 + eased * 164);          // 6 = coral … 170 = teal
  const sat = Math.round(58 + eased * 10);
  const light = Math.round(56 - eased * 14);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/**
 * The unfilled portion. Now a NEUTRAL, not a tint of the fill.
 *
 * A track tinted to match its bar means a bar at 5% sits on a track that is already almost
 * the same colour, so the reader cannot see where the fill ends — the one thing the control
 * exists to show. A neutral track makes the fill legible at every value.
 */
export function progressTrack(_pct?: number, _priority?: string): string {
  return 'rgba(16, 24, 40, 0.07)';
}
