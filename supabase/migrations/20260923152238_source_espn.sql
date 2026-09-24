-- We switched the automated ingest source from api-sports.io to ESPN's free
-- scoreboard endpoints (see project notes) -- update the allowed values.
alter table games drop constraint games_source_check;
alter table games add constraint games_source_check check (source in ('espn', 'manual'));
