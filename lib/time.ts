// All times are UTC Date objects internally. Devin returns unix seconds (docs/api-notes.md §4).

export const MINUTE_MS = 60_000;

export const fromUnixSeconds = (s: number | null | undefined): Date | null => (s === null || s === undefined ? null : new Date(s * 1000));

export const addMinutes = (d: Date, minutes: number): Date => new Date(d.getTime() + minutes * MINUTE_MS);

export const minutesBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / MINUTE_MS);

export const isoUtc = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** "2 h 05 min" / "45 min" — for reports and the UI. */
export function formatDuration(from: Date, to: Date): string {
  const total = Math.max(0, minutesBetween(from, to));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
