// Day numbers: integers counting days since DAY0 (1 Jan 2025, UTC).
// Everything in the dataset uses them, so ranges and ageing are plain subtraction.

const DAY0_MS = Date.UTC(2025, 0, 1);
const MS_PER_DAY = 86_400_000;

export const TODAY = dayFromParts(2026, 9, 22);

export function dayFromParts(year: number, month: number, date: number): number {
  return Math.round((Date.UTC(year, month - 1, date) - DAY0_MS) / MS_PER_DAY);
}

export function toDate(day: number): Date {
  return new Date(DAY0_MS + day * MS_PER_DAY);
}

export function parts(day: number): { year: number; month: number; date: number; weekday: number } {
  const d = toDate(day);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, date: d.getUTCDate(), weekday: d.getUTCDay() };
}

export function startOfMonth(day: number): number {
  const p = parts(day);
  return dayFromParts(p.year, p.month, 1);
}

/** Same day-of-month one month earlier, clamped to the end of that month. */
export function sameDayLastMonth(day: number): number {
  const p = parts(day);
  const year = p.month === 1 ? p.year - 1 : p.year;
  const month = p.month === 1 ? 12 : p.month - 1;
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return dayFromParts(year, month, Math.min(p.date, lastDate));
}
