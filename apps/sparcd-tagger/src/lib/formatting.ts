// Display formatting for the full ISO 8601 UTC timestamps stored in media.csv
// col 4 (`2026-09-11T13:24:00.000Z`). Pure slice/split on the string — no Date
// math, no timezone conversion, so a displayed value always matches what a
// user would type back into PerImageTime's edit box.

export type DateFormat = 'iso' | 'us' | 'eu';
export type TimeFormat = '24h' | '12h';

/** Reformats the `YYYY-MM-DD` portion of a full ISO timestamp. */
export function formatDate(iso: string, fmt: DateFormat): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  switch (fmt) {
    case 'us':
      return `${m}/${d}/${y}`;
    case 'eu':
      return `${d}/${m}/${y}`;
    default:
      return `${y}-${m}-${d}`;
  }
}

/** Reformats the `HH:MM` (or `HH:MM:SS` with `seconds: true`) portion of a
 *  full ISO timestamp. */
export function formatTime(iso: string, fmt: TimeFormat, opts?: { seconds?: boolean }): string {
  const time = opts?.seconds ? iso.slice(11, 19) : iso.slice(11, 16);
  if (fmt === '24h') return time;
  const [hStr, m, s] = time.split(':');
  const h = Number(hStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return s !== undefined ? `${h12}:${m}:${s} ${period}` : `${h12}:${m} ${period}`;
}

export function formatDateTime(
  iso: string,
  dateFmt: DateFormat,
  timeFmt: TimeFormat,
  opts?: { seconds?: boolean },
): string {
  return `${formatDate(iso, dateFmt)} ${formatTime(iso, timeFmt, opts)}`;
}
