// Pulls completed games from ESPN and scores them into game_points.
//
// Usage:
//   npm run ingest                                    # today, all auto-scored sports (daily job)
//   npm run ingest -- --sport NFL --from 2026-09-08 --to 2026-09-23   # backfill a range
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.

import { createClient } from '@supabase/supabase-js';
import { ingestDate } from '../src/lib/ingest';
import { ESPN_LEAGUES } from '../src/lib/espn';
import { SportKey } from '../src/types/scoring';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { sport: get('--sport') as SportKey | undefined, from: get('--from'), to: get('--to') };
}

function toYyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function seasonYearFor(sportKey: SportKey, date: Date): string {
  // EPL's season spans two calendar years (e.g. 2026-27); everything else
  // is a single year.
  if (sportKey === 'EPL') {
    const year = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return String(date.getUTCFullYear());
}

function* dateRange(from: Date, to: Date): Generator<Date> {
  const cur = new Date(from);
  while (cur <= to) {
    yield new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

async function run() {
  const { sport, from, to } = parseArgs();
  const sports: SportKey[] = sport ? [sport] : (Object.keys(ESPN_LEAGUES) as SportKey[]);
  const today = new Date();
  const fromDate = from ? new Date(`${from}T00:00:00Z`) : today;
  const toDate = to ? new Date(`${to}T00:00:00Z`) : today;

  for (const sportKey of sports) {
    let totals = { gamesConsidered: 0, gamesScored: 0, pointsAwarded: 0, skippedNoRosterMatch: 0 };
    for (const date of dateRange(fromDate, toDate)) {
      const dateStr = toYyyymmdd(date);
      try {
        const result = await ingestDate(supabase, sportKey, dateStr, seasonYearFor(sportKey, date));
        totals.gamesConsidered += result.gamesConsidered;
        totals.gamesScored += result.gamesScored;
        totals.pointsAwarded += result.pointsAwarded;
        totals.skippedNoRosterMatch += result.skippedNoRosterMatch;
        if (result.gamesConsidered > 0) {
          console.log(
            `[${sportKey} ${dateStr}] considered=${result.gamesConsidered} scored=${result.gamesScored} points=${result.pointsAwarded} noRosterMatch=${result.skippedNoRosterMatch}`
          );
        }
      } catch (err) {
        console.error(`[${sportKey} ${dateStr}] FAILED:`, err);
      }
    }
    console.log(`== ${sportKey} totals ==`, totals);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
