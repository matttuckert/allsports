-- Correction: tennis should not be backfilled (this year's already-completed
-- majors don't count) -- only tracked from today forward, same policy as
-- MLB/NBA/NHL/WNBA.
update sports set tracking_start_date = '2026-09-23' where key = 'TENNIS';
