export function rangeValue(position: number, width: number, max: number) {
  if (![position, width, max].every(Number.isFinite) || width <= 0 || max <= 0) return 0;
  return Math.max(0, Math.min(max, (position / width) * max));
}
