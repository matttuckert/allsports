-- Tennis: 1 point per Grand Slam match won (reuses points_per_win, same as
-- every other sport), plus a one-time 25-point bonus for winning the whole
-- Slam (on top of the championship placement bonus -- additive, like
-- everything else). Non-Slam tour events and qualifying rounds score 0.
alter table sports add column slam_win_bonus numeric;

update sports
set points_per_win = 1,
    slam_win_bonus = 25,
    tracking_start_date = '2026-01-01'
where key = 'TENNIS';
