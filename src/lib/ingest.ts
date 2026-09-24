import { SupabaseClient } from '@supabase/supabase-js';
import {
  EspnEvent,
  EspnGolfEvent,
  EspnStandingsEntry,
  fetchCurrentUfaGames,
  fetchEspnGolfEvents,
  fetchEspnScoreboard,
  fetchEspnTennisMatches,
  UfaGame,
} from './espn';
import { SportKey } from '../types/scoring';

interface SportRow {
  key: SportKey;
  points_per_win: number | null;
  points_per_draw: number | null;
  points_per_overtime_loss: number | null;
  slam_win_bonus: number | null;
  championship_points: number | null;
  semifinal_points: number | null;
  quarterfinal_points: number | null;
}

interface RosterEntryRow {
  id: string;
  external_id: string;
}

// Every ESPN team-sport league splits games into preseason/regular/postseason
// via event.season.type (1/2/3). EPL has no split of this kind (single
// continuous table, no playoff bracket).
const REGULAR_SEASON_ONLY = new Set<SportKey>(['NFL', 'CFB', 'NBA', 'WNBA', 'MLB', 'NHL']);

// Every playoff/bowl game scores exactly like a regular-season game (same
// per-win/draw/OTL rate) -- see the base pointsFor() below, which doesn't
// care what season type a game is. On top of that, teams get a placement
// bonus (championship/semifinal/quarterfinal) for how far they advanced in
// an actual bracket; that part IS tier-only, not cumulative (a champion gets
// the championship bonus once, not the sum of every round). NFL/CFB are
// single-elimination per round, so one game = one round's outcome. NHL/MLB/
// WNBA play best-of-N series -- but ESPN's own `competition.series` field
// tells us directly whether a given game decided the series (see
// isSeriesDecidingGame below), so those don't need any separate series-state
// tracking of our own.
const PLAYOFF_SPORTS = new Set<SportKey>(['NFL', 'CFB', 'NHL', 'MLB', 'WNBA']);

type PlayoffTier = 'quarterfinal' | 'semifinal' | 'championship';

// Matched against ESPN's event.competitions[0].notes[0].headline, the only
// place these leagues label which round a postseason game belongs to.
// Verified against ESPN's real historical brackets (2024 postseasons, since
// those are complete): NFL uses "Wild Card Playoffs" / "Divisional Playoffs"
// / "AFC|NFC Championship" / "Super Bowl <numeral>"; CFB's 12-team playoff
// mixes real bracket games in with dozens of unrelated bowl games in the
// same "week", distinguished only by headlines containing "College Football
// Playoff" -- those unrelated bowl games (Duke's Mayo Bowl, etc.) still
// score their normal per-win points, just never a placement bonus, since
// they're not part of the playoff bracket. NHL uses "1st Round" / "2nd
// Round" / "East|West Final" / "Stanley Cup Final". MLB uses "AL|NLWC" /
// "AL|NLDS" / "AL|NLCS" / "World Series". WNBA uses "First Round" /
// "Semifinals" / "Finals" (only 3 rounds total, unlike the others).
function isRecognizedBracketGame(sportKey: SportKey, headline: string | undefined): boolean {
  if (!headline) return false;
  const h = headline.toLowerCase();
  if (sportKey === 'NFL') return true; // every postseason week is a real playoff game
  if (sportKey === 'CFB') return h.includes('college football playoff');
  if (sportKey === 'NHL' || sportKey === 'MLB' || sportKey === 'WNBA') return true;
  return false;
}

