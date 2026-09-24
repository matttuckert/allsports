// Pushes src/data/scoringRules.ts and src/data/rosters.ts into Supabase.
// Those TS files are the source of truth; this script just syncs the DB to match.
//
// Usage: npm run seed
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (service role key
// bypasses RLS -- never ship it in the app, only use it from this script).

import { createClient } from '@supabase/supabase-js';
import { SCORING_RULES } from '../src/data/scoringRules';
import { ROSTERS } from '../src/data/rosters';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

// Sports with no automated data source -- games/points for these are entered manually.
const MANUALLY_SCORED_SPORTS = new Set<string>();

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seedSports() {
  const rows = Object.values(SCORING_RULES).map((rule) => ({
    key: rule.sport,
    label: rule.label,
    regular_season_description: rule.regularSeasonDescription,
    points_per_win: rule.pointsPerWin ?? null,
    points_per_draw: rule.pointsPerDraw ?? null,
    points_per_overtime_loss: rule.pointsPerOvertimeLoss ?? null,
    slam_win_bonus: rule.slamWinBonus ?? null,
    championship_points: rule.championshipPoints,
    semifinal_points: rule.semifinalPoints ?? null,
    quarterfinal_points: rule.quarterfinalPoints ?? null,
    prior_season_champion_points: rule.priorSeasonChampionPoints,
    prior_season_middle_points: rule.priorSeasonMiddlePoints,
    prior_season_last_points: rule.priorSeasonLastPoints,
    is_automated: !MANUALLY_SCORED_SPORTS.has(rule.sport),
  }));

  const { error } = await supabase.from('sports').upsert(rows, { onConflict: 'key' });
  if (error) throw error;
  console.log(`Seeded ${rows.length} sports.`);
}

async function seedRosters() {
  for (const roster of ROSTERS) {
    const { data: gm, error: gmError } = await supabase
      .from('gms')
      .upsert({ name: roster.gm }, { onConflict: 'name' })
      .select('id')
      .single();
    if (gmError) throw gmError;

    const entries = roster.picks.map((pick) => ({
      gm_id: gm.id,
      sport_key: pick.sport,
      round: pick.round,
      name: pick.name,
    }));

    const { error: entriesError } = await supabase
      .from('roster_entries')
      .upsert(entries, { onConflict: 'gm_id,sport_key' });
    if (entriesError) throw entriesError;
  }
  console.log(`Seeded ${ROSTERS.length} GM rosters.`);
}

async function main() {
  await seedSports();
  await seedRosters();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
