import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { RosterEntryPointsRow } from '@/types/db';
import { SportKey } from '@/types/scoring';
import { SetupNotice } from '@/components/SetupNotice';
import { useHeaderRefresh } from '@/components/RefreshButton';
import { colors, getSportTheme, rankBadge } from '@/theme';

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

  useHeaderRefresh(onRefresh, loading, 'Refresh league results');

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
          const theme = getSportTheme(key);
          return (
            <Pressable
              key={key}
              onPress={() => setLeague(key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {theme.emoji} {key}
              </Text>
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
        renderItem={({ item, index }) => {
          const badge = rankBadge(index);
          return (
          <Pressable
            style={[styles.row, { borderLeftColor: getSportTheme(league).color }]}
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
            <Text style={[styles.rank, badge.isMedal && styles.medal]}>{badge.label}</Text>
            <View style={styles.nameColumn}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.gmName}>{item.gm_name}</Text>
            </View>
            <View style={styles.pointsPill}>
              <Text style={styles.points}>{item.total_points}</Text>
            </View>
          </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.text },
  tabTextActive: { color: '#fff' },
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
  nameColumn: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  gmName: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  pointsPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.chip,
  },
  points: { fontSize: 16, fontWeight: '800', color: colors.text },
  empty: { textAlign: 'center', marginTop: 40, color: colors.textMuted },
});
