export const ALL = 'ALL';

export type DatePreset = 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30';

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'LAST_7', label: 'Last 7 days' },
  { key: 'LAST_30', label: 'Last 30 days' },
];

// A "postseason result" is any credit carrying a placement bonus (reaching
// the championship/semifinal/quarterfinal, across MLB/WNBA/CFB/NFL/NHL) or
// the EPL table-champion entry -- not just games tagged is_standings_result,
// which only ever applies to that one EPL case.
export type EventTypeFilter = 'BOTH' | 'REGULAR' | 'POSTSEASON';

export const EVENT_TYPE_OPTIONS: { key: EventTypeFilter; label: string }[] = [
  { key: 'BOTH', label: 'All' },
  { key: 'REGULAR', label: 'Regular Games' },
  { key: 'POSTSEASON', label: 'Postseason Results' },
];

export function isPlacementReason(reason: string): boolean {
  return (
    reason.includes('championship') ||
    reason.includes('semifinal_exit') ||
    reason.includes('quarterfinal_exit') ||
    reason === 'table_champion'
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Local time, not UTC -- a late-night US game (e.g. Sunday Night Football)
// falls on the next UTC day, which would otherwise show/filter as the wrong
// date for everyone watching in a US timezone.
export function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number): Date {
  const d = toDateOnly(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

export function dateRangeFor(preset: DatePreset): [Date, Date] | null {
  switch (preset) {
    case 'TODAY':
      return [daysAgo(0), daysAgo(0)];
    case 'YESTERDAY':
      return [daysAgo(1), daysAgo(1)];
    case 'LAST_7':
      return [daysAgo(7), daysAgo(0)];
    case 'LAST_30':
      return [daysAgo(30), daysAgo(0)];
    case 'ALL':
    default:
      return null;
  }
}

export function formatGameDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