function detectPlayoffTier(sportKey: SportKey, headline: string | undefined): PlayoffTier | null {
  if (!headline) return null;
  const h = headline.toLowerCase();
  if (sportKey === 'NFL') {
    if (h.includes('super bowl')) return 'championship';
    if (h.includes('championship')) return 'semifinal'; // AFC/NFC Championship
    if (h.includes('divisional')) return 'quarterfinal';
    return null; // Wild Card round -- real playoff game, but no tier bonus
  }
  if (sportKey === 'CFB') {
    if (h.includes('national championship')) return 'championship';
    if (h.includes('semifinal')) return 'semifinal';
    if (h.includes('quarterfinal')) return 'quarterfinal';
    return null; // First Round -- no tier bonus
  }
  if (sportKey === 'NHL') {
    if (h.includes('stanley cup final')) return 'championship';
    if (h.includes('final')) return 'semifinal'; // East/West Final -- check before "2nd round"
    if (h.includes('2nd round')) return 'quarterfinal';
    return null; // 1st Round -- no tier bonus
  }
  if (sportKey === 'MLB') {
    if (h.includes('world series')) return 'championship';
    if (h.includes('lcs')) return 'semifinal'; // AL/NLCS
    if (h.includes('ds')) return 'quarterfinal'; // AL/NLDS
    return null; // Wild Card (AL/NLWC) -- no tier bonus
  }
  if (sportKey === 'WNBA') {
    // Check "semifinal" before the bare "final" substring it's contained in.
    if (h.includes('semifinal')) return 'semifinal';
    if (h.includes('final')) return 'championship'; // WNBA Finals
    if (h.includes('first round')) return 'quarterfinal'; // only 3 rounds total
    return null;
  }
  return null;
}

// NHL/MLB/WNBA are best-of-N series; ESPN tags every game in a series with
// a `series` object showing whether that series has been decided yet. Only
// the game where it flips to completed actually determines a team's
// placement -- earlier games in an ongoing series don't decide anything.
// NFL/CFB have no `series` object at all (one game = the whole round), so
// this is always "true" for them.
function isSeriesDecidingGame(competition: EspnEvent['competitions'][number]): boolean {
  return competition.series ? competition.series.completed : true;
}

export interface IngestResult {
  date: string;
  sportKey: SportKey;
  gamesConsidered: number;
  gamesScored: number;
  pointsAwarded: number;
  skippedNoRosterMatch: number;
}

function isOvertime(event: EspnEvent, sportKey: SportKey): boolean {
  if (sportKey !== 'NHL') return false;
  // NHL regulation is 3 periods; anything beyond is OT/shootout.
  const period = (event.status as unknown as { period?: number }).period;
  return typeof period === 'number' && period > 3;
}

