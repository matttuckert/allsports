import { supabase } from './supabase';
import {
  ESPN_LEAGUES,
  fetchEspnGolfEvents,
  fetchEspnScoreboard,
  fetchEspnStandings,
  fetchEspnTennisMatches,
  fetchUfaGamesForWeek,
  fetchUfaWeeks,
  UfaGame,
} from './espn';
import { SportKey } from '../types/scoring';

function toYyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function seasonYearFor(sportKey: SportKey, date: Date): string {
  if (sportKey === 'EPL') {
    const year = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return String(date.getUTCFullYear());
}

export interface SportRefreshResult {
  gamesConsidered?: number;
  gamesScored?: number;
  pointsAwarded?: number;
  skipped?: string;
  error?: string;
  eplChampion?: { awarded: boolean; reason: string };
  // Tennis-specific naming (matches vs games), same shape otherwise.
  matchesConsidered?: number;
  matchesScored?: number;
  // Golf-specific naming (tournaments/players, not games).
  eventsConsidered?: number;
  playersScored?: number;
}

export type RefreshSummary = Partial<Record<SportKey, SportRefreshResult>>;

export interface RefreshOutcome {
  skipped?: 'refreshed-recently';
  summary?: RefreshSummary;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Fetches ESPN scoreboards directly from this device (a normal phone/carrier
 * IP -- ESPN's Akamai WAF blocks cloud hosts, but not this), then hands the
 * raw events to the daily-ingest edge function, which does the actual
 * scoring and writes with the service-role key.
 *
 * Throttled to once an hour, checked against the shared `ingest_state` row
 * (not per-device storage) so every GM's pull-to-refresh is subject to the
 * same clock -- this is only a fast client-side bail-out to skip the ESPN
 * fetches below when we already know the server will reject it; the
 * daily-ingest function re-checks and enforces the same window atomically,
 * since it's the actual trust boundary.
 *
 * Fetches all the way through today, not just yesterday -- a completed early
 * game should show up the same day it ends, not the next one. This is safe
 * because "today" is never persisted to a sport's last_synced_date watermark
 * (see below) -- only a fully-elapsed day ever is -- so today's scoreboard
 * gets re-fetched from scratch on every single refresh for as long as it
 * remains today. If ESPN hasn't finalized a game's data yet at fetch time,
 * or its status isn't completed yet (the ingest function only scores events
 * where event.status.type.completed is true), it's simply picked up on the
 * next refresh -- nothing about today is ever "locked in" and skipped for
 * good. Only looks as far back as each sport's tracking_start_date -- NFL/
 * CFB/EPL are backfilled from their real season start; every other sport
 * only ever picks up games from the day this tracking started forward.
 */
export async function refreshRecentScores(): Promise<RefreshOutcome> {
  const { data: state } = await supabase
    .from('ingest_state')
    .select('last_run_at')
    .eq('key', 'global')
    .maybeSingle();

  const now = new Date();
  if (state?.last_run_at && now.getTime() - new Date(state.last_run_at).getTime() < ONE_HOUR_MS) {
    return { skipped: 'refreshed-recently' };
  }

  const { data: sportRows, error: sportsError } = await supabase
    .from('sports')
    .select('key, tracking_start_date, last_synced_date')
    .not('tracking_start_date', 'is', null);
  if (sportsError) throw sportsError;

  const sportsPayload: Record<
    string,
    { events: unknown[]; season: string; standings?: unknown[] }
  > = {};

  for (const row of sportRows ?? []) {
    const sportKey = row.key as SportKey;
    if (!(sportKey in ESPN_LEAGUES)) continue;

    const floor = new Date(`${row.tracking_start_date}T00:00:00Z`);
    const since = row.last_synced_date ? new Date(`${row.last_synced_date}T00:00:00Z`) : floor;
    const from = since > floor ? since : floor;
    if (from > now) continue; // nothing new to fetch for this sport yet

    const events: unknown[] = [];
    for (let d = new Date(from); d <= now; d = addDays(d, 1)) {
      const dayEvents = await fetchEspnScoreboard(sportKey, toYyyymmdd(d));
      events.push(...dayEvents);
    }
    sportsPayload[sportKey] = { events, season: seasonYearFor(sportKey, now) };

    // EPL has no playoff bracket -- the champion is decided by the final
    // table, not a game, so it needs the standings alongside the events.
    if (sportKey === 'EPL') {
      sportsPayload[sportKey].standings = await fetchEspnStandings(sportKey);
    }
  }

  // Tennis is shaped nothing like team sports (individual athletes, two
  // separate tours), so it's fetched and sent as its own top-level field
  // rather than joining the sportsPayload loop above.
  let tennisMatches: { matches: unknown[]; season: string } | undefined;
  const tennisRow = (sportRows ?? []).find((r) => r.key === 'TENNIS');
  if (tennisRow) {
    const floor = new Date(`${tennisRow.tracking_start_date}T00:00:00Z`);
    const since = tennisRow.last_synced_date
      ? new Date(`${tennisRow.last_synced_date}T00:00:00Z`)
      : floor;
    const from = since > floor ? since : floor;
    if (from <= now) {
      const matches: unknown[] = [];
      for (let d = new Date(from); d <= now; d = addDays(d, 1)) {
        const dateStr = toYyyymmdd(d);
        const [atp, wta] = await Promise.all([
          fetchEspnTennisMatches('atp', dateStr),
          fetchEspnTennisMatches('wta', dateStr),
        ]);
        matches.push(...atp, ...wta);
      }
      tennisMatches = { matches, season: String(now.getUTCFullYear()) };
    }
  }

  // Golf has no teams either -- a tournament leaderboard, not a game -- so
  // like tennis it's fetched and sent as its own top-level field.
  let golfEvents: { events: unknown[]; season: string } | undefined;
  const golfRow = (sportRows ?? []).find((r) => r.key === 'PGA');
  if (golfRow) {
    const floor = new Date(`${golfRow.tracking_start_date}T00:00:00Z`);
    const since = golfRow.last_synced_date
      ? new Date(`${golfRow.last_synced_date}T00:00:00Z`)
      : floor;
    const from = since > floor ? since : floor;
    if (from <= now) {
      const events: unknown[] = [];
      for (let d = new Date(from); d <= now; d = addDays(d, 1)) {
        const dayEvents = await fetchEspnGolfEvents(toYyyymmdd(d));
        events.push(...dayEvents);
      }
      golfEvents = { events, season: String(now.getUTCFullYear()) };
    }
  }

  // UFA has no ESPN coverage; its API is queried by week, not date. The
  // weeks listing itself flags which week is still underway (current: true)
  // -- that one is always re-fetched in full, same "never watermark today"
  // pattern as every other sport above -- plus any earlier week whose
  // lastGameStartTimestamp is newer than last_synced_date, so a week that
  // was missed entirely (app not opened for a while) gets backfilled instead
  // of silently skipped.
  let ufaGames: { games: UfaGame[]; currentWeek: string | null } | undefined;
  const ufaRow = (sportRows ?? []).find((r) => r.key === 'UFA');
  if (ufaRow) {
    const weeks = await fetchUfaWeeks();
    const since = ufaRow.last_synced_date ? new Date(`${ufaRow.last_synced_date}T00:00:00Z`) : null;
    const currentWeek = weeks.find((w) => w.current)?.week ?? null;
    const weeksToFetch = weeks.filter(
      (w) => w.current || !since || new Date(w.lastGameStartTimestamp) > since
    );

    const games: UfaGame[] = [];
    for (const week of weeksToFetch) {
      games.push(...(await fetchUfaGamesForWeek(week.week)));
    }
    if (games.length > 0) {
      ufaGames = { games, currentWeek };
    }
  }

  if (Object.keys(sportsPayload).length === 0 && !tennisMatches && !golfEvents && !ufaGames) {
    return { summary: {} };
  }

  const { data, error } = await supabase.functions.invoke<RefreshSummary>('daily-ingest', {
    body: { sports: sportsPayload, tennisMatches, golfEvents, ufaGames },
  });
  if (error) throw error;
  return { summary: data ?? {} };
}
