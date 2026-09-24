import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const APP_PASSWORD = process.env.EXPO_PUBLIC_APP_PASSWORD;

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session && Platform.OS === 'web') {
        // Web has no password screen to trigger the anonymous sign-in RLS
        // requires, so do it silently on load instead.
        const { error: signInError } = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (signInError) setError(signInError.message);
        setCheckingSession(false);
        return;
      }
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async () => {
    if (!APP_PASSWORD) {
      setError('App password not configured.');
      return;
    }
    if (password !== APP_PASSWORD) {
      setError('Wrong password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) setError(signInError.message);
    setSubmitting(false);
  };

  if (!isSupabaseConfigured) return <>{children}</>;

  if (checkingSession) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session) return <>{children}</>;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Unable to load.'}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>All Sports League</Text>
      <Text style={styles.subtitle}>Enter the password to continue</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setError(null);
        }}
        placeholder="Password"
        placeholderTextColor="#A1A1AA"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Enter</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
  },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, color: '#71717A', marginBottom: 8 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#18181B',
  },
  error: { color: '#DC2626', fontSize: 14 },
  button: {
    width: '100%',
    backgroundColor: '#18181B',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
