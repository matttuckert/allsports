// Matches TENNIS roster_entries to ESPN athlete ids, pulled from the ATP and
// WTA rankings endpoints (300 players total -- everyone drafted is a top
// player, so rankings cover the whole field; there's no simple "list all
// players" endpoint the way team sports have a teams list).
//
// Usage: npm run match-tennis-players
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

interface EspnPlayer {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  tour: 'atp' | 'wta';
}

async function fetchRankedPlayers(tour: 'atp' | 'wta'): Promise<EspnPlayer[]> {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/rankings`);
  if (!res.ok) throw new Error(`ESPN rankings request failed (${res.status}) for ${tour}`);
  const data = await res.json();
  const ranks = data.rankings?.[0]?.ranks ?? [];
  return ranks.map((r: { athlete: { id: string; displayName: string; firstName: string; lastName: string } }) => ({
    id: r.athlete.id,
    displayName: r.athlete.displayName,
    firstName: r.athlete.firstName,
    lastName: r.athlete.lastName,
    tour,
  }));
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Simple Levenshtein distance, for the handful of roster names that are
// slightly misspelled versions of the real player name (e.g. "Caboli" vs
// "Cobolli", "Mira" vs "Mirra").
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Common nicknames used in the draft sheet that won't match ESPN's full
// legal-name records.
const ALIASES: [RegExp, string][] = [[/\bJess\b/gi, 'Jessica']];

function applyAliases(name: string): string {
  let out = name;
  for (const [pattern, replacement] of ALIASES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function findMatches(rosterName: string, players: EspnPlayer[]): EspnPlayer[] {
  const targets = [normalize(rosterName), normalize(applyAliases(rosterName))];
  const exact = players.filter((p) => {
    const full = normalize(p.displayName);
    const last = normalize(p.lastName);
    return targets.some((t) => t === full || t === last);
  });
  if (exact.length > 0) return exact;

  // Roster name could be "First Last" with a typo in either part, or just
  // "Last" alone. Compare against both the full name and the last name.
  return players.filter((p) => {
    const full = normalize(p.displayName);
    const last = normalize(p.lastName);
    return targets.some(
      (t) => editDistance(t, full) <= 2 || (t.length >= 4 && editDistance(t, last) <= 2)
    );
  });
}

async function main() {
  const [atp, wta] = await Promise.all([fetchRankedPlayers('atp'), fetchRankedPlayers('wta')]);
  const allPlayers = [...atp, ...wta];
  console.log(`Loaded ${atp.length} ATP + ${wta.length} WTA ranked players.`);

  const { data: entries, error } = await supabase
    .from('roster_entries')
    .select('id, name')
    .eq('sport_key', 'TENNIS')
    .is('external_id', null);
  if (error) throw error;

  let matched = 0;
  const unresolved: { name: string; candidates: string[] }[] = [];

  for (const entry of entries ?? []) {
    const matches = findMatches(entry.name, allPlayers);
    if (matches.length === 1) {
      const { error: updateError } = await supabase
        .from('roster_entries')
        .update({ external_id: matches[0].id, external_league_id: matches[0].tour })
        .eq('id', entry.id);
      if (updateError) throw updateError;
      matched += 1;
      console.log(`  "${entry.name}" -> ${matches[0].displayName} (${matches[0].tour}, ${matches[0].id})`);
    } else {
      unresolved.push({
        name: entry.name,
        candidates: matches.map((m) => `${m.displayName} (${m.tour}, ${m.id})`),
      });
    }
  }

  console.log(`\nMatched ${matched} tennis players.`);
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