export async function ingestDate(
  supabase: SupabaseClient,
  sportKey: SportKey,
  date: string,
  season: string
): Promise<IngestResult> {
  const { data: sport, error: sportError } = await supabase
    .from('sports')
    .select(
      'key, points_per_win, points_per_draw, points_per_overtime_loss, championship_points, semifinal_points, quarterfinal_points'
    )
    .eq('key', sportKey)
    .single<SportRow>();
  if (sportError) throw sportError;
  if (sport.points_per_win == null) {
    throw new Error(`${sportKey} has no points_per_win configured -- not an auto-scored sport`);
  }

  const { data: rosterEntries, error: rosterError } = await supabase
    .from('roster_entries')
    .select('id, external_id')
    .eq('sport_key', sportKey)
    .not('external_id', 'is', null);
  if (rosterError) throw rosterError;

  const rosterByExternalId = new Map<string, RosterEntryRow>(
    (rosterEntries ?? []).map((r) => [r.external_id as string, r as RosterEntryRow])
  );

  const events = await fetchEspnScoreboard(sportKey, date);
  const result: IngestResult = {
    date,
    sportKey,
    gamesConsidered: 0,
    gamesScored: 0,
    pointsAwarded: 0,
    skippedNoRosterMatch: 0,
  };

  const tierPoints = (tier: PlayoffTier): number => {
    if (tier === 'championship') return sport.championship_points ?? 0;
    if (tier === 'semifinal') return sport.semifinal_points ?? 0;
    return sport.quarterfinal_points ?? 0;
  };

  for (const event of events) {
    if (!event.status.type.completed) continue;

    let seasonType: number | undefined;
    if (REGULAR_SEASON_ONLY.has(sportKey)) {
      seasonType = (event as unknown as { season?: { type?: number } }).season?.type;
      if (seasonType !== 2 && seasonType !== 3) continue; // preseason, or unrecognized
    }
    result.gamesConsidered += 1;

    const competition = event.competitions[0];
    const home = competition.competitors.find((c) => c.homeAway === 'home');
    const away = competition.competitors.find((c) => c.homeAway === 'away');
    if (!home || !away || home.score == null || away.score == null) continue;

    const homeScore = Number(home.score);
    const awayScore = Number(away.score);

    // Base win/draw/OTL points -- identical formula whether this is a
    // regular-season game, a playoff game, or (for CFB) an unrelated bowl
    // game. Every completed game counts at the same per-win rate all season.
    const overtime = isOvertime(event, sportKey);
    const draw = homeScore === awayScore;
    const pointsFor = (isWinner: boolean): { points: number; reason: string } => {
      if (draw) return { points: sport.points_per_draw ?? 0, reason: 'draw' };
      if (isWinner) return { points: sport.points_per_win ?? 0, reason: 'win' };
      if (overtime) return { points: sport.points_per_overtime_loss ?? 0, reason: 'otl' };
      return { points: 0, reason: 'loss' };
    };
    const homeResult = pointsFor(homeScore > awayScore);
    const awayResult = pointsFor(awayScore > homeScore);

    // Placement bonus on top, for actual bracket games only -- and only on
    // the game that actually decides a round (for best-of-N series sports,
    // that's whichever game flips `series.completed` to true).
    let playoffTier: PlayoffTier | null = null;
    if (
      seasonType === 3 &&
      PLAYOFF_SPORTS.has(sportKey) &&
      isSeriesDecidingGame(competition) &&
      isRecognizedBracketGame(sportKey, competition.notes?.[0]?.headline)
    ) {
      playoffTier = detectPlayoffTier(sportKey, competition.notes?.[0]?.headline);
    }

    if (playoffTier) {
      const homeWin = homeScore > awayScore;
      if (playoffTier === 'championship') {
        // Highest tier reached, not cumulative -- the runner-up gets credit
        // for reaching the championship game, capped one tier below since
        // there's no separate "runner-up" bonus defined.
        const winnerBonus = tierPoints('championship');
        const runnerupBonus = tierPoints('semifinal');
        if (homeWin) {
          homeResult.points += winnerBonus;
          homeResult.reason += '+championship_win';
          awayResult.points += runnerupBonus;
          awayResult.reason += '+championship_runnerup';
        } else {
          awayResult.points += winnerBonus;
          awayResult.reason += '+championship_win';
          homeResult.points += runnerupBonus;
          homeResult.reason += '+championship_runnerup';
        }
      } else {
        // Quarterfinal/semifinal exit: only the loser's tier is added here --
        // the winner advances, and their eventual result (win it all, or
        // lose a later round) is what determines their bonus.
        const bonus = tierPoints(playoffTier);
        if (homeWin) {
          awayResult.points += bonus;
          awayResult.reason += `+${playoffTier}_exit`;
        } else {
          homeResult.points += bonus;
          homeResult.reason += `+${playoffTier}_exit`;
        }
      }
    }

    const homeEntry = rosterByExternalId.get(home.team.id);
    const awayEntry = rosterByExternalId.get(away.team.id);
    if (!homeEntry && !awayEntry) {
      result.skippedNoRosterMatch += 1;
      continue;
    }

    const { data: game, error: gameError } = await supabase
      .from('games')
      .upsert(
        {
          sport_key: sportKey,
          source: 'espn',
          external_id: event.id,
          season,
          stage: playoffTier ?? 'regular',
          starts_at: event.date,
          status: 'final',
          home_name: home.team.displayName,
          home_score: homeScore,
          away_name: away.team.displayName,
          away_score: awayScore,
        },
        { onConflict: 'sport_key,external_id' }
      )
      .select('id')
      .single();
    if (gameError) throw gameError;

    const pointRows = [];
    if (homeEntry) {
      pointRows.push({
        game_id: game.id,
        roster_entry_id: homeEntry.id,
        points: homeResult.points,
        reason: homeResult.reason,
      });
    }
    if (awayEntry) {
      pointRows.push({
        game_id: game.id,
        roster_entry_id: awayEntry.id,
        points: awayResult.points,
        reason: awayResult.reason,
      });
    }

    if (pointRows.length > 0) {
      const { error: pointsError } = await supabase
        .from('game_points')
        .upsert(pointRows, { onConflict: 'game_id,roster_entry_id' });
      if (pointsError) throw pointsError;
      result.gamesScored += 1;
      result.pointsAwarded += pointRows.reduce((sum, r) => sum + r.points, 0);
    }
  }

  return result;
}

