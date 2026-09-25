import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { refreshRecentScores } from '@/lib/refresh';
import { StandingRow } from '@/types/db';
import { SetupNotice } from '@/components/SetupNotice';

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

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(item) => item.gm_id}
      refreshing={loading}
      onRefresh={onRefresh}
      ListHeaderComponent={
        Platform.OS === 'web' ? (
          // react-native-web's RefreshControl is a no-op, so pull-to-refresh
          // never fires in the browser -- this button is the only way to
          // trigger onRefresh there.
          <Pressable
            style={styles.refreshButton}
            onPress={onRefresh}
            disabled={loading}
            accessibilityLabel="Refresh standings"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#18181B" />
            ) : (
              <Ionicons name="refresh" size={20} color="#18181B" />
            )}
          </Pressable>
        ) : null
      }
      ListEmptyComponent={
        !loading ? <Text style={styles.empty}>{error ?? 'No standings yet.'}</Text> : null
      }
      renderItem={({ item, index }) => (
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: '/roster/[gmId]',
              params: { gmId: item.gm_id, gmName: item.gm_name },
            })
          }
        >
          <Text style={styles.rank}>{index + 1}</Text>
          <Text style={styles.name}>{item.gm_name}</Text>
          <Text style={styles.points}>{item.total_points}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  refreshButton: {
    alignSelf: 'flex-end',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    gap: 12,
  },
  rank: { width: 24, fontWeight: '700', color: '#71717A' },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  points: { fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, color: '#71717A' },
});
