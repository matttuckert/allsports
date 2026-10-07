import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { RosterEntryPointsRow } from '@/types/db';
import { SetupNotice } from '@/components/SetupNotice';
import { useHeaderRefresh } from '@/components/RefreshButton';
import { colors, getSportTheme } from '@/theme';

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

  useHeaderRefresh(onRefresh, loading, 'Refresh roster');

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <>
      <Stack.Screen options={{ title: gmName ?? 'Roster' }} />
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item) => item.roster_entry_id}
        refreshing={loading}
        onRefresh={onRefresh}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>{error ?? 'No roster found.'}</Text> : null
        }
        renderItem={({ item }) => {
          const theme = getSportTheme(item.sport_key);
          return (
            <Pressable
              style={[styles.row, { borderLeftColor: theme.color }]}
              onPress={() =>
                router.push({
                  pathname: '/team/[entryId]',
                  params: {
                    entryId: item.roster_entry_id,
                    name: item.name,
                    sportKey: item.sport_key,
                    gmName: item.gm_name,
                  },
                })
              }
            >
              <View style={styles.sportChip}>
                <Text style={styles.sport}>
                  {theme.emoji} {item.sport_key}
                </Text>
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.points}>{item.total_points}</Text>
            </Pressable>
          );
        }}
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
  sportChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.chip,
  },
  sport: { fontSize: 12, fontWeight: '800', color: colors.text },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  points: { fontSize: 18, fontWeight: '800', color: colors.text },
  empty: { textAlign: 'center', marginTop: 40, color: colors.textMuted },
});