export interface EplChampionResult {
  awarded: boolean;
  reason: string;
}

// EPL has no bracket -- the champion is whoever tops the table once every
// team has played 38 games. There's no single deciding game to hang this on,
// so it's recorded as a synthetic games row (is_standings_result: true) once
// the season is actually over. Upserts on a season-scoped external_id, so
// calling this repeatedly (e.g. every refresh, all season) is harmless.
export async function checkEplChampion(
  supabase: SupabaseClient,
  standings: EspnStandingsEntry[],
  season: string
): Promise<EplChampionResult> {
  if (standings.length === 0) return { awarded: false, reason: 'no standings data' };

  const allComplete = standings.every(
    (e) => e.stats.find((s) => s.name === 'gamesPlayed')?.value === 38
  );
  if (!allComplete) return { awarded: false, reason: 'season not complete yet' };

  const champion = standings.find((e) => e.stats.find((s) => s.name === 'rank')?.value === 1);
  if (!champion) return { awarded: false, reason: 'no rank-1 entry found' };

  const { data: sport, error: sportError } = await supabase
    .from('sports')
    .select('championship_points')
    .eq('key', 'EPL')
    .single();
  if (sportError) throw sportError;

  const { data: rosterEntry, error: rosterError } = await supabase
    .from('roster_entries')
    .select('id')
    .eq('sport_key', 'EPL')
    .eq('external_id', champion.team.id)
    .maybeSingle();
  if (rosterError) throw rosterError;

  const { data: game, error: gameError } = await supabase
    .from('games')
    .upsert(
      {
        sport_key: 'EPL',
        source: 'espn',
        external_id: `epl-champion-${season}`,
        season,
        stage: 'championship',
        status: 'final',
        is_standings_result: true,
        home_name: champion.team.displayName,
        away_name: 'Premier League Table',
      },
      { onConflict: 'sport_key,external_id' }
    )
    .select('id')
    .single();
  if (gameError) throw gameError;

  if (!rosterEntry) return { awarded: false, reason: 'champion is not a rostered team' };

  const { error: pointsError } = await supabase.from('game_points').upsert(
    {
      game_id: game.id,
      roster_entry_id: rosterEntry.id,
      points: sport.championship_points ?? 0,
      reason: 'table_champion',
    },
    { onConflict: 'game_id,roster_entry_id' }
  );
  if (pointsError) throw pointsError;

  return { awarded: true, reason: 'champion crowned' };
}

// Only Grand Slam main-draw rounds are matched against actual tier names --
// verified against ESPN's real 2026 US Open data: "Round 1"-"Round 4",
// "Quarterfinal", "Semifinal", "Final" (plus separate "Qualifying ..."
// rounds, which don't count -- nobody describes reaching "the semifinal of
// a Slam" as including qualifying).
function isMainDrawRound(roundName: string | undefined): boolean {
  return !!roundName && !roundName.toLowerCase().includes('qualifying');
}

