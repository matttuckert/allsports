-- A device still running a stale app build (before the client enforced
-- tracking_start_date) sent a historical lookback for every sport, which
-- slipped WNBA/MLB games dated before their tracking_start_date (2026-09-23)
-- past the edge function -- it only enforced "never today" server-side, not
-- the per-sport floor. Removing those, and the edge function now enforces
-- the floor too (see supabase/functions/daily-ingest).
delete from games
where sport_key in ('WNBA', 'MLB')
  and starts_at < '2026-09-23T00:00:00Z';
