/**
 * One palette for every chart in the product.
 *
 * The charts were coloured with Google's 2014 Material hexes — #1a73e8, #34a853, #fbbc04,
 * #ea4335. Those four are probably the most recognisable colours on the web, and they date a
 * screen instantly: they read as somebody else's brand, and they are pitched at a saturation
 * that fights the data rather than describing it.
 *
 * These are built as a family: one lightness band, one saturation band, spaced far enough
 * apart in hue to stay separable — including for the ~8% of men with red/green colour
 * blindness, which is why nothing here depends on telling red from green alone.
 */

/** Categorical series, in the order they should be used. Blue first: it is the brand. */
export const SERIES = [
  '#3d8de2', // brand blue
  '#8b7bf0', // violet
  '#16a394', // teal
  '#e8a33d', // amber
  '#e8695f', // coral
  '#7f93ad', // slate
  '#59b8e8', // sky
  '#c079d8', // orchid
] as const;

/**
 * Status colours. Kept SEPARATE from the categorical series on purpose: a colour that means
 * "on hold" must never also be series #4 on an unrelated chart, or the reader learns a
 * meaning that is false half the time.
 */
export const STATUS = {
  ACTIVE:    '#16a394',
  COMPLETED: '#3d8de2',
  ON_HOLD:   '#e8a33d',
  PLANNING:  '#8b7bf0',
  CANCELLED: '#e8695f',
  CLOSED:    '#7f93ad',
  ARCHIVED:  '#b6c0cc',
} as const;

/** Severity, low to high. Ordered by saturation as well as hue, so it reads greyscale too. */
export const PRIORITY = {
  LOW:      '#7f93ad',
  MEDIUM:   '#e8a33d',
  HIGH:     '#e8825f',
  CRITICAL: '#dc4b45',
} as const;

/**
 * Chart chrome. Gridlines sit at the low end — visible enough to read a value against,
 * quiet enough that the line is what you see. Heavy dashed grids are the single biggest
 * reason a chart looks like a spreadsheet.
 */
export const AXIS = {
  grid: 'rgba(16, 24, 40, 0.06)',
  tick: '#8493a8',
  tickSize: 11,
  cursor: 'rgba(16, 24, 40, 0.04)',
  empty: '#eaeef3',
} as const;

/** Recharts tooltip styling — a card, not the default white rectangle with a hard border. */
export const TOOLTIP = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid rgba(16,24,40,0.07)',
    boxShadow: '0 4px 6px -2px rgb(16 24 40 / 0.05), 0 12px 24px -4px rgb(16 24 40 / 0.09)',
    fontSize: 12,
    padding: '8px 10px',
  },
  labelStyle: { color: '#16202E', fontWeight: 600, marginBottom: 2 },
  itemStyle: { padding: 0 },
} as const;

/** A soft vertical fade under an area series. Pass the id to `fill="url(#id)"`. */
export function areaGradient(id: string, color: string) {
  return { id, color };
}
