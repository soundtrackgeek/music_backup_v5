import { type KeyboardEvent } from "react";

export function clampRatio(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizedValue(
  value: number | null | undefined,
  min: number,
  max: number,
) {
  if (value == null || !Number.isFinite(value) || max <= min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function numericExtent<T>(
  rows: T[],
  value: (row: T) => number | null | undefined,
) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  rows.forEach((row) => {
    const nextValue = value(row);
    if (nextValue == null || !Number.isFinite(nextValue)) return;
    min = Math.min(min, nextValue);
    max = Math.max(max, nextValue);
  });
  return Number.isFinite(min) && Number.isFinite(max)
    ? { min, max }
    : { min: 0, max: 1 };
}

export function heatmapColor(value: number | null | undefined) {
  const ratio = clampRatio(value);
  const lightness = 94 - ratio * 43;
  return `hsl(174 62% ${lightness}%)`;
}

export function discoveryKeyOpen(event: KeyboardEvent, onOpen: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onOpen();
  }
}
