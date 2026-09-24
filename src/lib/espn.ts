import { SportKey } from '../types/scoring';

// ESPN's undocumented site API -- no key, no quota, but no SLA either.
// https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/...
export const ESPN_LEAGUES: Partial<Record<SportKey, { sport: string; league: string }>> = {
  NFL: { sport: 'football', league: 'nfl' },
  CFB: { sport: 'football', league: 'college-football' },
  EPL: { sport: 'soccer', league: 'eng.1' },
  NBA: { sport: 'basketball', league: 'nba' },
  WNBA: { sport: 'basketball', league: 'wnba' },
  MLB: { sport: 'baseball', league: 'mlb' },
  NHL: { sport: 'hockey', league: 'nhl' },
};

export interface EspnTeam {
  id: string;
  displayName: string;
  shortDisplayName: string;
  location: string;
  name: string;
  abbreviation: string;
  slug: string;
}

export interface EspnCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  team: EspnTeam;
  score?: string;
  winner?: boolean;
}

export interface EspnEvent {
  id: string;
  date: string;
  shortName: string;
  status: {
    type: {
      completed: boolean;
      state: 'pre' | 'in' | 'post';
      name: string;
    };
  };
  competitions: {
    competitors: EspnCompetitor[];
    notes?: { headline: string }[];
    series?: { completed: boolean };
  }[];
}

export interface EspnStandingsEntry {
  team: { id: string; displayName: string };
  stats: { name: string; value: number }[];
}

async function espnGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}`, {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  if (!res.ok) {
    throw new Error(`ESPN request failed (${res.status}): ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchEspnTeams(sportKey: SportKey): Promise<EspnTeam[]> {
  const cfg = ESPN_LEAGUES[sportKey];
  if (!cfg) throw new Error(`No ESPN league mapping for ${sportKey}`);
  const limit = cfg.league === 'college-football' ? 1000 : 100;
  const data = await espnGet<{ sports: { leagues: { teams: { team: EspnTeam }[] }[] }[] }>(
    `${cfg.sport}/${cfg.league}/teams?limit=${limit}`
  );
  return data.sports[0].leagues[0].teams.map((t) => t.team);
}

/** date: YYYYMMDD */
export async function fetchEspnScoreboard(sportKey: SportKey, date: string): Promise<EspnEvent[]> {
  const cfg = ESPN_LEAGUES[sportKey];
  if (!cfg) throw new Error(`No ESPN league mapping for ${sportKey}`);
  const data = await espnGet<{ events: EspnEvent[] }>(
    `${cfg.sport}/${cfg.league}/scoreboard?dates=${date}`
  );
  return data.events ?? [];
}

// EPL has no bracket -- the champion is whoever tops the table once every
// team has played 38 games. This lives on a different ESPN path/shape than
// the scoreboard endpoint (apis/v2, not apis/site/v2).
export async function fetchEspnStandings(sportKey: SportKey): Promise<EspnStandingsEntry[]> {
  const cfg = ESPN_LEAGUES[sportKey];
  if (!cfg) throw new Error(`No ESPN league mapping for ${sportKey}`);
  const res = await fetch(
    `https://site.api.espn.com/apis/v2/sports/${cfg.sport}/${cfg.league}/standings`,
    { headers: { 'Accept-Encoding': 'gzip' } }
  );
  if (!res.ok) throw new Error(`ESPN standings request failed (${res.status})`);
  const data = await res.json();
  return data.children?.[0]?.standings?.entries ?? [];
}

// Tennis is shaped completely differently from team sports: individual
// athletes instead of teams, and events nest tournament -> grouping (Men's/
// Women's Singles) -> individual matches, rather than one flat list of
// games. Flattened here so the ingest job can treat it like any other list
// of completed matches.
export interface EspnTennisMatch {
  id: string;
  date: string;
  status: { type: { completed: boolean } };
  round?: { displayName: string };
  major: boolean;
  competitors: {
    // The athlete's ESPN id lives here, not on `athlete` (which has no id
    // field of its own -- verified against real match data).
    id: string;
    homeAway: 'home' | 'away';
    winner?: boolean;
    athlete: { displayName: string };
  }[];
}

