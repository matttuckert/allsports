-- service_role needs full access (seeding, daily ingest, manual entry).
-- anon needs read access to the tables/views the app queries directly
-- (RLS policies from the previous migration further restrict anon to
-- select-only; this grants the base table-level privilege they filter).

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select on all tables in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;
