// Matches UFA roster_entries to backend.ufastats.com team ids (an
// undocumented but functional API behind the official watchufa.com stats
// pages -- confirmed working directly, no key needed).
//
// Usage: npm run match-ufa-teams
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

interface UfaTeam {
  teamID: string;
  teamName: string;
}

async function fetchUfaTeams(): Promise<UfaTeam[]> {
  const res = await fetch('https://www.backend.ufastats.com/web-v1/team-stats?limit=50');
  if (!res.ok) throw new Error(`UFA request failed (${res.status})`);
  const data = await res.json();
  return data.stats ?? [];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findMatches(rosterName: string, teams: UfaTeam[]): UfaTeam[] {
  const target = normalize(rosterName);
  // Roster names are usually "City Nickname" or just "Nickname" -- the
  // nickname alone should always be a substring, and matches uniquely.
  return teams.filter((t) => target.includes(normalize(t.teamName)));
}

async function main() {
  const teams = await fetchUfaTeams();
  console.log(`Loaded ${teams.length} UFA teams.`);

  const { data: entries, error } = await supabase
    .from('roster_entries')
    .select('id, name')
    .eq('sport_key', 'UFA')
    .is('external_id', null);
  if (error) throw error;

  let matched = 0;
  const unresolved: { name: string; candidates: string[] }[] = [];

  for (const entry of entries ?? []) {
    const matches = findMatches(entry.name, teams);
    if (matches.length === 1) {
      const { error: updateError } = await supabase
        .from('roster_entries')
        .update({ external_id: matches[0].teamID })
        .eq('id', entry.id);
      if (updateError) throw updateError;
      matched += 1;
      console.log(`  "${entry.name}" -> ${matches[0].teamName} (${matches[0].teamID})`);
    } else {
      unresolved.push({ name: entry.name, candidates: matches.map((m) => `${m.teamName} (${m.teamID})`) });
    }
  }

  console.log(`\nMatched ${matched} UFA teams.`);
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