function detectTennisTier(roundName: string | undefined): PlayoffTier | null {
  if (!roundName) return null;
  const r = roundName.toLowerCase();
  if (r === 'final') return 'championship';
  if (r === 'semifinal') return 'semifinal';
  if (r === 'quarterfinal') return 'quarterfinal';
  return null;
}

export interface TennisIngestResult {
  date: string;
  matchesConsidered: number;
  matchesScored: number;
  pointsAwarded: number;
}

// Tennis only scores Grand Slam main-draw matches (event.major === true) --
// per the rule ("1 per Slam match win"), non-Slam tour events never count.
// A match win is always 1 point (points_per_win, reused for consistency with
// every other sport); reaching the championship/semifinal/quarterfinal round
// of the *same* Slam draw adds a placement bonus on top, and actually
// winning the whole Slam adds the extra slam_win_bonus on top of that --
// all additive, same model as every other sport.
export async function ingestTennisDate(
  supabase: SupabaseClient,
  tour: 'atp' | 'wta',
  date: string,
  season: string
): Promise<TennisIngestResult> {
  const { data: sport, error: sportError } = await supabase
    .from('sports')
    .select(
      'points_per_win, championship_points, semifinal_points, quarterfinal_points, slam_win_bonus'
    )
    .eq('key', 'TENNIS')
    .single<SportRow>();
  if (sportError) throw sportError;

  const { data: rosterEntries, error: rosterError } = await supabase
    .from('roster_entries')
    .select('id, external_id')
    .eq('sport_key', 'TENNIS')
    .not('external_id', 'is', null);
  if (rosterError) throw rosterError;
  const rosterByExternalId = new Map<string, RosterEntryRow>(
    (rosterEntries ?? []).map((r) => [r.external_id as string, r as RosterEntryRow])
  );

  const matches = await fetchEspnTennisMatches(tour, date);
  const result: TennisIngestResult = {
    date,
    matchesConsidered: 0,
    matchesScored: 0,
    pointsAwarded: 0,
  };

  const tierPoints = (tier: PlayoffTier): number => {
    if (tier === 'championship') return sport.championship_points ?? 0;
    if (tier === 'semifinal') return sport.semifinal_points ?? 0;
    return sport.quarterfinal_points ?? 0;
  };

  for (const match of matches) {
    if (!match.status.type.completed) continue;
    if (!match.major || !isMainDrawRound(match.round?.displayName)) continue;
    result.matchesConsidered += 1;

    const home = match.competitors.find((c) => c.homeAway === 'home');
    const away = match.competitors.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;

    const homeEntry = rosterByExternalId.get(home.id);
    const awayEntry = rosterByExternalId.get(away.id);
    if (!homeEntry && !awayEntry) continue;

    const tier = detectTennisTier(match.round?.displayName);
    const scoreFor = (isWinner: boolean): { points: number; reason: string } => {
      let points = isWinner ? sport.points_per_win ?? 0 : 0;
      let reason = isWinner ? 'win' : 'loss';
      if (tier === 'championship') {
        points += isWinner ? tierPoints('championship') + (sport.slam_win_bonus ?? 0) : tierPoints('semifinal');
        reason += isWinner ? '+championship_win' : '+championship_runnerup';
      } else if (tier && !isWinner) {
        points += tierPoints(tier);
        reason += `+${tier}_exit`;
      }
      return { points, reason };
    };

    const homeResult = scoreFor(Boolean(home.winner));
    const awayResult = scoreFor(Boolean(away.winner));

    const { data: game, error: gameError } = await supabase
      .from('games')
      .upsert(
        {
          sport_key: 'TENNIS',
          source: 'espn',
          external_id: match.id,
          season,
          stage: tier ?? 'regular',
          starts_at: match.date,
          status: 'final',
          home_name: home.athlete.displayName,
          away_name: away.athlete.displayName,
        },
        { onConflict: 'sport_key,external_id' }
      )
      .select('id')
      .single();
    if (gameError) throw gameError;

    const pointRows = [];
    if (homeEntry) {
      pointRows.push({
        game_id: game.id,
        roster_entry_id: homeEntry.id,
        points: homeResult.points,
        reason: homeResult.reason,
      });
    }
    if (awayEntry) {
      pointRows.push({
        game_id: game.id,
        roster_entry_id: awayEntry.id,
        points: awayResult.points,
        reason: awayResult.reason,
      });
    }
    if (pointRows.length > 0) {
      const { error: pointsError } = await supabase
        .from('game_points')
        .upsert(pointRows, { onConflict: 'game_id,roster_entry_id' });
      if (pointsError) throw pointsError;
      result.matchesScored += 1;
      result.pointsAwarded += pointRows.reduce((sum, r) => sum + r.points, 0);
    }
  }

  return result;
}

