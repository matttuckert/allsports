-- Per-sport ingest tracking:
--  - tracking_start_date: earliest date this sport is ever allowed to fetch.
--    NFL/CFB/EPL get their real season start (full backfill). Every other
--    automated sport gets "today" (the day this policy was introduced) --
--    no backfill, only games from here forward.
--  - last_synced_date: the most recent date we've successfully processed.
--    Null means "never run yet"; the ingest job falls back to
--    tracking_start_date.
-- The ingest job additionally always stops at yesterday -- today's games are
-- never fetched, so a game is only ever ingested once its day is fully over
-- and final, never while it's still in progress.
alter table sports add column tracking_start_date date;
alter table sports add column last_synced_date date;

update sports set tracking_start_date = '2026-09-09' where key = 'NFL';
update sports set tracking_start_date = '2026-08-29' where key = 'CFB';
update sports set tracking_start_date = '2026-08-21' where key = 'EPL';
update sports set tracking_start_date = '2026-09-23' where key in ('NBA', 'WNBA', 'MLB', 'NHL');

-- NFL/CFB/EPL are already backfilled through today via the initial ingest.
update sports set last_synced_date = '2026-09-23' where key in ('NFL', 'CFB', 'EPL');

-- Single global row: guards against the ingest job running more than once
-- per calendar day (a double-tap on the refresh button, or two GMs tapping
-- it around the same time, should only do the work once).
create table ingest_state (
  key text primary key default 'global',
  last_run_at timestamptz
);
insert into ingest_state (key) values ('global');

alter table ingest_state enable row level security;
create policy "public read" on ingest_state for select using (true);
