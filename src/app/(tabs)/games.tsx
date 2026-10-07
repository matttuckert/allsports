import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { refreshRecentScores } from '@/lib/refresh';
import { RosterGameRow } from '@/types/db';
import { SetupNotice } from '@/components/SetupNotice';
import { useHeaderRefresh } from '@/components/RefreshButton';
import { colors, getSportTheme } from '@/theme';
import { DropdownFilter } from '@/components/DropdownFilter';
import {
  ALL,
  DATE_PRESETS,
  DatePreset,
  EVENT_TYPE_OPTIONS,
  EventTypeFilter,
  dateRangeFor,
  formatGameDate,
  isPlacementReason,
  toDateOnly,
} from '@/lib/gameFilters';

interface GroupedGame {
  gameId: string;
  sportKey: string;
  homeName: string;
  homeScore: number | null;
  awayName: string;
  awayScore: number | null;
  status: string;
  startsAt: string | null;
  isStandingsResult: boolean;
  credits: { gmName: string; rosteredName: string; points: number; reason: string }[];
}

function fetchRosterGames() {
  return supabase.from('roster_games').select('*').order('starts_at', { ascending: false });
}

export default function GamesScreen() {
  const [rows, setRows] = useState<RosterGameRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState(ALL);
  const [gmFilter, setGmFilter] = useState(ALL);
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>('BOTH');

  const refreshInFlight = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    fetchRosterGames().then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull-to-refresh: checks for new scores (refreshRecentScores throttles
  // this to once an hour against the shared, server-side ingest_state --
  // not a per-device timer), then always reloads games from Supabase so a
  // refresh someone else triggered still shows up.
  const onRefresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    // A synchronous ref guard, not just the `refreshing` prop -- a fast
    // double-pull can land before React commits the refreshing state.
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    try {
      await refreshRecentScores();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      const { data, error } = await fetchRosterGames();
      if (error) setError(error.message);
      else setRows(data ?? []);
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, []);

  const allGames = useMemo<GroupedGame[]>(() => {
    const byId = new Map<string, GroupedGame>();
    for (const row of rows) {
      let game = byId.get(row.game_id);
      if (!game) {
        game = {
          gameId: row.game_id,
          sportKey: row.sport_key,
          homeName: row.home_name,
          homeScore: row.home_score,
          awayName: row.away_name,
          awayScore: row.away_score,
          status: row.status,
          startsAt: row.starts_at,
          isStandingsResult: row.is_standings_result,
          credits: [],
        };
        byId.set(row.game_id, game);
      }
      game.credits.push({
        gmName: row.gm_name,
        rosteredName: row.rostered_name,
        points: row.points,
        reason: row.reason,
      });
    }
    return Array.from(byId.values());
  }, [rows]);

  const sportOptions = useMemo(
    () =>
      Array.from(new Set(allGames.map((g) => g.sportKey)))
        .sort()
        .map((s) => ({ label: s, value: s })),
    [allGames]
  );
  const gmOptions = useMemo(
    () =>
      Array.from(new Set(allGames.flatMap((g) => g.credits.map((c) => c.gmName))))
        .sort()
        .map((gm) => ({ label: gm, value: gm })),
    [allGames]
  );

  const dateRange = useMemo(() => dateRangeFor(datePreset), [datePreset]);

  const games = useMemo(
    () =>
      allGames.filter((g) => {
        if (eventTypeFilter !== 'BOTH') {
          const isPostseasonResult =
            g.isStandingsResult || g.credits.some((c) => isPlacementReason(c.reason));
          if (eventTypeFilter === 'POSTSEASON' && !isPostseasonResult) return false;
          if (eventTypeFilter === 'REGULAR' && isPostseasonResult) return false;
        }
        if (sportFilter !== ALL && g.sportKey !== sportFilter) return false;
        if (gmFilter !== ALL && !g.credits.some((c) => c.gmName === gmFilter)) return false;
        if (dateRange && g.startsAt) {
          const gameDate = toDateOnly(new Date(g.startsAt));
          if (gameDate < dateRange[0] || gameDate > dateRange[1]) return false;
        }
        return true;
      }),
    [allGames, sportFilter, gmFilter, dateRange, eventTypeFilter]
  );

  useHeaderRefresh(onRefresh, loading, 'Refresh games');

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={games}
      keyExtractor={(item) => item.gameId}
      refreshing={loading}
      onRefresh={onRefresh}
      ListHeaderComponent={
        <View style={styles.filters}>
          <DropdownFilter
            label="League"
            allLabel="All Leagues"
            options={sportOptions}
            selected={sportFilter}
            onSelect={setSportFilter}
          />
          <DropdownFilter
            label="GM"
            allLabel="All GMs"
            options={gmOptions}
            selected={gmFilter}
            onSelect={setGmFilter}
          />
          <DropdownFilter
            label="Date"
            options={DATE_PRESETS.map((p) => ({ label: p.label, value: p.key }))}
            selected={datePreset}
            onSelect={(value) => setDatePreset(value as DatePreset)}
          />
          <DropdownFilter
            label="Event Type"
            options={EVENT_TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.key }))}
            selected={eventTypeFilter}
            onSelect={(value) => setEventTypeFilter(value as EventTypeFilter)}
          />
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <Text style={styles.empty}>{error ?? 'No games match these filters.'}</Text>
        ) : null
      }
      renderItem={({ item }) => {
        const theme = getSportTheme(item.sportKey);
        return (
        <View style={[styles.card, { borderLeftColor: theme.color }]}>
          <View style={styles.cardHeader}>
            <View style={styles.sportChip}>
              <Text style={styles.sport}>
                {theme.emoji} {item.sportKey}
              </Text>
            </View>
            <Text style={styles.date}>{formatGameDate(item.startsAt)}</Text>
          </View>
          {item.isStandingsResult ? (
            <Text style={styles.matchup}>🏆 {item.homeName} wins the table</Text>
          ) : (
            <Text style={styles.matchup}>
              {item.awayName} {item.awayScore ?? '-'} @ {item.homeName} {item.homeScore ?? '-'}
            </Text>
          )}
          {item.credits.map((credit) => (
            <Text key={`${credit.gmName}-${credit.rosteredName}`} style={styles.credit}>
              {credit.rosteredName} → {credit.gmName} +{credit.points}
            </Text>
          ))}
        </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  filters: { gap: 10, marginBottom: 4 },
  card: {
    padding: 14,
    borderRadius: 14,
    borderLeftWidth: 4,
    backgroundColor: colors.card,
    gap: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sportChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.chip,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sport: { fontSize: 12, fontWeight: '800', color: colors.text, textTransform: 'uppercase' },
  date: { fontSize: 12, color: colors.textMuted },
  matchup: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
  credit: { fontSize: 14, fontWeight: '500', color: '#374151' },
  empty: { textAlign: 'center', marginTop: 40, color: colors.textMuted },
});
