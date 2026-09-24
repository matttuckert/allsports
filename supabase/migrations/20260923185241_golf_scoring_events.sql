-- Golf only scores the 4 majors + 8 Signature Events (12 total) -- everything
-- else on the PGA Tour schedule scores nothing. Which tournaments qualify
-- changes every season (sponsor renames, Tour restructuring the Signature
-- Event list, etc.), so this is data to update each year, not code to
-- redeploy. Match against event.name from ESPN's PGA scoreboard/calendar.
create table golf_scoring_events (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  event_name text not null,
  tier text not null check (tier in ('major', 'signature')),
  unique (season, event_name)
);

alter table golf_scoring_events enable row level security;
create policy "authenticated read" on golf_scoring_events for select using (auth.role() = 'authenticated');

-- Runner-up/top-ten bonuses, alongside the existing championship_points
-- (already 15, doubling as the "major/signature win" bonus).
alter table sports add column runner_up_points numeric;
alter table sports add column top_ten_points numeric;
-- Not backfilled (same policy as every other sport added after NFL/CFB/EPL):
-- tracked from today forward only.
update sports
set runner_up_points = 10, top_ten_points = 5, tracking_start_date = '2026-09-23'
where key = 'PGA';

insert into golf_scoring_events (season, event_name, tier) values
  ('2026', 'Masters Tournament', 'major'),
  ('2026', 'PGA Championship', 'major'),
  ('2026', 'U.S. Open', 'major'),
  ('2026', 'The Open', 'major'),
  ('2026', 'AT&T Pebble Beach Pro-Am', 'signature'),
  ('2026', 'The Genesis Invitational', 'signature'),
  ('2026', 'Arnold Palmer Invitational pres. by Mastercard', 'signature'),
  ('2026', 'RBC Heritage', 'signature'),
  ('2026', 'Cadillac Championship', 'signature'),
  ('2026', 'Truist Championship', 'signature'),
  ('2026', 'the Memorial Tournament pres. by Workday', 'signature'),
  ('2026', 'Travelers Championship', 'signature');
