import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, T } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { spacing, useTheme } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

/** Optional sign in / sign up. An account is only used to sync saved articles. */
export function AccountScreen({ navigation }: Props) {
  const { fg, bg } = useTheme();
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = { borderWidth: 2, borderColor: fg, color: fg, backgroundColor: bg, fontSize: 17, paddingHorizontal: spacing.md, paddingVertical: 10 } as const;
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= (mode === 'register' ? 10 : 1);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await auth.login(email.trim(), password);
      else await auth.register(email.trim(), password);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
          <Chip label="Sign in" selected={mode === 'login'} onPress={() => setMode('login')} />
          <Chip label="Create account" selected={mode === 'register'} onPress={() => setMode('register')} />
        </View>
        <T variant="meta" style={{ marginBottom: spacing.xs }}>
          Email
        </T>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Email"
          selectionColor={fg}
          cursorColor={fg}
          style={input}
        />
        <T variant="meta" style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
          Password{mode === 'register' ? ' (at least 10 characters)' : ''}
        </T>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          textContentType={mode === 'login' ? 'password' : 'newPassword'}
          accessibilityLabel="Password"
          selectionColor={fg}
          cursorColor={fg}
          style={input}
          onSubmitEditing={() => valid && !busy && void submit()}
        />
        {error ? (
          <View style={{ borderWidth: 2, borderColor: fg, padding: spacing.md, marginTop: spacing.md }} accessibilityLiveRegion="assertive">
            <T style={{ fontWeight: '700' }}>{error}</T>
          </View>
        ) : null}
        <Button
          label={busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          onPress={() => void submit()}
          disabled={!valid || busy}
          style={{ marginTop: spacing.lg }}
        />
        <T variant="small" style={{ marginTop: spacing.lg }}>
          An account is optional. It only keeps your saved articles in sync between devices. We store your email and a hashed
          password, nothing else.
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
