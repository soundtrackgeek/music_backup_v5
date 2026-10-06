import { type ReactNode } from "react";

export function addRangeChip(
  chips: { key: string; label: ReactNode; remove: () => void }[],
  key: string,
  label: string,
  minimum: number | null,
  maximum: number | null,
  remove: () => void,
  suffix = "",
) {
  if (minimum == null && maximum == null) return;
  const formatValue = (value: number) => `${value}${suffix}`;
  const text =
    minimum != null && maximum != null
      ? `${label} ${formatValue(minimum)}-${formatValue(maximum)}`
      : minimum != null
        ? `${label} >= ${formatValue(minimum)}`
        : `${label} <= ${formatValue(maximum ?? 0)}`;
  chips.push({ key, label: text, remove });
}
