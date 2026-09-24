-- UFA's data comes from backend.ufastats.com, not ESPN -- track that
-- accurately rather than lumping it under 'espn'.
alter table games drop constraint games_source_check;
alter table games add constraint games_source_check check (source in ('espn', 'ufastats', 'manual'));