function parseGolfScore(score: string | undefined): number | null {
  if (!score) return null;
  if (score.toUpperCase() === 'E') return 0;
  const n = Number(score);
  return Number.isNaN(n) ? null : n; // null covers CUT/WD/DQ and anything else non-numeric
}

type GolfPlacementReason = 'win' | 'runner_up' | 'top_ten';

// Winner(s) = best score. Runner-up(s) = best score among everyone else.
// Top ten = anyone at or better than the 10th-best distinct score. All
// three are tie-inclusive (a 3-way tie for the lead means 3 winners), and a
// winner/runner-up doesn't also separately count as "top ten" -- only the
// single highest-tier placement applies.
function computeGolfPlacements(
  competitors: EspnGolfEvent['competitors']
): Map<string, GolfPlacementReason> {
  const scored = competitors
    .map((c) => ({ id: c.id, score: parseGolfScore(c.score) }))
    .filter((c): c is { id: string; score: number } => c.score !== null)
    .sort((a, b) => a.score - b.score);

  const placements = new Map<string, GolfPlacementReason>();
  if (scored.length === 0) return placements;

  const bestScore = scored[0].score;
  const winners = scored.filter((c) => c.score === bestScore);
  for (const w of winners) placements.set(w.id, 'win');

  const rest = scored.filter((c) => c.score !== bestScore);
  if (rest.length > 0) {
    const runnerUpScore = rest[0].score;
    for (const r of rest.filter((c) => c.score === runnerUpScore)) placements.set(r.id, 'runner_up');
  }

  const distinctScores = Array.from(new Set(scored.map((c) => c.score))).sort((a, b) => a - b);
  const topTenThreshold = distinctScores[Math.min(9, distinctScores.length - 1)];
  for (const c of scored) {
    if (!placements.has(c.id) && c.score <= topTenThreshold) placements.set(c.id, 'top_ten');
  }

  return placements;
}

export interface GolfIngestResult {
  date: string;
  eventsConsidered: number;
  playersScored: number;
  pointsAwarded: number;
}

