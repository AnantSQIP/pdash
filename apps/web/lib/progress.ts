// Progress → colour scale.
// Interpolates a project's progress bar from RED (low) through AMBER to GREEN (100%).
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
  const hue = Math.round(eased * 120); // 0 = red … 120 = green
  return `hsl(${hue} 78% 45%)`;
}

/** Soft track tint matching the progress colour (for the unfilled portion). */
export function progressTrack(pct: number, priority: string = 'MEDIUM'): string {
  const p = Math.max(0, Math.min(100, pct ?? 0)) / 100;
  const exp = PRIORITY_EXPONENT[priority] ?? 1;
  const hue = Math.round(Math.pow(p, exp) * 120);
  return `hsl(${hue} 60% 94%)`;
}
