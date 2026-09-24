-- Policy: only NFL, CFB, and EPL get historical backfill. WNBA and MLB (and
-- any other non-backfilled sport) should only accumulate games from the day
-- the ingest job actually processes them going forward -- never backfilled,
-- and never including the current day (today's games aren't fetched at all,
-- to avoid ever ingesting a game before it's fully final). A few WNBA/MLB
-- games slipped in during testing before this policy was settled; remove
-- them (game_points cascades via its games_id foreign key).
delete from games where sport_key in ('WNBA', 'MLB');
