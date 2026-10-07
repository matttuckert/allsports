import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { refreshRecentScores } from '@/lib/refresh';
import { StandingRow } from '@/types/db';
import { SetupNotice } from '@/components/SetupNotice';
import { useHeaderRefresh } from '@/components/RefreshButton';
import { colors, rankBadge } from '@/theme';

function fetchStandings() {
  return supabase.from('standings').select('*');
}

export default function StandingsScreen() {
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    fetchStandings().then(({ data, error }) => {
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
  // not a per-device timer), then always reloads standings from Supabase so
  // a refresh someone else triggered still shows up.
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
      Alert.alert('Refresh failed', err instanceof Error ? err.message : String(err));
    } finally {
      const { data, error } = await fetchStandings();
      if (error) setError(error.message);
      else setRows(data ?? []);
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useHeaderRefresh(onRefresh, loading, 'Refresh standings');

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(item) => item.gm_id}
      refreshing={loading}
      onRefresh={onRefresh}
      ListEmptyComponent={
        !loading ? <Text style={styles.empty}>{error ?? 'No standings yet.'}</Text> : null
      }
      renderItem={({ item, index }) => {
        const badge = rankBadge(index);
        return (
        <Pressable
          style={[styles.row, { borderLeftColor: badge.accent }]}
          onPress={() =>
            router.push({
              pathname: '/roster/[gmId]',
              params: { gmId: item.gm_id, gmName: item.gm_name },
            })
          }
        >
          <Text style={[styles.rank, badge.isMedal && styles.medal]}>{badge.label}</Text>
          <Text style={styles.name}>{item.gm_name}</Text>
          <View style={styles.pointsPill}>
            <Text style={styles.points}>{item.total_points}</Text>
          </View>
        </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderLeftWidth: 4,
    backgroundColor: colors.card,
    gap: 12,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rank: { width: 32, fontWeight: '800', color: colors.textMuted, textAlign: 'center' },
  medal: { fontSize: 22 },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  pointsPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.chip,
  },
  points: { fontSize: 16, fontWeight: '800', color: colors.text },
  empty: { textAlign: 'center', marginTop: 40, color: colors.textMuted },
});
