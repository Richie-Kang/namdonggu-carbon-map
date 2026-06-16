export const DEFAULT_FLOOR_HEIGHT_M = 3.2;

export type HeightEstimate = {
  value: number | null;
  estimated: boolean;
};

function finitePositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveBuildingHeight(
  heightM: unknown,
  floorsAbove: unknown,
  floorHeightM = DEFAULT_FLOOR_HEIGHT_M,
): HeightEstimate {
  const measured = finitePositive(heightM);
  if (measured != null) return { value: measured, estimated: false };

  const floors = finitePositive(floorsAbove);
  if (floors != null) {
    return { value: floors * floorHeightM, estimated: true };
  }

  return { value: null, estimated: false };
}
