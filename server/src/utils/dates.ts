// Guatemala has no daylight saving time: UTC-6 all year.
const GT_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Start of the given civil day (YYYY-MM-DD) in Guatemala, as a UTC Date. */
export function gtDayStart(isoDate: string): Date {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + GT_OFFSET_MS);
}

/** Exclusive end of the given civil day in Guatemala, as a UTC Date. */
export function gtDayEnd(isoDate: string): Date {
  return new Date(gtDayStart(isoDate).getTime() + 24 * 60 * 60 * 1000);
}

/** Today's civil date in Guatemala (YYYY-MM-DD). */
export function gtToday(now: Date = new Date()): string {
  return new Date(now.getTime() - GT_OFFSET_MS).toISOString().slice(0, 10);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
