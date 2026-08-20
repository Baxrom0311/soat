export function elapsedSince(isoDate: string): string {
  const created = new Date(isoDate).getTime();
  if (Number.isNaN(created)) return '';

  const diffMs = Date.now() - created;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return `${diffSec} soniya`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} daqiqa`;

  const diffHour = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return remMin > 0 ? `${diffHour} soat ${remMin} daq` : `${diffHour} soat`;
}
