import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { RosterGameRow } from '@/types/db';
import { SetupNotice } from '@/components/SetupNotice';
import { useHeaderRefresh } from '@/components/RefreshButton';
import { DropdownFilter } from '@/components/DropdownFilter';
import { colors, getSportTheme } from '@/theme';
import {
  DATE_PRESETS,
  DatePreset,
  EVENT_TYPE_OPTIONS,
  EventTypeFilter,
  dateRangeFor,
  formatGameDate,
  isPlacementReason,
  toDateOnly,
} from '@/lib/gameFilters';

function fetchTeamGames(entryId: string) {
  return supabase
    .from('roster_games')
    .select('*')
    .eq('roster_entry_id', entryId)
    .order('starts_at', { ascending: false });
}

function formatReason(reason: string): string {
  return reason.replace(/_/g, ' ');
}

export default function TeamScreen() {
  const { entryId, name, sportKey, gmName } = useLocalSearchParams<{
    entryId: string;
    name?: string;
    sportKey?: string;
    gmName?: string;
  }>();
  const [rows, setRows] = useState<RosterGameRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>('BOTH');

  useEffect(() => {
    if (!isSupabaseConfigured || !entryId) return;
    let cancelled = false;
    fetchTeamGames(entryId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const onRefresh = useCallback(() => {
    if (!isSupabaseConfigured || !entryId) return;
    setLoading(true);
    fetchTeamGames(entryId).then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows(data ?? []);
      setLoading(false);
    });
  }, [entryId]);

  const dateRange = useMemo(() => dateRangeFor(datePreset), [datePreset]);

  const games = useMemo(
    () =>
      rows.filter((g) => {
        if (eventTypeFilter !== 'BOTH') {
          const isPostseasonResult = g.is_standings_result || isPlacementReason(g.reason);
          if (eventTypeFilter === 'POSTSEASON' && !isPostseasonResult) return false;
          if (eventTypeFilter === 'REGULAR' && isPostseasonResult) return false;
        }
        if (dateRange && g.starts_at) {
          const gameDate = toDateOnly(new Date(g.starts_at));
          if (gameDate < dateRange[0] || gameDate > dateRange[1]) return false;
        }
        return true;
      }),
    [rows, dateRange, eventTypeFilter]
  );

  const totalPoints = useMemo(() => games.reduce((sum, g) => sum + g.points, 0), [games]);

  useHeaderRefresh(onRefresh, loading, 'Refresh team games');

  if (!isSupabaseConfigured) return <SetupNotice />;

  const gm = gmName ?? rows[0]?.gm_name;
  const theme = getSportTheme(sportKey ?? rows[0]?.sport_key ?? '');

  return (
    <>
      <Stack.Screen options={{ title: name ?? rows[0]?.rostered_name ?? 'Team' }} />
      <FlatList
        contentContainerStyle={styles.list}
        data={games}
        keyExtractor={(item) => item.game_id}
        refreshing={loading}
        onRefresh={onRefresh}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.summary, { borderLeftColor: theme.color }]}>
              <Text style={styles.summaryTitle}>
                {theme.emoji} {name ?? rows[0]?.rostered_name ?? 'Team'}
              </Text>
              {gm ? <Text style={styles.summaryGm}>GM: {gm}</Text> : null}
              <Text style={styles.summarySub}>
                {games.length} {games.length === 1 ? 'game' : 'games'} · {totalPoints} pts
              </Text>
            </View>
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
        renderItem={({ item }) => (
          <View style={[styles.card, { borderLeftColor: theme.color }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.date}>{formatGameDate(item.starts_at)}</Text>
              <View style={styles.pointsPill}>
                <Text style={styles.points}>+{item.points}</Text>
              </View>
            </View>
            {item.is_standings_result ? (
              <Text style={styles.matchup}>🏆 {item.home_name} wins the table</Text>
            ) : (
              <Text style={styles.matchup}>
                {item.away_name} {item.away_score ?? '-'} @ {item.home_name}{' '}
                {item.home_score ?? '-'}
              </Text>
            )}
            <Text style={styles.reason}>{formatReason(item.reason)}</Text>
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  header: { gap: 10, marginBottom: 4 },
  summary: {
    padding: 16,
    borderRadius: 14,
    borderLeftWidth: 4,
    backgroundColor: colors.card,
    gap: 2,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  summaryGm: { fontSize: 15, fontWeight: '600', color: colors.text },
  summarySub: { fontSize: 14, color: colors.textMuted },
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 12, color: colors.textMuted },
  pointsPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.chip,
  },
  points: { fontSize: 13, fontWeight: '800', color: colors.text },
  matchup: { fontSize: 16, fontWeight: '700', color: colors.text },
  reason: { fontSize: 13, fontWeight: '500', color: colors.textMuted, textTransform: 'capitalize' },
  empty: { textAlign: 'center', marginTop: 40, color: colors.textMuted },
});
