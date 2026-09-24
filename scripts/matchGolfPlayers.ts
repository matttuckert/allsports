// Matches PGA roster_entries to ESPN athlete ids. There's no rankings/player
// list endpoint for golf (unlike tennis), so the candidate pool is built by
// pulling several large-field 2026 leaderboards (majors + signature events)
// and combining them -- our drafted golfers are all pros who've played in at
// least one of these this season.
//
// Usage: npm run match-golf-players
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

// A handful of 2026 events with large fields, spread across the season, to
// maximize coverage of our drafted golfers.
const SAMPLE_DATES = ['20260409', '20260514', '20260618', '20260507', '20260625', '20260716'];

interface EspnGolfer {
  id: string;
  displayName: string;
}

async function fetchLeaderboardPlayers(date: string): Promise<EspnGolfer[]> {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${date}`
  );
  if (!res.ok) throw new Error(`ESPN request failed (${res.status})`);
  const data = await res.json();
  const players: EspnGolfer[] = [];
  for (const event of data.events ?? []) {
    for (const competitor of event.competitions?.[0]?.competitors ?? []) {
      players.push({ id: competitor.id, displayName: competitor.athlete.displayName });
    }
  }
  return players;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Common nicknames used in the draft sheet that won't match ESPN's full
// legal-name records.
const ALIASES: [RegExp, string][] = [[/\bCam\b/gi, 'Cameron']];

function applyAliases(name: string): string {
  let out = name;
  for (const [pattern, replacement] of ALIASES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function findMatches(rosterName: string, players: EspnGolfer[]): EspnGolfer[] {
  const targets = [normalize(rosterName), normalize(applyAliases(rosterName))];
  return players.filter((p) => targets.includes(normalize(p.displayName)));
}

async function main() {
  const byId = new Map<string, EspnGolfer>();
  for (const date of SAMPLE_DATES) {
    const players = await fetchLeaderboardPlayers(date);
    for (const p of players) byId.set(p.id, p);
  }
  const allPlayers = Array.from(byId.values());
  console.log(`Loaded ${allPlayers.length} distinct golfers across ${SAMPLE_DATES.length} events.`);

  const { data: entries, error } = await supabase
    .from('roster_entries')
    .select('id, name')
    .eq('sport_key', 'PGA')
    .is('external_id', null);
  if (error) throw error;

  let matched = 0;
  const unresolved: { name: string; candidates: string[] }[] = [];

  for (const entry of entries ?? []) {
    const matches = findMatches(entry.name, allPlayers);
    if (matches.length === 1) {
      const { error: updateError } = await supabase
        .from('roster_entries')
        .update({ external_id: matches[0].id })
        .eq('id', entry.id);
      if (updateError) throw updateError;
      matched += 1;
      console.log(`  "${entry.name}" -> ${matches[0].displayName} (${matches[0].id})`);
    } else {
      unresolved.push({ name: entry.name, candidates: matches.map((m) => `${m.displayName} (${m.id})`) });
    }
  }

  console.log(`\nMatched ${matched} golfers.`);
  if (unresolved.length > 0) {
    console.log(`${unresolved.length} UNRESOLVED (need manual fix):`);
    for (const u of unresolved) {
      console.log(`  "${u.name}" ->`, u.candidates.length ? u.candidates : 'no candidates found');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
