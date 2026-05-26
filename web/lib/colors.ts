export type RGB = [number, number, number];

export const QUINTILE_RGB: Record<1 | 2 | 3 | 4 | 5, RGB> = {
  1: [22, 163, 74],
  2: [132, 204, 22],
  3: [234, 179, 8],
  4: [249, 115, 22],
  5: [220, 38, 38],
};

export const UNKNOWN_RGB: RGB = [156, 163, 175];

// reason: deck.gl getFillColor expects [r,g,b,a]; alpha shown lower for unknown.
export function quintileRGBA(q: number | null | undefined, alpha = 200): [number, number, number, number] {
  if (q == null || q < 1 || q > 5) {
    return [...UNKNOWN_RGB, Math.min(alpha, 80)];
  }
  const rgb = QUINTILE_RGB[q as 1 | 2 | 3 | 4 | 5];
  return [...rgb, alpha];
}

export function quintileOfValue(value: number, breakpoints: [number, number, number, number]): 1 | 2 | 3 | 4 | 5 {
  // breakpoints: 4 thresholds for 5 buckets (q20, q40, q60, q80)
  if (value <= breakpoints[0]) return 1;
  if (value <= breakpoints[1]) return 2;
  if (value <= breakpoints[2]) return 3;
  if (value <= breakpoints[3]) return 4;
  return 5;
}
