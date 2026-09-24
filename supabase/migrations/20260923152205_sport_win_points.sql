-- Structured regular-season point values (win/draw/OTL), used by the ingest
-- job to score completed games. Null where a sport isn't a simple win-based
-- format (PGA, Tennis).
alter table sports add column points_per_win numeric;
alter table sports add column points_per_draw numeric;
alter table sports add column points_per_overtime_loss numeric;
