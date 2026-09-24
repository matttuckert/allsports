import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { RosterEntryPointsRow } from '@/types/db';
import { SportKey } from '@/types/scoring';
import { SetupNotice } from '@/components/SetupNotice';

const LEAGUES: SportKey[] = [
  'NFL',
  'NBA',
  'MLB',
  'NHL',
  'EPL',
  'WNBA',
  'CFB',
  'PGA',
  'UFA',
  'TENNIS',
];

function fetchLeagueResults(sportKey: SportKey) {
  return supabase
    .from('roster_entry_points')
    .select('*')
    .eq('sport_key', sportKey)
    .order('total_points', { ascending: false });
}

export default function LeaguesScreen() {
  const [league, setLeague] = useState<SportKey>('NFL');
  const [rows, setRows] = useState<RosterEntryPointsRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    fetchLeagueResults(league).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [league]);

  const onRefresh = useCallback(() => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    fetchLeagueResults(league).then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows(data ?? []);
      setLoading(false);
    });
  }, [league]);

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {LEAGUES.map((key) => {
          const active = key === league;
          return (
            <Pressable
              key={key}
              onPress={() => setLeague(key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{key}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(item) => item.roster_entry_id}
        refreshing={loading}
        onRefresh={onRefresh}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>{error ?? 'No results yet.'}</Text> : null
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.nameColumn}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.gmName}>{item.gm_name}</Text>
            </View>
            <Text style={styles.points}>{item.total_points}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#E4E4E7' },
  tabBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: '#18181B' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#3F3F46' },
  tabTextActive: { color: '#fff' },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    gap: 12,
  },
  rank: { width: 24, fontWeight: '700', color: '#71717A' },
  nameColumn: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  gmName: { fontSize: 13, color: '#71717A', marginTop: 2 },
  points: { fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, color: '#71717A' },
});