// Golf has no per-win/per-game scoring at all -- only placement in one of
// the season's 12 designated events (4 majors + 8 Signature Events; see
// golf_scoring_events, which is season-scoped data since the exact list
// changes every year). Everything else on the PGA Tour schedule (regular
// tour stops) scores nothing.
export async function ingestGolfDate(
  supabase: SupabaseClient,
  date: string,
  season: string
): Promise<GolfIngestResult> {
  const { data: sport, error: sportError } = await supabase
    .from('sports')
    .select('championship_points, runner_up_points, top_ten_points')
    .eq('key', 'PGA')
    .single();
  if (sportError) throw sportError;

  const { data: rosterEntries, error: rosterError } = await supabase
    .from('roster_entries')
    .select('id, external_id')
    .eq('sport_key', 'PGA')
    .not('external_id', 'is', null);
  if (rosterError) throw rosterError;
  const rosterByExternalId = new Map<string, RosterEntryRow>(
    (rosterEntries ?? []).map((r) => [r.external_id as string, r as RosterEntryRow])
  );

  const { data: qualifyingEvents, error: eventsError } = await supabase
    .from('golf_scoring_events')
    .select('event_name')
    .eq('season', season);
  if (eventsError) throw eventsError;
  const qualifyingNames = new Set((qualifyingEvents ?? []).map((e) => e.event_name));

  const events = await fetchEspnGolfEvents(date);
  const result: GolfIngestResult = {
    date,
    eventsConsidered: 0,
    playersScored: 0,
    pointsAwarded: 0,
  };

  const pointsFor = (reason: GolfPlacementReason): number => {
    if (reason === 'win') return sport.championship_points ?? 0;
    if (reason === 'runner_up') return sport.runner_up_points ?? 0;
    return sport.top_ten_points ?? 0;
  };

  for (const event of events) {
    if (!event.status.type.completed) continue;
    if (!qualifyingNames.has(event.name)) continue; // regular tour stop, doesn't count
    result.eventsConsidered += 1;

    const placements = computeGolfPlacements(event.competitors);
    const pointRows: { game_id: string; roster_entry_id: string; points: number; reason: string }[] =
      [];
    for (const competitor of event.competitors) {
      const rosterEntry = rosterByExternalId.get(competitor.id);
      if (!rosterEntry) continue;
      const reason = placements.get(competitor.id);
      if (!reason) continue; // finished, but outside the top 10
      pointRows.push({
        game_id: '', // filled in after the games upsert below
        roster_entry_id: rosterEntry.id,
        points: pointsFor(reason),
        reason,
      });
    }
    if (pointRows.length === 0) continue;

    const { data: game, error: gameError } = await supabase
      .from('games')
      .upsert(
        {
          sport_key: 'PGA',
          source: 'espn',
          external_id: event.id,
          season,
          stage: 'championship',
          status: 'final',
          home_name: event.name,
          away_name: 'Leaderboard',
        },
        { onConflict: 'sport_key,external_id' }
      )
      .select('id')
      .single();
    if (gameError) throw gameError;

    for (const row of pointRows) row.game_id = game.id;
    const { error: pointsError } = await supabase
      .from('game_points')
      .upsert(pointRows, { onConflict: 'game_id,roster_entry_id' });
    if (pointsError) throw pointsError;
    result.playersScored += pointRows.length;
    result.pointsAwarded += pointRows.reduce((sum, r) => sum + r.points, 0);
  }

  return result;
}

export interface UfaIngestResult {
  gamesConsidered: number;
  gamesScored: number;
  pointsAwarded: number;
}

// UFA's regular season (5 per win) is scored the same way every other sport
// is. On top of that, per confirmed 2026 structure (expected to hold for
// 2027): week-15 is the quarterfinal round, and week-16 contains both the
// semifinals and the championship, distinguished only by date -- the latest
// game in week-16 is the final, the earlier one(s) are the semifinals. Same
// additive/highest-tier model as every other sport. Never backfilled; only
// games on/after tracking_start_date (and strictly before today) count.
function detectUfaTier(allGames: UfaGame[], game: UfaGame): PlayoffTier | null {
  if (game.week === 'week-15') return 'quarterfinal';
  if (game.week === 'week-16') {
    const week16Dates = allGames
      .filter((g) => g.week === 'week-16')
      .map((g) => g.startTimestamp.slice(0, 10));
    const maxDate = week16Dates.reduce((a, b) => (a > b ? a : b));
    return game.startTimestamp.slice(0, 10) === maxDate ? 'championship' : 'semifinal';
  }
  return null;
}

