-- Maps a roster entry (team or player, as drafted) to its api-sports.io
-- identity, so the daily ingest job knows which games/results belong to it.
-- Null for the sports scored manually (PGA, Tennis, UFA).
alter table roster_entries add column external_id text;
alter table roster_entries add column external_league_id text;

comment on column roster_entries.external_id is 'api-sports.io team or player id';
comment on column roster_entries.external_league_id is 'api-sports.io league id this entry is tracked in (e.g. NFL, NCAA, Premier League)';
