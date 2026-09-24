-- EPL has no playoff bracket -- the champion is whoever tops the table once
-- every team has played 38 games. That's recorded as a synthetic "game" row
-- (there's no real head-to-head event to attach it to), flagged so the app
-- can tell it apart from an actual played game.
alter table games add column is_standings_result boolean not null default false;

drop view roster_games;
create view roster_games as
select
  gm.id as game_id,
  gm.sport_key,
  gm.season,
  gm.stage,
  gm.starts_at,
  gm.status,
  gm.is_standings_result,
  gm.home_name,
  gm.home_score,
  gm.away_name,
  gm.away_score,
  gp.roster_entry_id,
  gp.points,
  gp.reason,
  re.gm_id,
  g.name as gm_name,
  re.name as rostered_name
from games gm
join game_points gp on gp.game_id = gm.id
join roster_entries re on re.id = gp.roster_entry_id
join gms g on g.id = re.gm_id;

alter view roster_games set (security_invoker = true);
