import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { refreshRecentScores } from '@/lib/refresh';
import { RosterGameRow } from '@/types/db';
import { SetupNotice } from '@/components/SetupNotice';

const ALL = 'ALL';

type DatePreset = 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30';

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'LAST_7', label: 'Last 7 days' },
  { key: 'LAST_30', label: 'Last 30 days' },
];

// A "postseason result" is any credit carrying a placement bonus (reaching
// the championship/semifinal/quarterfinal, across MLB/WNBA/CFB/NFL/NHL) or
// the EPL table-champion entry -- not just games tagged is_standings_result,
// which only ever applies to that one EPL case.
type EventTypeFilter = 'BOTH' | 'REGULAR' | 'POSTSEASON';

const EVENT_TYPE_OPTIONS: { key: EventTypeFilter; label: string }[] = [
  { key: 'BOTH', label: 'All' },
  { key: 'REGULAR', label: 'Regular Games' },
  { key: 'POSTSEASON', label: 'Postseason Results' },
];

function isPlacementReason(reason: string): boolean {
  return (
    reason.includes('championship') ||
    reason.includes('semifinal_exit') ||
    reason.includes('quarterfinal_exit') ||
    reason === 'table_champion'
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

// Local time, not UTC -- a late-night US game (e.g. Sunday Night Football)
// falls on the next UTC day, which would otherwise show/filter as the wrong
// date for everyone watching in a US timezone.
function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number): Date {
  const d = toDateOnly(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

function formatGameDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function DropdownFilter({
  label,
  allLabel,
  options,
  selected,
  onSelect,
}: {
  label: string;
  allLabel?: string;
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const allOptions = allLabel ? [{ label: allLabel, value: ALL }, ...options] : options;
  const selectedLabel = allOptions.find((o) => o.value === selected)?.label ?? selected;

  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <Pressable style={styles.dropdownWrapper} onPress={() => setOpen(true)}>
        <Text style={styles.dropdownValue} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#18181B" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <FlatList
              data={allOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalOption}
                  onPress={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      item.value === selected && styles.modalOptionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.value === selected && (
                    <Ionicons name="checkmark" size={18} color="#18181B" />
                  )}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
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

  const dateRange = useMemo((): [Date, Date] | null => {
    switch (datePreset) {
      case 'TODAY':
        return [daysAgo(0), daysAgo(0)];
      case 'YESTERDAY':
        return [daysAgo(1), daysAgo(1)];
      case 'LAST_7':
        return [daysAgo(7), daysAgo(0)];
      case 'LAST_30':
        return [daysAgo(30), daysAgo(0)];
      case 'ALL':
      default:
        return null;
    }
  }, [datePreset]);

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
          {Platform.OS === 'web' && (
            // react-native-web's RefreshControl is a no-op, so pull-to-refresh
            // never fires in the browser -- this button is the only way to
            // trigger onRefresh there.
            <Pressable
              style={styles.refreshButton}
              onPress={onRefresh}
              disabled={loading}
              accessibilityLabel="Refresh games"
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#18181B" />
              ) : (
                <Ionicons name="refresh" size={20} color="#18181B" />
              )}
            </Pressable>
          )}
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
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sport}>{item.sportKey}</Text>
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
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  filters: { gap: 10, marginBottom: 4 },
  refreshButton: {
    alignSelf: 'flex-end',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
  },
  filterRow: { gap: 6 },
  filterLabel: { fontSize: 12, fontWeight: '700', color: '#71717A', textTransform: 'uppercase' },
  dropdownWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownValue: { fontSize: 16, color: '#18181B', flexShrink: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#71717A',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  modalOptionText: { fontSize: 16, color: '#18181B' },
  modalOptionTextSelected: { fontWeight: '700' },
  card: { padding: 14, borderRadius: 12, backgroundColor: '#F4F4F5', gap: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sport: { fontSize: 12, fontWeight: '700', color: '#71717A', textTransform: 'uppercase' },
  date: { fontSize: 12, color: '#A1A1AA' },
  matchup: { fontSize: 16, fontWeight: '600' },
  credit: { fontSize: 14, color: '#3F3F46' },
  empty: { textAlign: 'center', marginTop: 40, color: '#71717A' },
});
