-- Gate the whole app (and the database) behind a shared password. There's no
-- per-user login -- everyone who enters the password gets an anonymous
-- Supabase Auth session, and that's now required to read anything. Without
-- it, the anon key alone (which ships in the app bundle and is effectively
-- public) can't read any table.
drop policy "public read" on sports;
drop policy "public read" on gms;
drop policy "public read" on roster_entries;
drop policy "public read" on games;
drop policy "public read" on game_points;
drop policy "public read" on ingest_state;

create policy "authenticated read" on sports for select using (auth.role() = 'authenticated');
create policy "authenticated read" on gms for select using (auth.role() = 'authenticated');
create policy "authenticated read" on roster_entries for select using (auth.role() = 'authenticated');
create policy "authenticated read" on games for select using (auth.role() = 'authenticated');
create policy "authenticated read" on game_points for select using (auth.role() = 'authenticated');
create policy "authenticated read" on ingest_state for select using (auth.role() = 'authenticated');

-- Views run as their owner by default, which would silently bypass the RLS
-- policies above. security_invoker makes them run as the querying role
-- instead, so the same auth check actually applies to standings/games too.
alter view standings set (security_invoker = true);
alter view roster_entry_points set (security_invoker = true);
alter view roster_games set (security_invoker = true);
