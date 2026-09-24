-- All-sports fantasy league schema.
-- Data is seeded separately (see scripts/seed.ts) from src/data/scoringRules.ts
-- and src/data/rosters.ts, so those TypeScript files stay the single source of truth.

create table sports (
  key text primary key,
  label text not null,
  regular_season_description text not null,
  championship_points numeric not null,
  semifinal_points numeric,
  quarterfinal_points numeric,
  prior_season_champion_points numeric not null,
  prior_season_middle_points numeric not null,
  prior_season_last_points numeric not null,
  -- false for sports api-sports.io doesn't cover (PGA, Tennis, UFA) -- results are entered manually.
  is_automated boolean not null default true
);

create table gms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table roster_entries (
  id uuid primary key default gen_random_uuid(),
  gm_id uuid not null references gms(id) on delete cascade,
  sport_key text not null references sports(key),
  round int not null,
  name text not null,
  unique (gm_id, sport_key),
  unique (sport_key, name)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  sport_key text not null references sports(key),
  source text not null check (source in ('api-sports', 'manual')),
  external_id text,
  season text not null,
  stage text not null default 'regular' check (stage in ('regular', 'quarterfinal', 'semifinal', 'championship')),
  starts_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  home_name text not null,
  home_score int,
  away_name text not null,
  away_score int,
  created_at timestamptz not null default now(),
  unique (sport_key, external_id)
);

create table game_points (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  roster_entry_id uuid not null references roster_entries(id) on delete cascade,
  points numeric not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (game_id, roster_entry_id)
);

-- Total points per GM, across every roster entry's game_points.
create view standings as
select
  g.id as gm_id,
  g.name as gm_name,
  coalesce(sum(gp.points), 0) as total_points
from gms g
left join roster_entries re on re.gm_id = g.id
left join game_points gp on gp.roster_entry_id = re.id
group by g.id, g.name
order by total_points desc;

-- Points accumulated by each individual roster entry (one row per drafted team/player).
create view roster_entry_points as
select
  re.id as roster_entry_id,
  re.gm_id,
  g.name as gm_name,
  re.sport_key,
  re.name,
  re.round,
  coalesce(sum(gp.points), 0) as total_points
from roster_entries re
join gms g on g.id = re.gm_id
left join game_points gp on gp.roster_entry_id = re.id
group by re.id, re.gm_id, g.name, re.sport_key, re.name, re.round;

-- Games joined against the roster entries they scored points for -- this is what
-- powers the "game results" panel, which only shows games involving a rostered
-- team/player and labels how many points it earned.
create view roster_games as
select
  gm.id as game_id,
  gm.sport_key,
  gm.season,
  gm.stage,
  gm.starts_at,
  gm.status,
  gm.home_name,
  gm.home_score,
  gm.away_name,
  gm.away_score,
  gp.roster_entry_id,
  gp.points,
  gp.reason,
  re.gm_id,
  g.name as gm_name,
  re.name as rostered_name
from games gm
join game_points gp on gp.game_id = gm.id
join roster_entries re on re.id = gp.roster_entry_id
join gms g on g.id = re.gm_id;

alter table sports enable row level security;
alter table gms enable row level security;
alter table roster_entries enable row level security;
alter table games enable row level security;
alter table game_points enable row level security;

-- Friend-group app with no per-user login: every row is readable by anyone with
-- the anon key. Writes only happen server-side via the service role key
-- (daily ingest job, manual entry), which bypasses RLS entirely.
create policy "public read" on sports for select using (true);
create policy "public read" on gms for select using (true);
create policy "public read" on roster_entries for select using (true);
create policy "public read" on games for select using (true);
create policy "public read" on game_points for select using (true);
