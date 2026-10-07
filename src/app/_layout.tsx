import { Stack } from 'expo-router';
import { PasswordGate } from '@/components/PasswordGate';
import { HalloweenOverlay } from '@/components/HalloweenOverlay';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <PasswordGate>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="roster/[gmId]" options={{ title: 'Roster' }} />
        <Stack.Screen name="team/[entryId]" options={{ title: 'Team' }} />
      </Stack>
      <HalloweenOverlay />
    </PasswordGate>
  );
}