export async function ingestUfaCurrent(
  supabase: SupabaseClient,
  todayStr: string,
  trackingStartDate: string
): Promise<UfaIngestResult> {
  const { data: sport, error: sportError } = await supabase
    .from('sports')
    .select('points_per_win, championship_points, semifinal_points, quarterfinal_points')
    .eq('key', 'UFA')
    .single();
  if (sportError) throw sportError;

  const { data: rosterEntries, error: rosterError } = await supabase
    .from('roster_entries')
    .select('id, external_id')
    .eq('sport_key', 'UFA')
    .not('external_id', 'is', null);
  if (rosterError) throw rosterError;
  const rosterByExternalId = new Map<string, RosterEntryRow>(
    (rosterEntries ?? []).map((r) => [r.external_id as string, r as RosterEntryRow])
  );

  const games = await fetchCurrentUfaGames();
  const result: UfaIngestResult = { gamesConsidered: 0, gamesScored: 0, pointsAwarded: 0 };
  const pointsPerWin = sport.points_per_win ?? 0;
  const tierPoints = (tier: PlayoffTier): number => {
    if (tier === 'championship') return sport.championship_points ?? 0;
    if (tier === 'semifinal') return sport.semifinal_points ?? 0;
    return sport.quarterfinal_points ?? 0;
  };

  for (const game of games) {
    if (game.status !== 'Final') continue;
    const dateStr = game.startTimestamp.slice(0, 10);
    if (dateStr === todayStr || dateStr < trackingStartDate) continue;
    result.gamesConsidered += 1;

    const homeEntry = rosterByExternalId.get(game.homeTeamID);
    const awayEntry = rosterByExternalId.get(game.awayTeamID);
    if (!homeEntry && !awayEntry) continue;

    const homeWin = game.homeScore > game.awayScore;
    const homeResult = { points: homeWin ? pointsPerWin : 0, reason: homeWin ? 'win' : 'loss' };
    const awayResult = { points: !homeWin ? pointsPerWin : 0, reason: !homeWin ? 'win' : 'loss' };

    const tier = detectUfaTier(games, game);
    if (tier === 'championship') {
      const winnerBonus = tierPoints('championship');
      const runnerupBonus = tierPoints('semifinal');
      if (homeWin) {
        homeResult.points += winnerBonus;
        homeResult.reason += '+championship_win';
        awayResult.points += runnerupBonus;
        awayResult.reason += '+championship_runnerup';
      } else {
        awayResult.points += winnerBonus;
        awayResult.reason += '+championship_win';
        homeResult.points += runnerupBonus;
        homeResult.reason += '+championship_runnerup';
      }
    } else if (tier) {
      const bonus = tierPoints(tier);
      if (homeWin) {
        awayResult.points += bonus;
        awayResult.reason += `+${tier}_exit`;
      } else {
        homeResult.points += bonus;
        homeResult.reason += `+${tier}_exit`;
      }
    }

    const { data: dbGame, error: gameError } = await supabase
      .from('games')
      .upsert(
        {
          sport_key: 'UFA',
          source: 'ufastats',
          external_id: game.gameID,
          season: game.startTimestamp.slice(0, 4),
          stage: tier ?? 'regular',
          starts_at: game.startTimestamp,
          status: 'final',
          home_name: game.homeTeamName,
          home_score: game.homeScore,
          away_name: game.awayTeamName,
          away_score: game.awayScore,
        },
        { onConflict: 'sport_key,external_id' }
      )
      .select('id')
      .single();
    if (gameError) throw gameError;

    const pointRows = [];
    if (homeEntry) {
      pointRows.push({
        game_id: dbGame.id,
        roster_entry_id: homeEntry.id,
        points: homeResult.points,
        reason: homeResult.reason,
      });
    }
    if (awayEntry) {
      pointRows.push({
        game_id: dbGame.id,
        roster_entry_id: awayEntry.id,
        points: awayResult.points,
        reason: awayResult.reason,
      });
    }
    if (pointRows.length > 0) {
      const { error: pointsError } = await supabase
        .from('game_points')
        .upsert(pointRows, { onConflict: 'game_id,roster_entry_id' });
      if (pointsError) throw pointsError;
      result.gamesScored += 1;
      result.pointsAwarded += pointRows.reduce((sum, r) => sum + r.points, 0);
    }
  }

  return result;
}
