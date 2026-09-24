import { Stack } from 'expo-router';
import { PasswordGate } from '@/components/PasswordGate';

export default function RootLayout() {
  return (
    <PasswordGate>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="roster/[gmId]" options={{ title: 'Roster' }} />
      </Stack>
    </PasswordGate>
  );
}
