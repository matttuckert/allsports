import { useLayoutEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

// pull-to-refresh never fires in the browser and this button is the only way
// to trigger a refresh there.
function RefreshButton({
  onPress,
  loading,
  label,
}: {
  onPress: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      disabled={loading}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="refresh" size={16} color={colors.primary} />
      )}
      <Text style={styles.text}>{loading ? 'Refreshing' : 'Refresh'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRight: { marginRight: 12 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: { opacity: 0.7 },
  text: { fontSize: 13, fontWeight: '700', color: colors.text },
});

// Web-only: react-native-web's RefreshControl is a no-op, so pull-to-refresh
// never fires in the browser and this header button is the only way to
// trigger a refresh there.
export function useHeaderRefresh(onRefresh: () => void, loading: boolean, label: string) {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <RefreshButton onPress={onRefresh} loading={loading} label={label} />
        </View>
      ),
    });
  }, [navigation, onRefresh, loading, label]);
}
