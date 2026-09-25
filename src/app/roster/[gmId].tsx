import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { RosterEntryPointsRow } from '@/types/db';
import { SetupNotice } from '@/components/SetupNotice';

function fetchRoster(gmId: string) {
  return supabase
    .from('roster_entry_points')
    .select('*')
    .eq('gm_id', gmId)
    .order('total_points', { ascending: false });
}

export default function RosterScreen() {
  const { gmId, gmName } = useLocalSearchParams<{ gmId: string; gmName?: string }>();
  const [rows, setRows] = useState<RosterEntryPointsRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !gmId) return;
    let cancelled = false;
    fetchRoster(gmId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [gmId]);

  const onRefresh = useCallback(() => {
    if (!isSupabaseConfigured || !gmId) return;
    setLoading(true);
    fetchRoster(gmId).then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows(data ?? []);
      setLoading(false);
    });
  }, [gmId]);

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <>
      <Stack.Screen
        options={{
          title: gmName ?? 'Roster',
          // react-native-web's RefreshControl is a no-op, so pull-to-refresh
          // never fires in the browser -- this button is the only way to
          // trigger onRefresh there.
          headerRight:
            Platform.OS === 'web'
              ? () => (
                  <Pressable
                    onPress={onRefresh}
                    disabled={loading}
                    accessibilityLabel="Refresh roster"
                    accessibilityRole="button"
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#18181B" />
                    ) : (
                      <Ionicons name="refresh" size={22} color="#18181B" />
                    )}
                  </Pressable>
                )
              : undefined,
        }}
      />
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item) => item.roster_entry_id}
        refreshing={loading}
        onRefresh={onRefresh}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>{error ?? 'No roster found.'}</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.sport}>{item.sport_key}</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.points}>{item.total_points}</Text>
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    gap: 12,
  },
  sport: { width: 60, fontSize: 12, fontWeight: '700', color: '#71717A' },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  points: { fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, color: '#71717A' },
});