// UFA (Ultimate Frisbee) has no ESPN coverage at all, but
// backend.ufastats.com -- the undocumented API behind the official
// watchufa.com stats pages -- works directly, no key needed. It's queried
// by week, not by date, and `?current` always returns whichever week is
// most recently underway/completed, which is exactly what "what's new since
// last refresh" needs -- no day-by-day iteration required.
export interface UfaGame {
  gameID: string;
  awayTeamID: string;
  awayTeamName: string;
  homeTeamID: string;
  homeTeamName: string;
  awayScore: number;
  homeScore: number;
  status: string;
  week: string;
  startTimestamp: string;
}

export async function fetchCurrentUfaGames(): Promise<UfaGame[]> {
  const res = await fetch('https://www.backend.ufastats.com/web-v1/games?current');
  if (!res.ok) throw new Error(`UFA request failed (${res.status})`);
  const data = await res.json();
  return data.games ?? [];
}

// The games endpoint requires a `week` param -- passing one that doesn't
// exist returns an empty games list, but (undocumented, verified against the
// real API) still includes the full `weeks` array as a side effect, which is
// otherwise not exposed by any dedicated endpoint. That's exactly what's
// needed to backfill weeks a refresh might have missed: each entry's
// `lastGameStartTimestamp` says when that week wrapped up, and `current`
// flags whichever week is still underway (if any).
export interface UfaWeek {
  week: string;
  current: boolean;
  lastGameStartTimestamp: string;
}

export async function fetchUfaWeeks(): Promise<UfaWeek[]> {
  const res = await fetch('https://www.backend.ufastats.com/web-v1/games?week=__nonexistent__');
  if (!res.ok) throw new Error(`UFA request failed (${res.status})`);
  const data = await res.json();
  return data.weeks ?? [];
}

export async function fetchUfaGamesForWeek(week: string): Promise<UfaGame[]> {
  const res = await fetch(
    `https://www.backend.ufastats.com/web-v1/games?week=${encodeURIComponent(week)}`
  );
  if (!res.ok) throw new Error(`UFA request failed (${res.status})`);
  const data = await res.json();
  return data.games ?? [];
}

// Golf has no home/away teams -- a tournament's own leaderboard is the
// competition, one entry per golfer, ranked by score (more negative is
// better). Which tournaments actually count is data (see
// golf_scoring_events), not something ESPN tells us -- only the major
// championships and Tour-designated Signature Events are worth points here.
export interface EspnGolfEvent {
  id: string;
  name: string;
  status: { type: { completed: boolean } };
  competitors: {
    // The athlete's ESPN id lives here, not on `athlete` (which has no id
    // field of its own -- verified against real leaderboard data).
    id: string;
    athlete: { displayName: string };
    score?: string;
  }[];
}

export async function fetchEspnGolfEvents(date: string): Promise<EspnGolfEvent[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${date}`,
    { headers: { 'Accept-Encoding': 'gzip' } }
  );
  if (!res.ok) throw new Error(`ESPN golf request failed (${res.status})`);
  const data = await res.json();
  return (data.events ?? []).map(
    (e: { id: string; name: string; status: EspnGolfEvent['status']; competitions: { competitors: EspnGolfEvent['competitors'] }[] }) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      competitors: e.competitions[0].competitors,
    })
  );
}

export async function fetchEspnTennisMatches(
  tour: 'atp' | 'wta',
  date: string
): Promise<EspnTennisMatch[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${date}`,
    { headers: { 'Accept-Encoding': 'gzip' } }
  );
  if (!res.ok) throw new Error(`ESPN tennis request failed (${res.status})`);
  const data = await res.json();
  const matches: EspnTennisMatch[] = [];
  for (const event of data.events ?? []) {
    for (const grouping of event.groupings ?? []) {
      for (const competition of grouping.competitions ?? []) {
        matches.push({ ...competition, major: Boolean(event.major) });
      }
    }
  }
  return matches;
}
