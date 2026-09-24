// Matches roster_entries (for the 7 ESPN-automated sports) to ESPN team ids,
// so the ingest job knows which games belong to which GM's roster.
//
// Usage: npm run match-teams
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.

import { createClient } from '@supabase/supabase-js';
import { ESPN_LEAGUES, EspnTeam, fetchEspnTeams } from '../src/lib/espn';
import { SportKey } from '../src/types/scoring';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Known shorthand used in the draft sheet that won't literally appear in
// ESPN's team names/locations.
const ALIASES: [RegExp, string][] = [
  [/\bLA\b/gi, 'Los Angeles'],
  [/\bNY\b/gi, 'New York'],
  [/\bNJ\b/gi, 'New Jersey'],
  [/\bTB\b/gi, 'Tampa Bay'],
  [/\bLV\b/gi, 'Las Vegas'],
  [/\bMan\b/gi, 'Manchester'],
  [/\bCincy\b/gi, 'Cincinnati'],
  [/\bCavs\b/gi, 'Cavaliers'],
  [/\bECU\b/gi, 'East Carolina'],
  [/\bUGA\b/gi, 'Georgia'],
  [/\bUMiami\b/gi, 'Miami'],
  [/\bUmass\b/gi, 'Massachusetts'],
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function candidateStrings(team: EspnTeam): string[] {
  return [
    team.displayName,
    team.name,
    team.location,
    team.shortDisplayName,
    team.abbreviation,
    team.slug.replace(/-/g, ' '),
    `${team.location} ${team.name}`,
  ].map(normalize);
}

function applyAliases(name: string): string {
  let out = name;
  for (const [pattern, replacement] of ALIASES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function findMatches(rosterName: string, teams: EspnTeam[]): EspnTeam[] {
  const targets = [normalize(rosterName), normalize(applyAliases(rosterName))];
  const exact = teams.filter((t) => {
    const candidates = candidateStrings(t);
    return targets.some((target) => candidates.includes(target));
  });
  if (exact.length > 0) return exact;

  // Fall back to substring containment (e.g. "LSU Tigers" vs "Louisiana State Tigers").
  return teams.filter((t) => {
    const candidates = candidateStrings(t);
    return targets.some((target) =>
      candidates.some((c) => c.length >= 4 && (c.includes(target) || target.includes(c)))
    );
  });
}

async function main() {
  const sports = Object.keys(ESPN_LEAGUES) as SportKey[];
  const unresolved: { sport: SportKey; name: string; candidates: string[] }[] = [];
  let matched = 0;

  for (const sport of sports) {
    const teams = await fetchEspnTeams(sport);
    const { data: entries, error } = await supabase
      .from('roster_entries')
      .select('id, name')
      .eq('sport_key', sport)
      .is('external_id', null);
    if (error) throw error;

    for (const entry of entries ?? []) {
      const matches = findMatches(entry.name, teams);
      if (matches.length === 1) {
        const { error: updateError } = await supabase
          .from('roster_entries')
          .update({ external_id: matches[0].id, external_league_id: ESPN_LEAGUES[sport]!.league })
          .eq('id', entry.id);
        if (updateError) throw updateError;
        matched += 1;
      } else {
        unresolved.push({
          sport,
          name: entry.name,
          candidates: matches.map((m) => `${m.displayName} (${m.id})`),
        });
      }
    }
  }

  console.log(`Matched ${matched} roster entries.`);
  if (unresolved.length > 0) {
    console.log(`\n${unresolved.length} UNRESOLVED (need manual fix):`);
    for (const u of unresolved) {
      console.log(`  [${u.sport}] "${u.name}" ->`, u.candidates.length ? u.candidates : 'no candidates found');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
