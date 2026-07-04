export function numberValue(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampBackupRetention(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 3;
  return Math.min(50, Math.max(1, Math.round(value)));
}

