import { StyleSheet, Text, View } from 'react-native';

export function SetupNotice() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Supabase isn&apos;t configured yet</Text>
      <Text style={styles.body}>
        Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to a .env
        file (see .env.example), then reload the app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  body: { textAlign: 'center', color: '#71717A' },
});
